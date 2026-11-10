import { Prisma, UserStatus } from "@prisma/client";
import prisma from "../config/prisma";
import { AppError } from "../utils/AppError";
import { clearAccount } from "./loginThrottle.service";

// Account state set by the admin (client requirements of 6 Nov 2026):
// suspend (for a while or until lifted), block (also stops the email signing
// up again), sign out everywhere, erase personal data. Every sign-in path and
// `authenticate` ask accountProblem(), so a change applies at once.

type Tx = Prisma.TransactionClient;

const day = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

export interface AccountState {
  status: UserStatus;
  suspendedUntil: Date | null;
  statusReason: string | null;
}

/** Is this account allowed in? Null when yes, otherwise the error the student sees. */
export const accountProblem = (u: AccountState, now = new Date()): AppError | null => {
  // "Reason: …." with one full stop, however the admin ended it
  const reason = u.statusReason ? ` Reason: ${u.statusReason.replace(/[.!?]+$/, "")}.` : "";
  if (u.status === "DELETED") return new AppError(401, "This account no longer exists.", "ACCOUNT_DELETED");
  if (u.status === "BLOCKED") {
    return new AppError(403, `This account has been blocked.${reason} If you think this is a mistake, write to us from the Helpline.`, "ACCOUNT_BLOCKED");
  }
  if (u.status === "SUSPENDED" && (!u.suspendedUntil || u.suspendedUntil > now)) {
    // suspendedUntil is the moment it ends (midnight after the last day): name the last day.
    const until = u.suspendedUntil ? `until ${day(new Date(u.suspendedUntil.getTime() - 1))}` : "until further notice";
    return new AppError(403, `This account is suspended ${until}.${reason} If you think this is a mistake, write to us from the Helpline.`, "ACCOUNT_SUSPENDED", {
      suspendedUntil: u.suspendedUntil?.toISOString() ?? null,
    });
  }
  return null;
};

/** For sign-in: refuses a suspended / blocked / deleted account with a clear message. */
export const assertCanSignIn = (u: AccountState) => {
  const problem = accountProblem(u);
  if (problem) throw problem;
};

/** Emails of blocked accounts can't create a new account. */
export const assertEmailNotBlocked = async (email: string) => {
  if (await prisma.blockedEmail.findUnique({ where: { email: email.trim().toLowerCase() } })) {
    throw new AppError(403, "This email can't be used to create an account. If you think this is a mistake, write to us from the Helpline.", "EMAIL_BLOCKED");
  }
};

/** Signs the account out of every device: refresh tokens go, and access tokens stop working (version bump). */
export const signOutEverywhereTx = async (tx: Tx, userId: string) => {
  await tx.refreshToken.deleteMany({ where: { userId } });
  await tx.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
};

// Only student accounts are suspended, blocked or erased here; admin
// accounts are managed (and removed) from Team.
const requireStudent = async (userId: string, actorId: string) => {
  if (userId === actorId) throw new AppError(400, "You can't do this to your own account");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.status === "DELETED") throw new AppError(404, "User not found");
  if (user.role !== "STUDENT") throw new AppError(400, "This is an admin account. Remove its admin access in Team first.");
  return user;
};

const stamp = (status: UserStatus, reason: string | null, suspendedUntil: Date | null = null) => ({ status, statusReason: reason, suspendedUntil, statusChangedAt: new Date() });

export const suspendUser = async (userId: string, actorId: string, input: { until: Date | null; reason: string }) => {
  const user = await requireStudent(userId, actorId);
  if (user.status === "BLOCKED") throw new AppError(400, "This account is blocked. Unblock it first.");
  if (input.until && input.until <= new Date()) throw new AppError(400, "Choose a date in the future, or suspend until further notice");
  // Open sessions aren't ended: every request is refused with the reason
  // (authenticate → 403 ACCOUNT_SUSPENDED), so the site can show it.
  await prisma.user.update({ where: { id: userId }, data: stamp("SUSPENDED", input.reason, input.until) });
  return { before: { status: user.status }, after: { status: "SUSPENDED", until: input.until?.toISOString() ?? null } };
};

export const unsuspendUser = async (userId: string, actorId: string) => {
  const user = await requireStudent(userId, actorId);
  if (user.status !== "SUSPENDED") throw new AppError(400, "This account isn't suspended");
  await prisma.user.update({ where: { id: userId }, data: stamp("ACTIVE", null) });
  return { before: { status: user.status }, after: { status: "ACTIVE" } };
};

export const blockUser = async (userId: string, actorId: string, reason: string) => {
  const user = await requireStudent(userId, actorId);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: stamp("BLOCKED", reason) });
    await tx.blockedEmail.upsert({ where: { email: user.email.toLowerCase() }, create: { email: user.email.toLowerCase(), reason, blockedById: actorId }, update: { reason, blockedById: actorId } });
  });
  return { before: { status: user.status }, after: { status: "BLOCKED" } };
};

export const unblockUser = async (userId: string, actorId: string) => {
  const user = await requireStudent(userId, actorId);
  if (user.status !== "BLOCKED") throw new AppError(400, "This account isn't blocked");
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: stamp("ACTIVE", null) }),
    prisma.blockedEmail.deleteMany({ where: { email: user.email.toLowerCase() } }),
  ]);
  return { before: { status: user.status }, after: { status: "ACTIVE" } };
};

export const signOutEverywhere = async (userId: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, status: true } });
  if (!user || user.status === "DELETED") throw new AppError(404, "User not found");
  await prisma.$transaction((tx) => signOutEverywhereTx(tx, userId));
};

/**
 * Erases a student's personal data (DPDP right to erasure, or the Founder's
 * decision). Payment records the law requires (orders, refunds) are kept but
 * no longer point to a person: the account row stays only as an anonymous
 * owner of those orders. Everything else about the student is deleted.
 */
export const eraseUser = async (userId: string, actorId: string, reason: string) => {
  const user = await requireStudent(userId, actorId);
  const kept = await prisma.order.count({ where: { userId } });
  await prisma.$transaction(async (tx) => {
    await tx.refreshToken.deleteMany({ where: { userId } });
    await tx.passwordResetToken.deleteMany({ where: { userId } });
    await tx.emailVerificationCode.deleteMany({ where: { userId } });
    await tx.authCode.deleteMany({ where: { userId } });
    await tx.quizAttempt.deleteMany({ where: { userId } });
    await tx.noteAccess.deleteMany({ where: { userId } });
    await tx.coinTransaction.deleteMany({ where: { userId } }); // lots and moves go with them
    await tx.contactMessage.deleteMany({ where: { userId } });
    await tx.parentalConsent.deleteMany({ where: { userId } });
    await tx.like.deleteMany({ where: { userId } });
    await tx.savedItem.deleteMany({ where: { userId } });
    await tx.notificationRead.deleteMany({ where: { userId } });
    await tx.notification.deleteMany({ where: { userId } });
    await tx.user.update({
      where: { id: userId },
      data: {
        email: `deleted-${userId}@deleted.invalid`,
        name: null,
        phone: null,
        password: null,
        googleId: null,
        emailVerified: false,
        dateOfBirth: null,
        districtId: null,
        classLevelId: null,
        mediumId: null,
        coins: 0,
        adminPermissions: [],
        deletedAt: new Date(),
        tokenVersion: { increment: 1 },
        ...stamp("DELETED", reason),
      },
    });
  });
  await clearAccount(user.email);
  return { before: { status: user.status }, after: { status: "DELETED", paymentRecordsKept: kept } };
};

/** Everything stored about a student, in one readable file (DPDP access request). */
export const exportUser = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      role: true,
      status: true,
      statusReason: true,
      suspendedUntil: true,
      emailVerified: true,
      dateOfBirth: true,
      classLevel: { select: { name: true } },
      district: { select: { name: true } },
      medium: { select: { name: true } },
      googleId: true,
      coins: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!user || user.status === "DELETED") throw new AppError(404, "User not found");
  const consent = await prisma.parentalConsent.findUnique({ where: { userId }, select: { parentEmail: true, status: true, parentName: true, relationship: true, decidedAt: true, decidedVia: true, createdAt: true } });
  const [coins, orders, quizzes, messages, notes, likes, saved, notices, invited, invitedBy] = await Promise.all([
    prisma.coinTransaction.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { createdAt: true, delta: true, balanceAfter: true, reason: true, note: true, lot: { select: { expiresAt: true } } } }),
    prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { id: true, createdAt: true, status: true, listPricePaise: true, coinsUsed: true, amountPaise: true, provider: true, paidAt: true, note: { select: { title: true } }, refunds: { select: { status: true, amountPaise: true, createdAt: true, processedAt: true } } },
    }),
    prisma.quizAttempt.findMany({ where: { userId }, orderBy: { startedAt: "asc" }, select: { startedAt: true, finishedAt: true, status: true, score: true, passMark: true, quizTitle: true, coinsAwarded: true, chapter: { select: { title: true } } } }),
    prisma.contactMessage.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { createdAt: true, topic: true, message: true, status: true } }),
    prisma.noteAccess.findMany({ where: { userId }, select: { grantedAt: true, note: { select: { title: true } } } }),
    prisma.like.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { createdAt: true, chapter: { select: { title: true } }, blogPost: { select: { title: true } } } }),
    prisma.savedItem.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { createdAt: true, chapter: { select: { title: true } }, blogPost: { select: { title: true } } } }),
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { createdAt: true, kind: true, title: true, body: true } }),
    prisma.referral.findMany({ where: { referrerId: userId }, orderBy: { createdAt: "asc" }, select: { createdAt: true, status: true, coinsReferrer: true, referred: { select: { name: true } } } }),
    prisma.referral.findUnique({ where: { referredId: userId }, select: { createdAt: true, status: true, coinsFriend: true } }),
  ]);
  const item = (r: { createdAt: Date; chapter: { title: string } | null; blogPost: { title: string } | null }) => ({
    at: r.createdAt,
    type: r.chapter ? "chapter" : "blog post",
    title: r.chapter?.title ?? r.blogPost?.title ?? null,
  });
  const { googleId, dateOfBirth, ...profile } = user;
  return {
    exportedAt: new Date().toISOString(),
    about: "Everything Class Course stores about this account. Amounts are in paise (100 paise = ₹1).",
    account: { ...profile, dateOfBirth: dateOfBirth?.toISOString().slice(0, 10) ?? null, signsInWithGoogle: Boolean(googleId) },
    coins,
    notesOwned: notes,
    orders,
    quizAttempts: quizzes,
    helplineMessages: messages,
    parentalConsent: consent,
    likes: likes.map(item),
    saved: saved.map(item),
    notices,
    referrals: {
      invited: invited.map((r) => ({ at: r.createdAt, friend: r.referred.name?.split(" ")[0] ?? null, status: r.status, coins: r.coinsReferrer })),
      joinedWithALink: invitedBy,
    },
  };
};
