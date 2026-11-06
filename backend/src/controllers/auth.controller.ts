import { Request, Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import prisma from "../config/prisma";
import { hashPassword, comparePassword } from "../utils/password";
import { generateAccessToken, generateRefreshToken } from "../utils/jwt";
import { AppError } from "../utils/AppError";
import { asyncHandler } from "../utils/asyncHandler";
import { parseDateOfBirth, profileOptions, profileStatus, requireActiveClass, requireActiveDistrict } from "../services/profile.service";
import { sendAuthCodeEmail } from "../utils/mailer";
import { issueAuthCode, useAuthCode } from "../services/authCode.service";
import { accountKey, activeLock, clearAccount, clearNetwork, ipThrottleKey, LockInfo, recordLoginFailure, waitText } from "../services/loginThrottle.service";
import { AUTH_CODE_RESEND_SECONDS, AUTH_CODE_TTL_SECONDS } from "../config/limits";
import { AdminLoginResult } from "@prisma/client";
import { signInWithGoogle } from "../services/googleAuth.service";
import { RESEND_COOLDOWN_SECONDS, sendVerificationCode, verifyCode } from "../services/emailVerification.service";

const issueTokenPair = async (userId: string, email: string) => {
  const accessToken = generateAccessToken({ userId, email });
  const { token: refreshToken, expiresAt } = generateRefreshToken();

  await prisma.refreshToken.create({
    data: { token: refreshToken, userId, expiresAt },
  });

  return { accessToken, refreshToken };
};

const userView = (u: { id: string; email: string; name: string | null; role: string; createdAt: Date }) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  createdAt: u.createdAt,
});

// Creates the account unverified and emails a 6-digit code. No tokens yet:
// the student is logged in by POST /verify-email once they enter the code.
export const register = asyncHandler(async (req: Request, res: Response) => {
  const { email, password, name, phone } = req.body;

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser?.emailVerified) {
    throw new AppError(400, "This email is already registered. Please log in.");
  }

  // Class, district and date of birth (rules in profile.service.ts)
  const profile = {
    classLevelId: await requireActiveClass(req.body.classLevelId),
    districtId: await requireActiveDistrict(req.body.districtId),
    dateOfBirth: parseDateOfBirth(req.body.dateOfBirth),
  };
  const hashedPassword = await hashPassword(password);

  // Signing up again before verifying (e.g. a typo in the password) just
  // replaces the unverified details: until the code is entered, nobody has
  // proven they own this email.
  const user = existingUser
    ? await prisma.user.update({ where: { id: existingUser.id }, data: { password: hashedPassword, name, phone, ...profile } })
    : await prisma.user.create({ data: { email, password: hashedPassword, name, phone, ...profile, emailVerified: false } });

  const { retryAfter } = await sendVerificationCode(user);

  res.status(201).json({
    message: "We've sent a 6-digit code to your email",
    needsVerification: true,
    email: user.email,
    retryAfter,
  });
});

export const verifyEmail = asyncHandler(async (req: Request, res: Response) => {
  const user = await verifyCode(req.body.email, req.body.code);
  const { accessToken, refreshToken } = await issueTokenPair(user.id, user.email);
  res.json({ message: "Email verified", user: userView(user), accessToken, refreshToken });
});

// Always answers the same way, whether or not the email is registered.
export const resendVerificationCode = asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { email: req.body.email } });
  let retryAfter = RESEND_COOLDOWN_SECONDS;
  if (user && !user.emailVerified) retryAfter = (await sendVerificationCode(user)).retryAfter;
  res.json({ message: "If that account is waiting for a code, a new one has been sent", retryAfter });
});

// Who is asking: the IP (TRUST_PROXY must be right) and browser, for the
// failed sign-in counts and the admin sign-in log.
const clientIp = (req: Request) => req.ip ?? "unknown";
const logAdmin = (req: Request, email: string, userId: string | null, result: AdminLoginResult) =>
  prisma.adminLoginAttempt
    .create({ data: { email, userId, result, ip: clientIp(req), userAgent: req.get("user-agent")?.slice(0, 300) ?? null } })
    .catch((err) => console.error("[auth] couldn't log an admin sign-in:", err));

const lockedError = (lock: LockInfo) =>
  new AppError(
    429,
    `Too many wrong passwords. For your safety, sign-in is paused for ${waitText(lock.retryAfter)}. You can reset your password, or ask for an unlock code by email.`,
    "LOGIN_LOCKED",
    { retryAfter: lock.retryAfter, lockedUntil: lock.lockedUntil.toISOString() }
  );

// Failed sign-ins are counted in the database per account and per network
// (services/loginThrottle.service.ts): 5 wrong passwords in 15 minutes pause
// the account, and the pause grows each time. Admin accounts have their own,
// stricter rule with a short cap, and every attempt on them is logged.
export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const ip = clientIp(req);

  const user = await prisma.user.findUnique({ where: { email } });
  const isAdmin = user?.role === "ADMIN";

  const lock = await activeLock([accountKey(email), ipThrottleKey(ip)]);
  if (lock) {
    if (isAdmin) await logAdmin(req, email, user!.id, "LOCKED");
    throw lockedError(lock);
  }

  // Unknown email, a Google-only account (no password) or a wrong password:
  // the same answer and the same count, so nothing reveals which emails exist.
  const isPasswordValid = Boolean(user && user.password !== null && (await comparePassword(password, user.password)));
  if (!user || !isPasswordValid) {
    const failure = await recordLoginFailure(email, ip, isAdmin);
    if (isAdmin) await logAdmin(req, email, user!.id, failure.lock ? "LOCKED" : "WRONG_PASSWORD");
    if (failure.lock) throw lockedError(failure.lock);
    throw new AppError(
      401,
      failure.triesLeft <= 2
        ? `Email or password is wrong. ${failure.triesLeft} ${failure.triesLeft === 1 ? "try" : "tries"} left before sign-in is paused.`
        : "Email or password is wrong.",
      "WRONG_PASSWORD",
      { triesLeft: failure.triesLeft }
    );
  }
  await clearAccount(email);

  // Right password, email not verified yet: send a code (unless one just
  // went out) and let the client show the code screen.
  if (!user.emailVerified) {
    await sendVerificationCode(user);
    throw new AppError(403, "Please verify your email first. We've sent a 6-digit code to it.", "EMAIL_NOT_VERIFIED");
  }

  const { accessToken, refreshToken } = await issueTokenPair(user.id, user.email);
  if (isAdmin) await logAdmin(req, email, user.id, "SUCCESS");

  res.json({
    message: "Login successful",
    user: userView(user),
    accessToken,
    refreshToken,
  });
});

export const loginWithGoogle = asyncHandler(async (req: Request, res: Response) => {
  const user = await signInWithGoogle(req.body.credential);
  const { accessToken, refreshToken } = await issueTokenPair(user.id, user.email);
  res.json({ message: "Login successful", user: userView(user), accessToken, refreshToken });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body;

  const stored = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
    include: { user: true },
  });

  if (!stored || stored.expiresAt < new Date()) {
    if (stored) {
      await prisma.refreshToken.delete({ where: { id: stored.id } });
    }
    throw new AppError(401, "Invalid or expired refresh token");
  }

  // Rotate: delete the used token and issue a brand new pair. If a stolen
  // token is ever replayed after the legitimate client already rotated it,
  // this lookup simply fails (already deleted), which is the desired result.
  await prisma.refreshToken.delete({ where: { id: stored.id } });

  const { accessToken, refreshToken: newRefreshToken } = await issueTokenPair(
    stored.user.id,
    stored.user.email
  );

  res.json({ accessToken, refreshToken: newRefreshToken });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body;

  await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });

  res.json({ message: "Logged out successfully" });
});

const CODE_MINUTES = AUTH_CODE_TTL_SECONDS / 60;

// Emails a 6-digit code (valid exactly 5 minutes; a new code cancels the old
// one). Always the same answer whether or not the email is registered.
export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true } });
  if (user) {
    await issueAuthCode(user.id, "RESET_PASSWORD", (code) => sendAuthCodeEmail(user.email, "RESET_PASSWORD", code, CODE_MINUTES));
  }
  res.json({ message: "If that email is registered, we've sent a 6-digit code to it", retryAfter: AUTH_CODE_RESEND_SECONDS, expiresInMinutes: CODE_MINUTES });
});

// Code + new password. Entering the code proves the email is theirs, so it
// also verifies the email, clears any sign-in pause, and signs out every device.
export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email, code, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  await useAuthCode(user?.id ?? null, "RESET_PASSWORD", code);

  const hashedPassword = await hashPassword(password);
  await prisma.$transaction([
    prisma.user.update({ where: { id: user!.id }, data: { password: hashedPassword, emailVerified: true } }),
    prisma.authCode.deleteMany({ where: { userId: user!.id, purpose: "RESET_PASSWORD" } }),
    prisma.refreshToken.deleteMany({ where: { userId: user!.id } }),
  ]);
  await clearAccount(email);
  res.json({ message: "Password changed. Sign in with your new password." });
});

// "Email me an unlock code" when sign-in is paused. Sent only if the account
// exists and is paused right now; the answer is always the same.
export const requestUnlockCode = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, role: true } });
  if (user && (await activeLock([accountKey(email)]))) {
    const sent = await issueAuthCode(user.id, "UNLOCK_ACCOUNT", (code) => sendAuthCodeEmail(user.email, "UNLOCK_ACCOUNT", code, CODE_MINUTES));
    if (sent && user.role === "ADMIN") await logAdmin(req, email, user.id, "UNLOCK_CODE_SENT");
  }
  res.json({ message: "If that account is paused, we've emailed it an unlock code", retryAfter: AUTH_CODE_RESEND_SECONDS, expiresInMinutes: CODE_MINUTES });
});

// The unlock code ends the pause for the account and for this network. The
// password is still needed to sign in.
export const unlockAccount = asyncHandler(async (req: Request, res: Response) => {
  const { email, code } = req.body;
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } });
  await useAuthCode(user?.id ?? null, "UNLOCK_ACCOUNT", code);
  await Promise.all([clearAccount(email), clearNetwork(clientIp(req))]);
  if (user!.role === "ADMIN") await logAdmin(req, email, user!.id, "UNLOCKED");
  res.json({ message: "Unlocked. You can sign in now." });
});

// Classes and districts for the sign-up and profile forms (public).
export const getProfileOptions = asyncHandler(async (_req: Request, res: Response) => {
  res.json(await profileOptions());
});

export const getMe = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) {
    throw new AppError(401, "Unauthorized");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      role: true,
      mediumId: true,
      classLevelId: true,
      classLevel: { select: { id: true, name: true, slug: true } },
      districtId: true,
      district: { select: { id: true, name: true, nativeName: true } },
      dateOfBirth: true,
      coins: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user) {
    throw new AppError(404, "User not found");
  }

  // profileComplete / missingProfile / dateOfBirth ("YYYY-MM-DD") / age / isMinor
  const { dateOfBirth: _dob, ...rest } = user;
  res.json({ user: { ...rest, ...profileStatus(user) } });
});
