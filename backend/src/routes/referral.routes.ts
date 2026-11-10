import { Router } from "express";
import { getInvite } from "../controllers/referral.controller";
import { referralLinkLimiter } from "../middleware/rateLimiter";

// Public: the sign-up page checks an invite code ("Invited by Rohan").
const router = Router();
router.get("/invite/:code", referralLinkLimiter, getInvite);
export default router;
