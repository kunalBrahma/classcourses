import { Router } from "express";
import {
  getChapter,
  getClassSubjects,
  getMediumClasses,
  getSubject,
  listMediums,
  checkAnswer,
  featuredVideos,
  listVideos,
  quizPicker,
  catalogStats,
  search,
} from "../controllers/catalog.controller";
import { checkAnswerLimiter, searchLimiter } from "../middleware/rateLimiter";
import { validateBody } from "../middleware/validate.middleware";
import { available as availableQuizzes } from "../controllers/quiz.controller";
import { checkAnswerSchema } from "../validations/content.validation";

// Public catalog for the student site. `:classSlug` accepts "11" or "class-11".
const router = Router();

router.get("/mediums", listMediums);
router.get("/search", searchLimiter, search);
router.get("/videos/featured", featuredVideos);
router.get("/videos", listVideos);
router.get("/quiz-picker", quizPicker);
router.get("/stats", catalogStats);
router.get("/mediums/:medium", getMediumClasses);
router.get("/mediums/:medium/classes/:classSlug", getClassSubjects);
router.get("/mediums/:medium/classes/:classSlug/subjects/:subject", getSubject);
router.get("/mediums/:medium/classes/:classSlug/subjects/:subject/chapters/:chapter", getChapter);

// Quizzes on a page: ?chapterId= | ?subjectId= | ?mediumId=&classId= (or &classSlug=)
router.get("/quizzes", availableQuizzes);

router.post("/questions/:id/check", checkAnswerLimiter, validateBody(checkAnswerSchema), checkAnswer);

export default router;
