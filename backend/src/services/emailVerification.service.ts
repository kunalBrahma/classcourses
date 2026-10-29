import crypto from "crypto";
import prisma from "../config/prisma";
import { AppError } from "../utils/AppError";
import { sendVerificationCodeEmail } from "../utils/mailer";

// Sign-up email check: a 6-digit code, emailed, valid for CODE_TTL_MINUTES.
// Only a hash is stored. Each code allows MAX_ATTEMPTS wrong guesses, and a
// new code can be asked for once every RESEND_COOLDOWN_SECONDS.
export const CODE_TTL_MINUTES = 10;
export const MAX_ATTEMPTS = 5;
export const RESEND_COOLDOWN_SECONDS = 60;

// The user id is mixed in so the same code hashes differently per account.
export const hashCode = (userId: string, code: string) => crypto.createHash("sha256").update(`${userId}:${code}`).digest("hex");

const sameHash = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Emails a fresh code (replacing any earlier one), unless one was sent less
 * than RESEND_COOLDOWN_SECONDS ago. Returns how long to wait before the next
 * resend, so the client can show a countdown.
 */
export const sendVerificationCode = async (user: { id: string; email: string; name: string | null }) => {
  const latest = await prisma.emailVerificationCode.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
  if (latest) {
    const waited = (Date.now() - latest.createdAt.getTime()) / 1000;
    if (waited < RESEND_COOLDOWN_SECONDS) return { sent: false, retryAfter: Math.ceil(RESEND_COOLDOWN_SECONDS - waited) };
  }

  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
  const [, created] = await prisma.$transaction([
    prisma.emailVerificationCode.deleteMany({ where: { userId: user.id } }),
    prisma.emailVerificationCode.create({
      data: { userId: user.id, codeHash: hashCode(user.id, code), expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60_000) },
    }),
  ]);

  try {
    await sendVerificationCodeEmail(user.email, user.name, code, CODE_TTL_MINUTES);
  } catch (err) {
    // Not sent, so don't let it block an immediate retry.
    await prisma.emailVerificationCode.deleteMany({ where: { id: created.id } });
    throw err;
  }
  return { sent: true, retryAfter: RESEND_COOLDOWN_SECONDS };
};

/** Checks a code and marks the email verified. Throws a 400 the student can read. */
export const verifyCode = async (email: string, code: string) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new AppError(400, "That code isn't right. Check the email and try again.");
  if (user.emailVerified) throw new AppError(400, "This email is already verified. Please log in.", "ALREADY_VERIFIED");

  const latest = await prisma.emailVerificationCode.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
  if (!latest || latest.expiresAt < new Date()) {
    throw new AppError(400, "This code has expired. Tap “Send a new code”.", "CODE_EXPIRED");
  }
  if (latest.attempts >= MAX_ATTEMPTS) {
    throw new AppError(400, "Too many wrong tries. Tap “Send a new code”.", "CODE_LOCKED");
  }

  if (!sameHash(latest.codeHash, hashCode(user.id, code))) {
    // Guarded so two quick wrong guesses can't both slip under the cap.
    await prisma.emailVerificationCode.updateMany({
      where: { id: latest.id, attempts: { lt: MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    const left = MAX_ATTEMPTS - latest.attempts - 1;
    throw new AppError(
      400,
      left > 0 ? `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.` : "Too many wrong tries. Tap “Send a new code”.",
      left > 0 ? "CODE_WRONG" : "CODE_LOCKED"
    );
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } }),
    prisma.emailVerificationCode.deleteMany({ where: { userId: user.id } }),
  ]);
  return user;
};
