import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware";
import { validateBody } from "../middleware/validate.middleware";
import { quizLimiter } from "../middleware/rateLimiter";
import { answer, available, getQuizInfo, history, next, pause, show, start, today } from "../controllers/quiz.controller";
import { startQuizSchema, submitAnswerSchema } from "../validations/quiz.validation";

// Logged-in students only; rate limited per user.
const router = Router();
router.use(authenticate, quizLimiter);

router.get("/", getQuizInfo);
router.get("/today", today);
router.get("/available", available);
router.get("/history", history);
router.post("/start", validateBody(startQuizSchema), start);
router.get("/attempts/:id", show);
router.post("/attempts/:id/next", next);
router.post("/attempts/:id/answer", validateBody(submitAnswerSchema), answer);
router.post("/attempts/:id/pause", pause);

export default router;
