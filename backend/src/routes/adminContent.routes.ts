import { Router } from "express";
import { validateBody } from "../middleware/validate.middleware";
import {
  createImageUpload,
  createQuestion,
  createVideo,
  deleteQuestion,
  deleteVideo,
  getChapterContentAdmin,
  importQuestions,
  reorderQuestions,
  reorderVideos,
  updateQuestion,
  updateVideo,
} from "../controllers/adminContent.controller";
import {
  createQuestionSchema,
  createVideoSchema,
  imageUploadSchema,
  importQuestionsSchema,
  reorderQuestionsSchema,
  reorderVideosSchema,
  updateQuestionSchema,
  updateVideoSchema,
} from "../validations/content.validation";

// Mounted inside admin.routes.ts, which already enforces authenticate + ADMIN.
const router = Router();

router.get("/chapters/:chapterId/content", getChapterContentAdmin);

// Questions
router.post("/chapters/:chapterId/questions", validateBody(createQuestionSchema), createQuestion);
router.post("/chapters/:chapterId/questions/import", validateBody(importQuestionsSchema), importQuestions);
router.put("/chapters/:chapterId/questions/reorder", validateBody(reorderQuestionsSchema), reorderQuestions);
router.patch("/questions/:id", validateBody(updateQuestionSchema), updateQuestion);
router.delete("/questions/:id", deleteQuestion);

// Videos
router.post("/chapters/:chapterId/videos", validateBody(createVideoSchema), createVideo);
router.put("/chapters/:chapterId/videos/reorder", validateBody(reorderVideosSchema), reorderVideos);
router.patch("/videos/:id", validateBody(updateVideoSchema), updateVideo);
router.delete("/videos/:id", deleteVideo);

// Image uploads for rich text (presigned PUT to the public bucket)
router.post("/uploads/images", validateBody(imageUploadSchema), createImageUpload);

export default router;
