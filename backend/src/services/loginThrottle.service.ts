import prisma from "../config/prisma";
import { requireSetting, SecuritySettings } from "./settings.service";

// Failed sign-ins (client requirements of 6 Nov 2026), kept in the database
// so neither a page refresh, another browser nor an API restart resets them.
//
// - Per account: `loginAccountMax` failures within `loginWindowMinutes`
//   → wait `loginLockMinutes`. Every further lock doubles the wait, up to
//   `loginLockMaxHours`. 24 hours without a failure forgets the earlier locks.
// - Admin accounts: `adminLoginMax` failures, the same growing wait but only
//   up to `adminLockMaxMinutes`, so nobody can lock the Founder out for long;
//   an unlock code emailed to the account clears it at once.
// - Per network (IP): `loginIpMax` failures, generous because a whole class
//   on school Wi-Fi shares one IP.
// Unknown emails count too, so a lock never reveals which emails exist.
// Successful sign-ins never count; one clears the account's failures.

const FORGET_LOCKS_AFTER_MS = 24 * 60 * 60 * 1000;

export const accountKey = (email: string) => `account:${email.trim().toLowerCase()}`;
export const ipThrottleKey = (ip: string) => `ip:${ip}`;

export interface LockInfo {
  lockedUntil: Date;
  // Whole seconds left (at least 1)
  retryAfter: number;
}

/** The latest lock among these keys that is still running, or null. */
export const activeLock = async (keys: string[]): Promise<LockInfo | null> => {
  const rows = await prisma.loginThrottle.findMany({ where: { key: { in: keys }, lockedUntil: { gt: new Date() } }, select: { lockedUntil: true } });
  const until = rows.map((r) => r.lockedUntil!.getTime()).sort((a, b) => b - a)[0];
  return until ? { lockedUntil: new Date(until), retryAfter: Math.max(1, Math.ceil((until - Date.now()) / 1000)) } : null;
};

interface Rule {
  max: number;
  windowMinutes: number;
  lockMinutes: number;
  maxLockMinutes: number;
}

export const loginRules = (s: SecuritySettings, isAdmin: boolean): { account: Rule; ip: Rule } => ({
  account: {
    max: isAdmin ? s.adminLoginMax : s.loginAccountMax,
    windowMinutes: s.loginWindowMinutes,
    lockMinutes: s.loginLockMinutes,
    maxLockMinutes: isAdmin ? s.adminLockMaxMinutes : s.loginLockMaxHours * 60,
  },
  ip: { max: s.loginIpMax, windowMinutes: s.loginWindowMinutes, lockMinutes: s.loginLockMinutes, maxLockMinutes: s.loginLockMaxHours * 60 },
});

/**
 * Counts one failure for `key`. Returns the new lock if this failure started
 * one, and how many tries are left before the next lock otherwise.
 * The row is locked inside the transaction (a no-op update first), so two
 * failures at once can't both slip under the limit.
 */
export const recordFailure = async (key: string, rule: Rule): Promise<{ lock: LockInfo | null; triesLeft: number }> => {
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const row = await tx.loginThrottle.upsert({
      where: { key },
      create: { key, failures: 0, windowStart: now, lastFailureAt: now },
      update: { failures: { increment: 0 } },
    });
    const level = now.getTime() - row.lastFailureAt.getTime() > FORGET_LOCKS_AFTER_MS ? 0 : row.lockLevel;
    const windowOver = now.getTime() - row.windowStart.getTime() > rule.windowMinutes * 60_000;
    const failures = (windowOver || row.failures === 0 ? 0 : row.failures) + 1;
    const windowStart = windowOver || row.failures === 0 ? now : row.windowStart;

    if (failures >= rule.max) {
      const waitMinutes = Math.min(rule.lockMinutes * 2 ** level, rule.maxLockMinutes);
      const lockedUntil = new Date(now.getTime() + waitMinutes * 60_000);
      await tx.loginThrottle.update({ where: { key }, data: { failures: 0, windowStart: now, lockedUntil, lockLevel: level + 1, lastFailureAt: now } });
      return { lock: { lockedUntil, retryAfter: waitMinutes * 60 }, triesLeft: 0 };
    }
    await tx.loginThrottle.update({ where: { key }, data: { failures, windowStart, lockLevel: level, lastFailureAt: now } });
    return { lock: null, triesLeft: rule.max - failures };
  });
};

/** A failed sign-in: counts it for the account and the network. */
export const recordLoginFailure = async (email: string, ip: string, isAdmin: boolean) => {
  const rules = loginRules(await requireSetting("security"), isAdmin);
  const [account, network] = await Promise.all([recordFailure(accountKey(email), rules.account), recordFailure(ipThrottleKey(ip), rules.ip)]);
  const locks = [account.lock, network.lock].filter((l): l is LockInfo => l !== null).sort((a, b) => b.retryAfter - a.retryAfter);
  return { lock: locks[0] ?? null, accountLocked: account.lock !== null, triesLeft: account.triesLeft };
};

/** After a right password, a password reset or an unlock code: forget the account's failures and lock. */
export const clearAccount = (email: string) => prisma.loginThrottle.deleteMany({ where: { key: accountKey(email) } });
export const clearNetwork = (ip: string) => prisma.loginThrottle.deleteMany({ where: { key: ipThrottleKey(ip) } });

/** For the admin's user page: is this account locked, and how many recent failures. */
export const accountStatus = async (email: string) => {
  const row = await prisma.loginThrottle.findUnique({ where: { key: accountKey(email) } });
  if (!row) return { locked: false, lockedUntil: null, failures: 0 };
  const locked = Boolean(row.lockedUntil && row.lockedUntil > new Date());
  return { locked, lockedUntil: locked ? row.lockedUntil : null, failures: row.failures };
};

// Housekeeping (maintenance sweep): counters idle for a day with no pause running.
export const pruneLoginThrottles = () =>
  prisma.loginThrottle.deleteMany({
    where: { lastFailureAt: { lt: new Date(Date.now() - FORGET_LOCKS_AFTER_MS) }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: new Date() } }] },
  });

// "14 minutes", "2 hours", "1 hour 30 minutes"
export const waitText = (seconds: number) => {
  const mins = Math.max(1, Math.ceil(seconds / 60));
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"}`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h} hour${h === 1 ? "" : "s"}${m ? ` ${m} minute${m === 1 ? "" : "s"}` : ""}`;
};
