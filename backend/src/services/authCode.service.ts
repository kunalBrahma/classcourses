import crypto from "crypto";
import { AuthCodePurpose } from "@prisma/client";
import prisma from "../config/prisma";
import { AUTH_CODE_MAX_ATTEMPTS, AUTH_CODE_RESEND_SECONDS, AUTH_CODE_TTL_SECONDS } from "../config/limits";
import { AppError } from "../utils/AppError";
import { hashCode } from "./emailVerification.service";

// 6-digit codes emailed for "forgot password" and "unlock my account"
// (client requirements of 6 Nov 2026): valid exactly 5 minutes, a new code
// cancels the old one, wrong guesses are capped per code, and only a hash is
// stored. The purpose is mixed into the hash, so a code for one can't be used
// for the other.

const sameHash = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const hashFor = (userId: string, purpose: AuthCodePurpose, code: string) => hashCode(`${userId}:${purpose}`, code);

/**
 * Makes a new code (deleting any earlier one for the same purpose) and hands
 * it to `send`. Returns null without sending if one went out less than
 * AUTH_CODE_RESEND_SECONDS ago: the earlier code still works.
 */
export const issueAuthCode = async (userId: string, purpose: AuthCodePurpose, send: (code: string) => Promise<void>) => {
  const latest = await prisma.authCode.findFirst({ where: { userId, purpose }, orderBy: { createdAt: "desc" } });
  if (latest && Date.now() - latest.createdAt.getTime() < AUTH_CODE_RESEND_SECONDS * 1000) return null;

  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
  const [, created] = await prisma.$transaction([
    prisma.authCode.deleteMany({ where: { userId, purpose } }),
    prisma.authCode.create({
      data: { userId, purpose, codeHash: hashFor(userId, purpose, code), expiresAt: new Date(Date.now() + AUTH_CODE_TTL_SECONDS * 1000) },
    }),
  ]);
  try {
    await send(code);
  } catch (err) {
    // Not sent: don't block an immediate retry.
    await prisma.authCode.deleteMany({ where: { id: created.id } });
    throw err;
  }
  return created;
};

/**
 * Checks a code. On success the code is used up (deleted). Every failure
 * throws a 400 the student can read: expired, too many tries, or wrong.
 * Unknown accounts get the same "isn't right" answer as a wrong code.
 */
export const useAuthCode = async (userId: string | null, purpose: AuthCodePurpose, code: string) => {
  const latest = userId ? await prisma.authCode.findFirst({ where: { userId, purpose }, orderBy: { createdAt: "desc" } }) : null;
  if (!userId || !latest) throw new AppError(400, "That code isn't right. Check the email and the code, or ask for a new code.", "CODE_WRONG");
  if (latest.expiresAt.getTime() <= Date.now()) {
    throw new AppError(400, "This code has expired (codes work for 5 minutes). Ask for a new code.", "CODE_EXPIRED");
  }
  if (latest.attempts >= AUTH_CODE_MAX_ATTEMPTS) throw new AppError(400, "Too many wrong tries. Ask for a new code.", "CODE_LOCKED");

  if (!sameHash(latest.codeHash, hashFor(userId, purpose, code))) {
    // Guarded so two quick wrong guesses can't both slip under the cap.
    await prisma.authCode.updateMany({ where: { id: latest.id, attempts: { lt: AUTH_CODE_MAX_ATTEMPTS } }, data: { attempts: { increment: 1 } } });
    const left = AUTH_CODE_MAX_ATTEMPTS - latest.attempts - 1;
    throw new AppError(
      400,
      left > 0 ? `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.` : "Too many wrong tries. Ask for a new code.",
      left > 0 ? "CODE_WRONG" : "CODE_LOCKED"
    );
  }
  // Used once: deleting it (guarded by id) means a second use finds nothing.
  const { count } = await prisma.authCode.deleteMany({ where: { id: latest.id } });
  if (count === 0) throw new AppError(400, "This code was already used. Ask for a new code.", "CODE_WRONG");
};
