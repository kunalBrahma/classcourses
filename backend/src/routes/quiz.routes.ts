import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware";
import { validateBody } from "../middleware/validate.middleware";
import { quizLimiter } from "../middleware/rateLimiter";
import { requireFullAccess } from "../middleware/role.middleware";
import { answer, available, getQuizInfo, history, next, pause, show, start, today } from "../controllers/quiz.controller";
import { startQuizSchema, submitAnswerSchema } from "../validations/quiz.validation";

// Logged-in students only; rate limited per user.
const router = Router();
router.use(authenticate, quizLimiter);

router.get("/", getQuizInfo);
router.get("/today", today);
router.get("/available", available);
router.get("/history", history);
// Taking a quiz (and earning coins) needs full access: date of birth, and a
// parent's consent under 18. Looking at quizzes and history doesn't.
router.post("/start", requireFullAccess, validateBody(startQuizSchema), start);
router.get("/attempts/:id", show);
router.post("/attempts/:id/next", requireFullAccess, next);
router.post("/attempts/:id/answer", requireFullAccess, validateBody(submitAnswerSchema), answer);
router.post("/attempts/:id/pause", pause);

export default router;
