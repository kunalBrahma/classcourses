import { Request, Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import prisma from "../config/prisma";
import { hashPassword, comparePassword } from "../utils/password";
import { generateAccessToken, generateRefreshToken } from "../utils/jwt";
import { AppError } from "../utils/AppError";
import { asyncHandler } from "../utils/asyncHandler";
import { sendPasswordResetEmail } from "../utils/mailer";
import crypto from "crypto";

const issueTokenPair = async (userId: string, email: string) => {
  const accessToken = generateAccessToken({ userId, email });
  const { token: refreshToken, expiresAt } = generateRefreshToken();

  await prisma.refreshToken.create({
    data: { token: refreshToken, userId, expiresAt },
  });

  return { accessToken, refreshToken };
};

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { email, password, name } = req.body;

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new AppError(400, "User already exists");
  }

  const hashedPassword = await hashPassword(password);

  const user = await prisma.user.create({
    data: { email, password: hashedPassword, name: name || null },
    select: { id: true, email: true, name: true, createdAt: true },
  });

  const { accessToken, refreshToken } = await issueTokenPair(user.id, user.email);

  res.status(201).json({
    message: "User registered successfully",
    user,
    accessToken,
    refreshToken,
  });
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

  const { accessToken, refreshToken } = await issueTokenPair(user.id, user.email);

  res.json({
    message: "Login successful",
    user: { id: user.id, email: user.email, name: user.name, role: user.role, createdAt: user.createdAt },
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
      data: { password: hashedPassword },
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
