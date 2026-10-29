import { Request, Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import prisma from "../config/prisma";
import { hashPassword, comparePassword } from "../utils/password";
import { generateAccessToken, generateRefreshToken } from "../utils/jwt";
import { AppError } from "../utils/AppError";
import { asyncHandler } from "../utils/asyncHandler";
import { sendPasswordResetEmail } from "../utils/mailer";
import { RESEND_COOLDOWN_SECONDS, sendVerificationCode, verifyCode } from "../services/emailVerification.service";
import crypto from "crypto";

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

  const hashedPassword = await hashPassword(password);

  // Signing up again before verifying (e.g. a typo in the password) just
  // replaces the unverified details: until the code is entered, nobody has
  // proven they own this email.
  const user = existingUser
    ? await prisma.user.update({ where: { id: existingUser.id }, data: { password: hashedPassword, name, phone } })
    : await prisma.user.create({ data: { email, password: hashedPassword, name, phone, emailVerified: false } });

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

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new AppError(401, "Invalid credentials");
  }

  const isPasswordValid = await comparePassword(password, user.password);
  if (!isPasswordValid) {
    throw new AppError(401, "Invalid credentials");
  }

  // Right password, email not verified yet: send a code (unless one just
  // went out) and let the client show the code screen.
  if (!user.emailVerified) {
    await sendVerificationCode(user);
    throw new AppError(403, "Please verify your email first. We've sent a 6-digit code to it.", "EMAIL_NOT_VERIFIED");
  }

  const { accessToken, refreshToken } = await issueTokenPair(user.id, user.email);

  res.json({
    message: "Login successful",
    user: userView(user),
    accessToken,
    refreshToken,
  });
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

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });

  // Always respond the same way whether the user exists or not, so this
  // endpoint can't be used to enumerate registered emails.
  if (user) {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.passwordResetToken.create({
      data: { token, userId: user.id, expiresAt },
    });

    await sendPasswordResetEmail(user.email, token);
  }

  res.json({ message: "If that email is registered, a reset link has been sent" });
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { token, password } = req.body;

  const resetToken = await prisma.passwordResetToken.findUnique({ where: { token } });

  if (!resetToken || resetToken.expiresAt < new Date()) {
    throw new AppError(400, "Invalid or expired reset token");
  }

  const hashedPassword = await hashPassword(password);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetToken.userId },
      // Opening the emailed link proves they own the email.
      data: { password: hashedPassword, emailVerified: true },
    }),
    prisma.passwordResetToken.delete({ where: { id: resetToken.id } }),
    // Invalidate every existing session on password change.
    prisma.refreshToken.deleteMany({ where: { userId: resetToken.userId } }),
  ]);

  res.json({ message: "Password reset successfully" });
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
      classLevel: { select: { id: true, name: true, slug: true } },
      coins: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user) {
    throw new AppError(404, "User not found");
  }

  res.json({ user });
});
