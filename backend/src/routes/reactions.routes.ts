import { Router } from "express";
import { getReactions, putLike, putSave } from "../controllers/engagement.controller";
import { authenticate, optionalAuthenticate } from "../middleware/auth.middleware";
import { likeLimiter, saveLimiter } from "../middleware/rateLimiter";
import { validateBody } from "../middleware/validate.middleware";
import { reactionSchema } from "../validations/engagement.validation";

// Like / Save on chapter pages and blog posts. The total is public; liking and
// saving need an account (one like per account).
const router = Router();

router.get("/", optionalAuthenticate, getReactions);
router.put("/like", authenticate, likeLimiter, validateBody(reactionSchema), putLike);
router.put("/save", authenticate, saveLimiter, validateBody(reactionSchema), putSave);

export default router;
