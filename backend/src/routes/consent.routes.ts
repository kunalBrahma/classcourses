import { Request, Response, Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { validateBody } from "../middleware/validate.middleware";
import { consentLinkLimiter } from "../middleware/rateLimiter";
import { consentForParent, decideConsent } from "../services/consent.service";
import { decideConsentSchema } from "../validations/users.validation";

// The parent's side of consent (no account needed): the link emailed to them.
const router = Router();
router.use(consentLinkLimiter);

router.get(
  "/:token",
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await consentForParent(req.params.token));
  })
);

router.post(
  "/:token",
  validateBody(decideConsentSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await decideConsent(req.params.token, req.body, { ip: req.ip ?? null, userAgent: req.get("user-agent") ?? null });
    res.json({ ...result, message: result.status === "GRANTED" ? "Thank you. Your child's account is now fully active." : "Thank you. Your answer is saved: the account stays limited." });
  })
);

export default router;
