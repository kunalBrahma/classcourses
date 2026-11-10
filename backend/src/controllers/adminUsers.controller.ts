import { Request, Response } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import { AuthRequest } from "../middleware/auth.middleware";
import { notifyUser, warningCount } from "../services/notification.service";
import { listSaved } from "../services/reaction.service";
import { AppError } from "../utils/AppError";
import { asyncHandler } from "../utils/asyncHandler";
import { applyCoinChange, coinSummary, refreshCoins } from "../services/coin.service";
import { blockUser, eraseUser, exportUser, signOutEverywhere, signOutEverywhereTx, suspendUser, unblockUser, unsuspendUser } from "../services/account.service";
import { noteActivity } from "../middleware/adminActivity";
import { parseDateOfBirth, requireActiveClass, requireActiveDistrict } from "../services/profile.service";
import { istDayEnd } from "../utils/istDate";
import { accountStatus } from "../services/loginThrottle.service";
import { consentForAdmin, recordConsentByAdmin, requestConsent, withdrawConsentByAdmin } from "../services/consent.service";
import { ADULT_AGE_YEARS } from "../services/profile.service";
import { profileStatus } from "../services/profile.service";

// Shapes a user row for the admin: date of birth as "YYYY-MM-DD", age, under 18,
// and whether the profile (class, district, date of birth) is complete.
const withProfile = <T extends { classLevelId: string | null; districtId: string | null; dateOfBirth: Date | null }>(u: T) => {
  const { dateOfBirth: _dob, ...rest } = u;
  return { ...rest, ...profileStatus(u) };
};

// Admin: students & admins, their coins and quiz activity.

const listQuery = z.object({
  search: z.string().trim().max(100).optional(),
  role: z.enum(["STUDENT", "ADMIN"]).optional(),
  classLevelId: z.string().uuid().optional(),
  districtId: z.string().uuid().optional(),
  // incomplete = class, district or date of birth missing
  profile: z.enum(["complete", "incomplete"]).optional(),
  // Deleted (erased) accounts are hidden unless asked for
  status: z.enum(["ACTIVE", "SUSPENDED", "BLOCKED", "DELETED"]).optional(),
  // Under 18: "missing" = no consent yet (none, pending, declined, withdrawn), "granted"
  consent: z.enum(["missing", "granted"]).optional(),
  // Joining date, as India calendar days (YYYY-MM-DD), both ends included
  joinedFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  joinedTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const listUsersAdmin = asyncHandler(async (req: Request, res: Response) => {
  const { search, role, classLevelId, districtId, profile, status, consent, joinedFrom, joinedTo, page, pageSize } = listQuery.parse(req.query);
  // Every filter is one condition in AND, so none can overwrite another.
  const and: Prisma.UserWhereInput[] = [];
  if (profile === "complete") and.push({ classLevelId: { not: null }, districtId: { not: null }, dateOfBirth: { not: null } });
  if (profile === "incomplete") and.push({ OR: [{ classLevelId: null }, { districtId: null }, { dateOfBirth: null }] });
  if (consent) {
    // Born after this day (India) = under 18 today
    const now = new Date(Date.now() + 5.5 * 3_600_000);
    const cutoff = new Date(Date.UTC(now.getUTCFullYear() - ADULT_AGE_YEARS, now.getUTCMonth(), now.getUTCDate()));
    and.push({ role: "STUDENT", dateOfBirth: { gt: cutoff } });
    and.push(consent === "granted" ? { parentalConsent: { status: "GRANTED" } } : { OR: [{ parentalConsent: null }, { parentalConsent: { status: { not: "GRANTED" } } }] });
  }
  // IST day boundaries: from 00:00 of joinedFrom to the end of joinedTo
  if (joinedFrom) and.push({ createdAt: { gte: new Date(istDayEnd(joinedFrom).getTime() - 86_400_000) } });
  if (joinedTo) and.push({ createdAt: { lt: istDayEnd(joinedTo) } });
  if (search) {
    and.push({
      OR: [
        { email: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
        // Phone: match on digits only, once there are enough to mean something.
        ...(/^[\d\s+-]{3,}$/.test(search) ? [{ phone: { contains: search.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "") } }] : []),
      ],
    });
  }
  const where: Prisma.UserWhereInput = { role, classLevelId, districtId, status: status ?? { not: "DELETED" }, AND: and };
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        emailVerified: true,
        role: true,
        coins: true,
        classLevelId: true,
        classLevel: { select: { id: true, name: true, slug: true } },
        districtId: true,
        district: { select: { id: true, name: true } },
        dateOfBirth: true,
        status: true,
        suspendedUntil: true,
        parentalConsent: { select: { status: true } },
        medium: { select: { name: true } },
        createdAt: true,
        _count: { select: { quizAttempts: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);
  res.json({
    users: users.map(({ _count, ...u }) => ({ ...withProfile(u), quizAttempts: _count.quizAttempts })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  });
});

export const getUserAdmin = asyncHandler(async (req: Request, res: Response) => {
  if (await prisma.user.count({ where: { id: req.params.id } })) await refreshCoins(req.params.id);
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      emailVerified: true,
      role: true,
      coins: true,
      googleId: true,
      adminLevel: true,
      adminPermissions: true,
      status: true,
      suspendedUntil: true,
      statusReason: true,
      statusChangedAt: true,
      classLevelId: true,
      classLevel: { select: { id: true, name: true, slug: true } },
      districtId: true,
      district: { select: { id: true, name: true } },
      dateOfBirth: true,
      medium: { select: { id: true, name: true } },
      createdAt: true,
      coinTxns: { orderBy: { createdAt: "desc" }, take: 50, include: { lot: { select: { expiresAt: true, remaining: true, expiredAmount: true } } } },
      // Everything the Founder needs on one page (client requirements of 6 Nov 2026)
      orders: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          status: true,
          listPricePaise: true,
          coinsUsed: true,
          amountPaise: true,
          provider: true,
          paidAt: true,
          createdAt: true,
          note: { select: { title: true } },
          refunds: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, amountPaise: true } },
        },
      },
      contactMessages: { orderBy: { createdAt: "desc" }, take: 20, select: { id: true, topic: true, message: true, status: true, createdAt: true } },
      referralsMade: { orderBy: { createdAt: "desc" }, take: 20, select: { id: true, status: true, coinsReferrer: true, createdAt: true, referred: { select: { id: true, name: true, email: true } } } },
      referredBy: { select: { id: true, status: true, coinsFriend: true, createdAt: true, referrer: { select: { id: true, name: true, email: true } } } },
      quizAttempts: {
        orderBy: { startedAt: "desc" },
        take: 20,
        select: {
          id: true,
          status: true,
          score: true,
          passMark: true,
          coinsAwarded: true,
          dayKey: true,
          startedAt: true,
          finishedAt: true,
          chapter: { select: { title: true, subject: { select: { name: true, classLevel: { select: { id: true, name: true, slug: true } } } } } },
          quizTitle: true,
          quiz: { select: { title: true, classLevel: { select: { id: true, name: true, slug: true } } } },
        },
      },
    },
  });
  if (!user) throw new AppError(404, "User not found");
  // Google's id stays on the server; the admin only sees that Google is linked.
  const { googleId, ...rest } = user;
  const coins = await coinSummary(user.id);
  res.json({
    user: {
      ...withProfile(rest),
      signsInWithGoogle: Boolean(googleId),
      // Coins left by expiry date, and how many have expired so far
      coinLots: coins.lots,
      nextCoinExpiry: coins.nextExpiry,
      expiredCoins: coins.expiredTotal,
      // Moderation: warnings so far ("warn, then suspend if it repeats"), likes and saves
      warnings: await warningCount(user.id),
      likeCount: await prisma.like.count({ where: { userId: user.id } }),
      // Latest saved items (title, class or subject, type, link)
      savedItems: (await listSaved(user.id, 1, 10)).items,
      savedCount: await prisma.savedItem.count({ where: { userId: user.id } }),
    },
  });
});

export const updateUserAdmin = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { role, name } = req.body as { role?: "STUDENT" | "ADMIN"; name?: string | null };
  const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, role: true } });
  if (!target) throw new AppError(404, "User not found");

  if (role && role !== target.role) {
    if (target.id === req.user!.userId) {
      throw new AppError(400, "You can't change your own role");
    }
    const full = await prisma.user.findUniqueOrThrow({ where: { id: target.id }, select: { adminLevel: true } });
    if (target.role === "ADMIN" && full.adminLevel === "SUPER" && (await prisma.user.count({ where: { role: "ADMIN", adminLevel: "SUPER" } })) <= 1) {
      throw new AppError(400, "Keep at least one Super Admin");
    }
  }

  const user = await prisma.user.update({
    where: { id: target.id },
    // A new admin starts as a helper with no sections: the Super Admin ticks
    // them in Team. Super Admins are made only from the server (create-admin).
    data: { role, name, ...(role === "ADMIN" && role !== target.role ? { adminLevel: "HELPER" as const, adminPermissions: [] } : {}) },
    select: { id: true, email: true, name: true, role: true, coins: true },
  });
  if (role && role !== target.role) {
    // Sign the user out everywhere so the new role applies immediately.
    await prisma.$transaction((tx) => signOutEverywhereTx(tx, target.id));
  }
  noteActivity(res, { action: role && role !== target.role ? "user.role" : "user.rename", targetType: "user", targetId: target.id, before: { role: target.role }, after: { role: user.role, name: user.name } });
  res.json({ user });
});

// Manual correction (e.g. goodwill credit, fixing a mistake). Recorded in the ledger.
export const adjustUserCoins = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { delta, note } = req.body as { delta: number; note: string };
  const txn = await prisma.$transaction((tx) =>
    applyCoinChange(tx, { userId: req.params.id, delta, reason: "ADMIN_ADJUST", note, createdById: req.user!.userId })
  );
  await notifyUser(req.params.id, {
    kind: "ACCOUNT",
    title: delta > 0 ? `${delta} coins added` : `${-delta} coins removed`,
    body: `${delta > 0 ? `We added ${delta} coins to` : `We removed ${-delta} coins from`} your account: ${note}. Your balance is now ${txn.balanceAfter}.`,
    link: "/profile",
  });
  res.status(201).json({ transaction: txn, balance: txn.balanceAfter });
});

// ---------------------------------------------------------------------------
// Account actions (client requirements of 6 Nov 2026). Each asks for a reason;
// the activity log keeps who did what, when and why.
// ---------------------------------------------------------------------------

const actor = (req: AuthRequest) => req.user!.userId;

export const suspendUserAdmin = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { until, reason } = req.body as { until: string | null; reason: string };
  const change = await suspendUser(req.params.id, actor(req), { until: until ? istDayEnd(until) : null, reason });
  noteActivity(res, { action: "user.suspend", targetType: "user", targetId: req.params.id, summary: until ? `Suspended until ${until}` : "Suspended until lifted", ...change });
  res.json({ message: until ? `Suspended until the end of ${until}` : "Suspended until you lift it" });
});

export const unsuspendUserAdmin = asyncHandler(async (req: AuthRequest, res: Response) => {
  const change = await unsuspendUser(req.params.id, actor(req));
  noteActivity(res, { action: "user.unsuspend", targetType: "user", targetId: req.params.id, ...change });
  res.json({ message: "Suspension lifted" });
});

export const blockUserAdmin = asyncHandler(async (req: AuthRequest, res: Response) => {
  const change = await blockUser(req.params.id, actor(req), req.body.reason);
  noteActivity(res, { action: "user.block", targetType: "user", targetId: req.params.id, ...change });
  res.json({ message: "Blocked. This email can't sign in or create a new account." });
});

export const unblockUserAdmin = asyncHandler(async (req: AuthRequest, res: Response) => {
  const change = await unblockUser(req.params.id, actor(req));
  noteActivity(res, { action: "user.unblock", targetType: "user", targetId: req.params.id, ...change });
  res.json({ message: "Unblocked" });
});

export const signOutUserAdmin = asyncHandler(async (req: AuthRequest, res: Response) => {
  await signOutEverywhere(req.params.id);
  noteActivity(res, { action: "user.sign_out_everywhere", targetType: "user", targetId: req.params.id });
  res.json({ message: "Signed out on every device" });
});

// Correcting details when the student (or a parent) asks; before/after kept.
export const editUserDetailsAdmin = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = req.body as { name?: string; phone?: string | null; classLevelId?: string; districtId?: string; dateOfBirth?: string; reason: string };
  const fields = { name: true, phone: true, classLevelId: true, districtId: true, dateOfBirth: true, status: true, role: true } as const;
  const before = await prisma.user.findUnique({ where: { id: req.params.id }, select: fields });
  if (!before || before.status === "DELETED") throw new AppError(404, "User not found");
  const after = await prisma.user.update({
    where: { id: req.params.id },
    data: {
      name: body.name,
      phone: body.phone,
      classLevelId: body.classLevelId === undefined ? undefined : await requireActiveClass(body.classLevelId),
      districtId: body.districtId === undefined ? undefined : await requireActiveDistrict(body.districtId),
      dateOfBirth: body.dateOfBirth === undefined ? undefined : parseDateOfBirth(body.dateOfBirth),
    },
    select: fields,
  });
  const changed = (Object.keys(body) as (keyof typeof body)[]).filter((k) => k !== "reason");
  const pick = (u: typeof before) => Object.fromEntries(changed.map((k) => [k, k === "dateOfBirth" ? u.dateOfBirth?.toISOString().slice(0, 10) ?? null : u[k as keyof typeof u]]));
  noteActivity(res, { action: "user.edit_details", targetType: "user", targetId: req.params.id, summary: `Changed ${changed.join(", ")}`, before: pick(before), after: pick(after) });
  res.json({ message: "Details saved" });
});

// DPDP right to erasure (or the Founder's decision). Super Admin only.
export const eraseUserAdmin = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { reason, confirmEmail } = req.body as { reason: string; confirmEmail: string };
  const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { email: true } });
  if (!user) throw new AppError(404, "User not found");
  if (user.email.toLowerCase() !== confirmEmail) throw new AppError(400, "The email you typed doesn't match this account");
  const change = await eraseUser(req.params.id, actor(req), reason);
  noteActivity(res, { action: "user.erase", targetType: "user", targetId: req.params.id, summary: `Personal data erased (was ${user.email})`, ...change });
  res.json({ message: "Personal data erased. Payment records are kept without the student's details." });
});

// Everything stored about the student, as a JSON file (data request).
export const exportUserAdmin = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await exportUser(req.params.id);
  noteActivity(res, { action: "user.export", targetType: "user", targetId: req.params.id, summary: "Data exported" });
  res.setHeader("Content-Disposition", `attachment; filename="class-course-data-${req.params.id}.json"`);
  res.type("application/json").send(JSON.stringify(data, null, 2));
});

// What's going on with sign-in and account state (user page header).
export const userAccountAdmin = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { email: true, status: true, suspendedUntil: true, statusReason: true, statusChangedAt: true } });
  if (!user) throw new AppError(404, "User not found");
  const blockedEmail = await prisma.blockedEmail.findUnique({ where: { email: user.email.toLowerCase() } });
  res.json({ account: { status: user.status, suspendedUntil: user.suspendedUntil, statusReason: user.statusReason, statusChangedAt: user.statusChangedAt, emailBlocked: Boolean(blockedEmail) }, signIn: await accountStatus(user.email) });
});

// ---- Parental consent (admin) ----

export const getUserConsentAdmin = asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json(await consentForAdmin(req.params.id));
});

// The parent gave permission another way (e.g. by email to the Helpline). Super Admin.
export const recordConsentAdmin = asyncHandler(async (req: AuthRequest, res: Response) => {
  const change = await recordConsentByAdmin(req.params.id, req.body);
  noteActivity(res, { action: "consent.record", targetType: "user", targetId: req.params.id, reason: req.body.note, summary: `Consent recorded for ${req.body.parentEmail}`, ...change });
  res.json({ message: "Consent recorded. The account is fully active.", ...(await consentForAdmin(req.params.id)) });
});

// The parent takes it back: the account is limited again. Super Admin.
export const withdrawConsentAdmin = asyncHandler(async (req: AuthRequest, res: Response) => {
  const change = await withdrawConsentByAdmin(req.params.id, req.body.note);
  noteActivity(res, { action: "consent.withdraw", targetType: "user", targetId: req.params.id, reason: req.body.note, ...change });
  res.json({ message: "Consent withdrawn. Quizzes and purchases are off for this student.", ...(await consentForAdmin(req.params.id)) });
});

// Emails the parent a fresh link (the old one stops working).
export const resendConsentAdmin = asyncHandler(async (req: AuthRequest, res: Response) => {
  const consent = await prisma.parentalConsent.findUnique({ where: { userId: req.params.id } });
  if (!consent) throw new AppError(400, "The student hasn't given a parent's email yet");
  const sent = await requestConsent(req.params.id, consent.parentEmail);
  noteActivity(res, { action: "consent.resend", targetType: "user", targetId: req.params.id, summary: `Link sent again to ${sent.parentEmail}` });
  res.json({ message: `A new link went to ${sent.parentEmail}`, ...(await consentForAdmin(req.params.id)) });
});
