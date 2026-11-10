import { Request, Response } from "express";
import { z } from "zod";
import { AuthRequest } from "../middleware/auth.middleware";
import { noteActivity } from "../middleware/adminActivity";
import { asyncHandler } from "../utils/asyncHandler";
import { approveReferral, inviteInfo, listReferralsAdmin, referralOverview, referralSummary, rejectReferral, reverseReferral } from "../services/referral.service";

// Refer and Earn (Phase 15). Rules: src/services/referral.service.ts.

const deviceId = (req: Request) => {
  const v = req.get("x-device-id");
  return v && /^[A-Za-z0-9-]{8,64}$/.test(v) ? v : null;
};

export const getMyReferrals = asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json(await referralOverview(req.user!.userId, { ip: req.ip ?? null, deviceId: deviceId(req) }));
});

export const getInvite = asyncHandler(async (req: Request, res: Response) => {
  res.json(await inviteInfo(req.params.code));
});

// ---- Admin (Super Admin only: not in adminAccess.ts sections) ----
const listQuery = z.object({
  status: z.enum(["PENDING", "REWARDED", "HELD", "REJECTED", "REVERSED"]).optional(),
  userId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const listReferrals = asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json(await listReferralsAdmin(listQuery.parse(req.query)));
});

export const getReferralSummary = asyncHandler(async (_req: AuthRequest, res: Response) => {
  res.json(await referralSummary());
});

export const approve = asyncHandler(async (req: AuthRequest, res: Response) => {
  await approveReferral(req.params.id, req.user!.userId, req.body.note);
  noteActivity(res, { action: "referral.approve", targetType: "referral", targetId: req.params.id, reason: req.body.note, summary: "Approved a held referral (coins given)" });
  res.json({ message: "Approved. The coins were added." });
});

export const reject = asyncHandler(async (req: AuthRequest, res: Response) => {
  await rejectReferral(req.params.id, req.user!.userId, req.body.note);
  noteActivity(res, { action: "referral.reject", targetType: "referral", targetId: req.params.id, reason: req.body.note, summary: "Rejected a referral (no coins)" });
  res.json({ message: "Rejected. No coins were given." });
});

export const reverse = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await reverseReferral(req.params.id, req.user!.userId, req.body.note);
  const short = result.shortfall.referrer + result.shortfall.friend;
  noteActivity(res, { action: "referral.reverse", targetType: "referral", targetId: req.params.id, reason: req.body.note, summary: `Reversed a referral reward (took back ${result.taken.referrer} + ${result.taken.friend} coins)`, after: result });
  res.json({
    message: `Reversed. Took back ${result.taken.referrer + result.taken.friend} coins${short ? `; ${short} had already been spent` : ""}.`,
    ...result,
  });
});
