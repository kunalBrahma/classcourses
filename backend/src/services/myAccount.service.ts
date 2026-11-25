import prisma from "../config/prisma";
import { AUTH_CODE_RESEND_SECONDS, AUTH_CODE_TTL_SECONDS } from "../config/limits";
import { AppError } from "../utils/AppError";
import { comparePassword, hashPassword } from "../utils/password";
import { issueTokenPair } from "../utils/tokens";
import { sendEmailChangeCode, sendEmailChangedNotice } from "../utils/mailer";
import { assertEmailNotBlocked, signOutEverywhereTx } from "./account.service";
import { issueAuthCode, useAuthCode } from "./authCode.service";
import { accountKey, activeLock, recordLoginFailure, waitText } from "./loginThrottle.service";

// "My account" for a signed-in admin: change your own password and your
// sign-in email. Every rule is here; the controller only passes values in.

const CODE_MINUTES = AUTH_CODE_TTL_SECONDS / 60;

/**
 * Checks the current password. A wrong one counts as a failed sign-in (same
 * pause rules as the login page), so this screen can't be used to guess it.
 */
const checkCurrentPassword = async (userId: string, password: string, ip: string) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const isAdmin = user.role === "ADMIN";
  const lock = await activeLock([accountKey(user.email)]);
  if (lock) throw new AppError(429, `Too many wrong passwords. Please wait ${waitText(lock.retryAfter)} and try again.`, "LOGIN_LOCKED", { retryAfter: lock.retryAfter });
  if (user.password === null) {
    throw new AppError(400, "This account has no password yet. Sign out and use “Forgot password” to set one.", "NO_PASSWORD");
  }
  if (!(await comparePassword(password, user.password))) {
    const failure = await recordLoginFailure(user.email, ip, isAdmin);
    if (failure.accountLocked && failure.lock) {
      throw new AppError(429, `Too many wrong passwords. Please wait ${waitText(failure.lock.retryAfter)} and try again.`, "LOGIN_LOCKED", { retryAfter: failure.lock.retryAfter });
    }
    throw new AppError(400, "Your current password isn't right.", "WRONG_PASSWORD");
  }
  return user;
};

/**
 * New password, then every other device is signed out (old tokens stop
 * working). This browser gets a fresh token pair so it stays signed in.
 */
export const changePassword = async (userId: string, input: { currentPassword: string; newPassword: string }, ip: string) => {
  const user = await checkCurrentPassword(userId, input.currentPassword, ip);
  if (input.currentPassword === input.newPassword) throw new AppError(400, "The new password must be different from the current one.");

  const hashed = await hashPassword(input.newPassword);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { password: hashed } });
    await signOutEverywhereTx(tx, userId);
  });
  return issueTokenPair(userId, user.email);
};

const normaliseEmail = (email: string) => email.trim().toLowerCase();

const assertEmailFree = async (email: string, userId: string) => {
  const taken = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" }, id: { not: userId } }, select: { id: true } });
  if (taken) throw new AppError(409, "Another account already uses this email.", "EMAIL_TAKEN");
};

/** Step 1: password + new address → a 6-digit code is emailed to the NEW address. */
export const requestEmailChange = async (userId: string, input: { password: string; newEmail: string }, ip: string) => {
  const user = await checkCurrentPassword(userId, input.password, ip);
  const newEmail = normaliseEmail(input.newEmail);
  if (newEmail === user.email.toLowerCase()) throw new AppError(400, "This is already your sign-in email.");
  await assertEmailNotBlocked(newEmail);
  await assertEmailFree(newEmail, userId);

  // A new request (even to another address) replaces the earlier code. Within
  // a minute of the last one, the earlier code (and address) still stands.
  const latest = await prisma.authCode.findFirst({ where: { userId, purpose: "CHANGE_EMAIL" }, orderBy: { createdAt: "desc" } });
  if (latest && latest.newEmail !== newEmail) await prisma.authCode.deleteMany({ where: { userId, purpose: "CHANGE_EMAIL" } });
  const sent = await issueAuthCode(userId, "CHANGE_EMAIL", (code) => sendEmailChangeCode(newEmail, code, CODE_MINUTES), { newEmail });
  if (!sent) throw new AppError(429, "A code was just sent. Please wait a minute before asking for another.", "CODE_RECENT", { retryAfter: AUTH_CODE_RESEND_SECONDS });
  return { newEmail, expiresInMinutes: CODE_MINUTES, retryAfter: AUTH_CODE_RESEND_SECONDS };
};

/** Step 2: the code from the new inbox → the sign-in email changes; the old address is told. */
export const confirmEmailChange = async (userId: string, code: string) => {
  const row = await useAuthCode(userId, "CHANGE_EMAIL", code);
  const newEmail = row.newEmail;
  if (!newEmail) throw new AppError(400, "Ask for a new code.", "CODE_WRONG");

  const { email: oldEmail } = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
  await assertEmailFree(newEmail, userId);
  try {
    await prisma.user.update({ where: { id: userId }, data: { email: newEmail, emailVerified: true } });
  } catch (err) {
    // Taken in the moment between the check and the update (unique email)
    if ((err as { code?: string }).code === "P2002") throw new AppError(409, "Another account already uses this email.", "EMAIL_TAKEN");
    throw err;
  }
  await sendEmailChangedNotice(oldEmail, newEmail);
  return { oldEmail, email: newEmail };
};
