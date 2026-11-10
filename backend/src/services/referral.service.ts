import crypto from "crypto";
import { Prisma, ReferralStatus } from "@prisma/client";
import prisma from "../config/prisma";
import { AppError } from "../utils/AppError";
import { istDayEnd, istDayKey } from "../utils/istDate";
import { applyCoinChange, refreshCoins } from "./coin.service";
import { accessState } from "./consent.service";
import { notifyUser } from "./notification.service";
import { requireSetting } from "./settings.service";

// Refer and Earn (client requirements of 6 Nov 2026). Every rule is here.
//
// - Each student has a code; the link is /register?ref=CODE.
// - A referral is recorded when the friend signs up through it (PENDING) and
//   settled when their email is verified (a Google sign-up is verified at once).
// - Coins go through applyCoinChange, so they expire like all coins (90 days).
// - Each email earns a reward once, ever (a hash survives account erasure).
// - Anything suspicious waits for the Founder (HELD) instead of paying out:
//   the inviter's own device or network, many sign-ups from one network or
//   device, over the inviter's daily limit, or an inviter under 18 still waiting
//   for a parent. Nothing pays out without a verified email.

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I
const CODE_LENGTH = 8;
// A referral can only be attached to an account this new (a Google sign-up)
const NEW_ACCOUNT_MINUTES = 30;
const SIGNAL_WINDOW_DAYS = 30;

const newCode = () => Array.from(crypto.randomBytes(CODE_LENGTH), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
export const normaliseCode = (code: string) => code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Same person, same hash: case, "+tags" and Gmail's dots don't make a new email. */
export const emailHash = (email: string) => {
  const [rawLocal, rawDomain = ""] = email.trim().toLowerCase().split("@");
  let domain = rawDomain;
  let local = rawLocal.split("+")[0];
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return crypto.createHash("sha256").update(`${local}@${domain}`).digest("hex");
};

const firstName = (name: string | null) => name?.trim().split(/\s+/)[0] || "A friend";

/** The student's code, made on first use. */
export const ensureReferralCode = async (userId: string) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { referralCode: true } });
  if (user.referralCode) return user.referralCode;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    const set = await prisma.user.updateMany({ where: { id: userId, referralCode: null }, data: { referralCode: code } }).catch((err) => {
      if ((err as { code?: string }).code === "P2002") return null; // taken: try another
      throw err;
    });
    if (set === null) continue;
    return (await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { referralCode: true } })).referralCode!;
  }
  throw new AppError(503, "Couldn't make your code. Please try again.");
};

// ---- The student's Refer page ----------------------------------------------------------

export const STATUS_WORDS: Record<ReferralStatus, string> = {
  PENDING: "Waiting for them to verify their email",
  REWARDED: "Coins added",
  HELD: "Being checked by our team",
  REJECTED: "No coins for this one",
  REVERSED: "Coins taken back",
};

export const referralOverview = async (userId: string, seen: { ip: string | null; deviceId: string | null }) => {
  const settings = await requireSetting("referral");
  const coins = await requireSetting("coins");
  // Where the inviter opens this page from: a friend signing up from the same
  // device or network may be the inviter themselves.
  await prisma.user.update({ where: { id: userId }, data: { referralSeenIp: seen.ip, ...(seen.deviceId ? { referralSeenDevice: seen.deviceId } : {}) } });
  const code = settings.enabled ? await ensureReferralCode(userId) : null;
  const rows = await prisma.referral.findMany({
    where: { referrerId: userId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, status: true, coinsReferrer: true, createdAt: true, referred: { select: { name: true, status: true } } },
  });
  const rewarded = rows.filter((r) => r.status === "REWARDED");
  return {
    enabled: settings.enabled,
    code,
    coinsPerReferral: settings.coinsPerReferral,
    friendCoins: settings.friendCoins,
    validityDays: coins.validityDays,
    totals: {
      joined: rows.length,
      rewarded: rewarded.length,
      coinsEarned: rewarded.reduce((sum, r) => sum + r.coinsReferrer, 0),
      waiting: rows.filter((r) => r.status === "PENDING" || r.status === "HELD").length,
    },
    history: rows.map((r) => ({
      id: r.id,
      friend: r.referred.status === "DELETED" ? "Deleted account" : firstName(r.referred.name),
      status: r.status,
      statusText: STATUS_WORDS[r.status],
      coins: r.status === "REWARDED" ? r.coinsReferrer : 0,
      createdAt: r.createdAt,
    })),
  };
};

/** The sign-up page: "Invited by Rohan". */
export const inviteInfo = async (rawCode: string) => {
  const settings = await requireSetting("referral");
  const code = normaliseCode(rawCode);
  if (!settings.enabled || code.length !== CODE_LENGTH) return { valid: false as const };
  const inviter = await prisma.user.findUnique({ where: { referralCode: code }, select: { name: true, status: true, role: true } });
  if (!inviter || inviter.status !== "ACTIVE" || inviter.role !== "STUDENT") return { valid: false as const };
  return { valid: true as const, inviterFirstName: firstName(inviter.name), friendCoins: settings.friendCoins };
};

// ---- Sign-up and verification -----------------------------------------------------------

export interface ReferralSignal {
  code?: string | null;
  ip: string | null;
  deviceId?: string | null;
  userAgent?: string | null;
}

/**
 * Attaches a new account to the code it signed up with. Never throws and never
 * blocks the sign-up: a bad or unknown code is simply ignored.
 */
export const recordReferral = async (userId: string, signal: ReferralSignal) => {
  try {
    if (!signal.code) return;
    const settings = await requireSetting("referral");
    if (!settings.enabled) return;
    const code = normaliseCode(signal.code);
    const [inviter, user] = await Promise.all([
      prisma.user.findUnique({ where: { referralCode: code }, select: { id: true, status: true, role: true } }),
      prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, role: true, createdAt: true } }),
    ]);
    if (!inviter || !user || inviter.id === user.id || inviter.role !== "STUDENT" || inviter.status !== "ACTIVE" || user.role !== "STUDENT") return;
    if (Date.now() - user.createdAt.getTime() > NEW_ACCOUNT_MINUTES * 60_000) return; // existing accounts can't be "referred"
    await prisma.referral.createMany({
      data: [
        {
          referrerId: inviter.id,
          referredId: user.id,
          emailHash: emailHash(user.email),
          signupIp: signal.ip,
          deviceId: signal.deviceId?.slice(0, 64) || null,
          userAgent: signal.userAgent?.slice(0, 300) || null,
        },
      ],
      skipDuplicates: true, // one referral per account (signing up again keeps the first)
    });
  } catch (err) {
    console.error("[referral] Couldn't record a referral:", err instanceof Error ? err.message : err);
  }
};

/** Why this referral can't pay out on its own: null = fine; HELD/REJECTED + the reason. */
const reviewProblems = async (
  r: { id: string; referrerId: string; referredId: string; emailHash: string; signupIp: string | null; deviceId: string | null },
  settings: { dailyLimit: number; sameNetworkLimit: number }
): Promise<{ status: "HELD" | "REJECTED"; reason: string } | null> => {
  const inviter = await prisma.user.findUniqueOrThrow({ where: { id: r.referrerId }, select: { status: true, referralSeenIp: true, referralSeenDevice: true } });
  if (inviter.status !== "ACTIVE") return { status: "REJECTED", reason: "The inviter's account is suspended, blocked or erased" };

  const earlier = await prisma.referral.count({ where: { emailHash: r.emailHash, id: { not: r.id }, status: { in: ["REWARDED", "REVERSED", "HELD"] } } });
  if (earlier) return { status: "REJECTED", reason: "This email has already earned a referral reward" };

  if (r.deviceId && inviter.referralSeenDevice && r.deviceId === inviter.referralSeenDevice) return { status: "HELD", reason: "Signed up on the inviter's own device" };
  if (r.signupIp && inviter.referralSeenIp && r.signupIp === inviter.referralSeenIp) return { status: "HELD", reason: "Signed up from the inviter's own network" };

  const since = new Date(Date.now() - SIGNAL_WINDOW_DAYS * 86_400_000);
  const signals: Prisma.ReferralWhereInput[] = [];
  if (r.signupIp) signals.push({ signupIp: r.signupIp });
  if (r.deviceId) signals.push({ deviceId: r.deviceId });
  if (signals.length) {
    const sameSource = await prisma.referral.count({ where: { referrerId: r.referrerId, id: { not: r.id }, createdAt: { gte: since }, OR: signals } });
    if (sameSource >= settings.sameNetworkLimit) return { status: "HELD", reason: `${sameSource + 1} sign-ups for this inviter from one network or device` };
  }

  const dayStart = new Date(istDayEnd(istDayKey()).getTime() - 86_400_000);
  const today = await prisma.referral.count({ where: { referrerId: r.referrerId, status: "REWARDED", decidedAt: { gte: dayStart } } });
  if (today >= settings.dailyLimit) return { status: "HELD", reason: `Over the daily limit of ${settings.dailyLimit} rewards` };

  if (!(await accessState(r.referrerId)).fullAccess) return { status: "HELD", reason: "The inviter is under 18 and waiting for a parent's permission (or has no date of birth)" };
  return null;
};

/** Gives the coins (inside one transaction; guarded, so it can't pay twice). */
const payOut = async (referralId: string, from: ReferralStatus[], decidedById: string | null, note: string | null) => {
  const settings = await requireSetting("referral");
  const r = await prisma.referral.findUniqueOrThrow({ where: { id: referralId }, include: { referred: { select: { name: true } } } });
  // The friend's welcome coins only if they may have coins (under 18 needs a parent's permission)
  const friendCoins = settings.friendCoins > 0 && (await accessState(r.referredId)).fullAccess ? settings.friendCoins : 0;
  const coins = settings.coinsPerReferral;
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.referral.updateMany({
      where: { id: referralId, status: { in: from } },
      data: { status: "REWARDED", coinsReferrer: coins, coinsFriend: friendCoins, decidedAt: new Date(), decidedById, note, reason: null },
    });
    if (claimed.count === 0) throw new AppError(409, "This referral was already settled");
    if (coins > 0) await applyCoinChange(tx, { userId: r.referrerId, delta: coins, reason: "REFERRAL_REWARD", refId: referralId, note: `${firstName(r.referred.name)} joined with your link` });
    if (friendCoins > 0) await applyCoinChange(tx, { userId: r.referredId, delta: friendCoins, reason: "REFERRAL_BONUS", refId: referralId, note: "Welcome coins for joining with a friend's link" });
  });
  if (coins > 0) {
    await notifyUser(r.referrerId, { kind: "ACCOUNT", title: `${coins} coins for inviting a friend`, body: `${firstName(r.referred.name)} joined Class Course with your link. Use the coins for money off notes.`, link: "/refer" });
  }
  if (friendCoins > 0) {
    await notifyUser(r.referredId, { kind: "ACCOUNT", title: `${friendCoins} welcome coins`, body: "Thanks for joining with a friend's link. Use the coins for money off notes.", link: "/profile" });
  }
};

/** After the friend's email is verified. Never throws. */
export const settleReferral = async (referredId: string) => {
  try {
    const r = await prisma.referral.findUnique({ where: { referredId } });
    if (!r || r.status !== "PENDING") return;
    const verified = await prisma.referral.updateMany({ where: { id: r.id, status: "PENDING", verifiedAt: null }, data: { verifiedAt: new Date() } });
    if (verified.count === 0) return; // another request is settling it
    const settings = await requireSetting("referral");
    if (!settings.enabled) {
      await prisma.referral.update({ where: { id: r.id }, data: { status: "REJECTED", reason: "Refer and Earn was switched off", decidedAt: new Date() } });
      return;
    }
    const problem = await reviewProblems(r, settings);
    if (problem) {
      await prisma.referral.update({ where: { id: r.id }, data: { status: problem.status, reason: problem.reason, ...(problem.status === "REJECTED" ? { decidedAt: new Date() } : {}) } });
      return;
    }
    await payOut(r.id, ["PENDING"], null, null);
  } catch (err) {
    console.error("[referral] Couldn't settle a referral:", err instanceof Error ? err.message : err);
  }
};

// ---- Admin (Super Admin) ------------------------------------------------------------------

const adminSelect = {
  id: true,
  status: true,
  reason: true,
  coinsReferrer: true,
  coinsFriend: true,
  signupIp: true,
  deviceId: true,
  userAgent: true,
  verifiedAt: true,
  decidedAt: true,
  note: true,
  createdAt: true,
  referrer: { select: { id: true, name: true, email: true, status: true } },
  referred: { select: { id: true, name: true, email: true, status: true, emailVerified: true } },
} satisfies Prisma.ReferralSelect;

export const listReferralsAdmin = async (q: { status?: ReferralStatus; userId?: string; page: number; pageSize: number }) => {
  const where: Prisma.ReferralWhereInput = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.userId ? { OR: [{ referrerId: q.userId }, { referredId: q.userId }] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.referral.findMany({ where, select: adminSelect, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.referral.count({ where }),
  ]);
  // How many referrals share each row's network / device (last 30 days), for the review
  const since = new Date(Date.now() - SIGNAL_WINDOW_DAYS * 86_400_000);
  const ips = [...new Set(rows.map((r) => r.signupIp).filter((v): v is string => Boolean(v)))];
  const devices = [...new Set(rows.map((r) => r.deviceId).filter((v): v is string => Boolean(v)))];
  const [byIp, byDevice] = await Promise.all([
    ips.length ? prisma.referral.groupBy({ by: ["signupIp"], where: { signupIp: { in: ips }, createdAt: { gte: since } }, _count: { _all: true } }) : [],
    devices.length ? prisma.referral.groupBy({ by: ["deviceId"], where: { deviceId: { in: devices }, createdAt: { gte: since } }, _count: { _all: true } }) : [],
  ]);
  const ipCount = new Map(byIp.map((g) => [g.signupIp, g._count._all]));
  const deviceCount = new Map(byDevice.map((g) => [g.deviceId, g._count._all]));
  return {
    items: rows.map((r) => ({
      ...r,
      sameNetwork: r.signupIp ? (ipCount.get(r.signupIp) ?? 1) : 0,
      sameDevice: r.deviceId ? (deviceCount.get(r.deviceId) ?? 1) : 0,
    })),
    total,
    page: q.page,
    totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
  };
};

export const referralSummary = async () => {
  const [byStatus, coins, topReferrers] = await Promise.all([
    prisma.referral.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.referral.aggregate({ where: { status: "REWARDED" }, _sum: { coinsReferrer: true, coinsFriend: true } }),
    prisma.referral.groupBy({ by: ["referrerId"], where: { status: { in: ["REWARDED", "HELD"] } }, _count: { _all: true }, orderBy: { _count: { referrerId: "desc" } }, take: 5 }),
  ]);
  const people = await prisma.user.findMany({ where: { id: { in: topReferrers.map((t) => t.referrerId) } }, select: { id: true, name: true, email: true } });
  const counts = Object.fromEntries(byStatus.map((g) => [g.status, g._count._all])) as Partial<Record<ReferralStatus, number>>;
  return {
    counts: { PENDING: 0, REWARDED: 0, HELD: 0, REJECTED: 0, REVERSED: 0, ...counts },
    coinsGiven: (coins._sum.coinsReferrer ?? 0) + (coins._sum.coinsFriend ?? 0),
    topReferrers: topReferrers.map((t) => ({ user: people.find((p) => p.id === t.referrerId) ?? null, count: t._count._all })),
  };
};

/** A held referral looks fine after all: pay it. */
export const approveReferral = async (id: string, adminId: string, note: string) => {
  const r = await prisma.referral.findUnique({ where: { id }, select: { status: true } });
  if (!r) throw new AppError(404, "Referral not found");
  if (r.status !== "HELD") throw new AppError(409, "Only a referral waiting for review can be approved");
  await payOut(id, ["HELD"], adminId, note);
};

/** No coins for this one (still waiting or held). */
export const rejectReferral = async (id: string, adminId: string, note: string) => {
  const done = await prisma.referral.updateMany({ where: { id, status: { in: ["PENDING", "HELD"] } }, data: { status: "REJECTED", decidedAt: new Date(), decidedById: adminId, note, reason: "Rejected by the team" } });
  if (done.count === 0) throw new AppError(409, "Only a waiting or held referral can be rejected");
};

/**
 * Fraud found after paying: the coins come back from both students, as far
 * as they still have them (spent coins can't be taken; the shortfall is noted).
 */
export const reverseReferral = async (id: string, adminId: string, note: string) => {
  const r = await prisma.referral.findUnique({ where: { id } });
  if (!r) throw new AppError(404, "Referral not found");
  if (r.status !== "REWARDED") throw new AppError(409, "Only a rewarded referral can be reversed");
  await Promise.all([refreshCoins(r.referrerId), refreshCoins(r.referredId)]);
  const taken = { referrer: 0, friend: 0 };
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.referral.updateMany({ where: { id, status: "REWARDED" }, data: { status: "REVERSED", decidedAt: new Date(), decidedById: adminId, note } });
    if (claimed.count === 0) throw new AppError(409, "This referral was already reversed");
    for (const [who, userId, amount, refId] of [
      ["referrer", r.referrerId, r.coinsReferrer, id],
      ["friend", r.referredId, r.coinsFriend, `${id}:friend`],
    ] as const) {
      if (amount <= 0) continue;
      const { coins } = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { coins: true } });
      const take = Math.min(coins, amount);
      if (take > 0) await applyCoinChange(tx, { userId, delta: -take, reason: "REFERRAL_REVERSED", refId, note: `Referral reward taken back: ${note}`, createdById: adminId });
      taken[who] = take;
    }
  });
  return { taken, shortfall: { referrer: r.coinsReferrer - taken.referrer, friend: r.coinsFriend - taken.friend } };
};
