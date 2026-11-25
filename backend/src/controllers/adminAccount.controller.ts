import { Response } from "express";
import prisma from "../config/prisma";
import { AuthRequest } from "../middleware/auth.middleware";
import { noteActivity } from "../middleware/adminActivity";
import { asyncHandler } from "../utils/asyncHandler";
import { changePassword, confirmEmailChange, requestEmailChange } from "../services/myAccount.service";

// Admin → Settings → My account: the signed-in admin's own sign-in details.
const ip = (req: AuthRequest) => req.ip ?? "unknown";

export const getMyAccount = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.user!.userId },
    select: { id: true, email: true, name: true, adminLevel: true, password: true },
  });
  const { password, ...rest } = user;
  res.json({ ...rest, hasPassword: password !== null });
});

export const changeMyPassword = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tokens = await changePassword(req.user!.userId, req.body, ip(req));
  noteActivity(res, { action: "account.password", targetType: "user", targetId: req.user!.userId, summary: "Changed own password (other devices signed out)" });
  res.json({ message: "Password changed. Other devices have been signed out.", ...tokens });
});

export const requestMyEmailChange = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await requestEmailChange(req.user!.userId, req.body, ip(req));
  res.json({ message: `We've sent a 6-digit code to ${result.newEmail}`, ...result });
});

export const confirmMyEmailChange = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await confirmEmailChange(req.user!.userId, req.body.code);
  noteActivity(res, {
    action: "account.email",
    targetType: "user",
    targetId: req.user!.userId,
    summary: "Changed own sign-in email",
    before: { email: result.oldEmail },
    after: { email: result.email },
  });
  res.json({ message: "Sign-in email changed", email: result.email });
});
