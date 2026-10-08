import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/role.middleware";
import { validateBody } from "../middleware/validate.middleware";
import {
  getSettingHandler,
  getSmtpSettings,
  getStorageSettings,
  listSettings,
  resetSettingHandler,
  resetSmtpSettings,
  resetStorageSettings,
  testActiveSmtp,
  testActiveStorage,
  testSmtpSettings,
  testStorageSettings,
  updateSettingHandler,
  updateSmtpSettings,
  updateStorageSettings,
  getRazorpaySettings,
  resetRazorpaySettings,
  testRazorpaySettings,
  updateRazorpaySettings,
} from "../controllers/settings.controller";
import {
  smtpSettingsInputSchema,
  smtpTestInputSchema,
  storageSettingsInputSchema,
  razorpaySettingsInputSchema,
} from "../validations/settings.validation";
import {
  attachNoteFile,
  createNote,
  createNoteUploadUrl,
  deleteNote,
  getOrderAdmin,
  grantNoteAccess,
  listNotesAdmin,
  listOrdersAdmin,
  reconcileOrderAdmin,
  updateNote,
} from "../controllers/adminNotes.controller";
import {
  createNoteSchema,
  grantNoteSchema,
  noteFileSchema,
  noteUploadUrlSchema,
  updateNoteSchema,
} from "../validations/notes.validation";
import {
  createFaq,
  deleteFaq,
  getPageAdmin,
  listFaqAdmin,
  listPagesAdmin,
  reorderFaq,
  updateFaq,
  updatePage,
} from "../controllers/pages.controller";
import { createFaqSchema, reorderFaqSchema, updateFaqSchema, updatePageSchema } from "../validations/pages.validation";
import adminCatalogRoutes from "./adminCatalog.routes";
import adminContentRoutes from "./adminContent.routes";
import { getQuizAttempt, getQuizStatsHandler, listQuizAttempts } from "../controllers/adminQuiz.controller";
import { adjustUserCoins, getUserAdmin, listUsersAdmin, updateUserAdmin } from "../controllers/adminUsers.controller";
import { adjustCoinsSchema, quizFlagSchema, quizInputSchema, reorderQuizzesSchema, updateUserAdminSchema } from "../validations/quiz.validation";
import {
  chapterQuizOverview,
  createQuiz,
  deleteQuiz,
  duplicateQuiz,
  flagQuizQuestions,
  getQuiz,
  listQuizQuestions,
  listQuizzes,
  previewQuiz,
  quizPool,
  reorderQuizzes,
  updateQuiz,
} from "../controllers/adminQuizBuilder.controller";

const router = Router();

// Every /api/admin route requires a logged-in ADMIN.
router.use(authenticate, requireRole("ADMIN"));

router.get("/settings", listSettings);

// Storage (Cloudflare R2) — dedicated routes because saving runs a live test
router.get("/settings/storage", getStorageSettings);
router.put("/settings/storage", validateBody(storageSettingsInputSchema), updateStorageSettings);
router.post("/settings/storage/test", validateBody(storageSettingsInputSchema), testStorageSettings);
router.post("/settings/storage/test-active", testActiveStorage);
router.delete("/settings/storage", resetStorageSettings);

// Email (SMTP) — same pattern
router.get("/settings/smtp", getSmtpSettings);
router.put("/settings/smtp", validateBody(smtpSettingsInputSchema), updateSmtpSettings);
router.post("/settings/smtp/test", validateBody(smtpTestInputSchema), testSmtpSettings);
router.post(
  "/settings/smtp/test-active",
  validateBody(z.object({ to: z.string().trim().email().optional() })),
  testActiveSmtp
);
router.delete("/settings/smtp", resetSmtpSettings);

// Payments (Razorpay) — same pattern; saving checks the keys with Razorpay
router.get("/settings/razorpay", getRazorpaySettings);
router.put("/settings/razorpay", validateBody(razorpaySettingsInputSchema), updateRazorpaySettings);
router.post("/settings/razorpay/test", validateBody(razorpaySettingsInputSchema), testRazorpaySettings);
router.delete("/settings/razorpay", resetRazorpaySettings);

// Generic groups: quiz, coins, social, contact, site (body validated per group
// against its schema inside buildSettingCandidate)
router.get("/settings/:key", getSettingHandler);
router.put("/settings/:key", updateSettingHandler);
router.delete("/settings/:key", resetSettingHandler);

// Catalog: mediums, classes, subjects, parts, chapters
router.use(adminCatalogRoutes);

// Chapter content: questions, bulk import, videos, image uploads
router.use(adminContentRoutes);

// Quiz reports (read-only)
router.get("/quiz/attempts", listQuizAttempts);
router.get("/quiz/attempts/:id", getQuizAttempt);
router.get("/quiz/stats", getQuizStatsHandler);

// Quiz builder (custom quizzes + "Use in quiz" flags)
router.get("/quizzes", listQuizzes);
router.post("/quizzes", validateBody(quizInputSchema), createQuiz);
router.post("/quizzes/pool", validateBody(quizInputSchema), quizPool);
router.post("/quizzes/preview", validateBody(quizInputSchema), previewQuiz);
router.put("/quizzes/reorder", validateBody(reorderQuizzesSchema), reorderQuizzes);
router.get("/quizzes/:id", getQuiz);
router.patch("/quizzes/:id", validateBody(quizInputSchema), updateQuiz);
router.delete("/quizzes/:id", deleteQuiz);
router.post("/quizzes/:id/duplicate", duplicateQuiz);
router.get("/quiz-questions", listQuizQuestions);
router.post("/chapters/:chapterId/questions/quiz-flag", validateBody(quizFlagSchema), flagQuizQuestions);
router.get("/chapters/:chapterId/quiz-overview", chapterQuizOverview);

// Users, coins and quiz activity
router.get("/users", listUsersAdmin);
router.get("/users/:id", getUserAdmin);
router.patch("/users/:id", validateBody(updateUserAdminSchema), updateUserAdmin);
router.post("/users/:id/coins", validateBody(adjustCoinsSchema), adjustUserCoins);

// Premium notes (PDFs in the private bucket)
router.get("/notes", listNotesAdmin);
router.post("/notes", validateBody(createNoteSchema), createNote);
router.patch("/notes/:id", validateBody(updateNoteSchema), updateNote);
router.delete("/notes/:id", deleteNote);
router.post("/notes/:id/upload-url", validateBody(noteUploadUrlSchema), createNoteUploadUrl);
router.post("/notes/:id/file", validateBody(noteFileSchema), attachNoteFile);
router.post("/notes/:id/grant", validateBody(grantNoteSchema), grantNoteAccess);

// Orders
router.get("/orders", listOrdersAdmin);
router.get("/orders/:id", getOrderAdmin);
router.post("/orders/:id/reconcile", reconcileOrderAdmin);

// Static pages & FAQ
router.get("/pages", listPagesAdmin);
router.get("/pages/:slug", getPageAdmin);
router.put("/pages/:slug", validateBody(updatePageSchema), updatePage);
router.get("/faq", listFaqAdmin);
router.post("/faq", validateBody(createFaqSchema), createFaq);
router.put("/faq/reorder", validateBody(reorderFaqSchema), reorderFaq);
router.patch("/faq/:id", validateBody(updateFaqSchema), updateFaq);
router.delete("/faq/:id", deleteFaq);

export default router;
