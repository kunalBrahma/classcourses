import { Router } from "express";
import * as eng from "../controllers/adminEngagement.controller";
import * as referrals from "../controllers/referral.controller";
import {
  createAnnouncementSchema,
  createBlogCategorySchema,
  createPostSchema,
  reorderIdsSchema,
  referralNoteSchema,
  sendNoticeSchema,
  updateAnnouncementSchema,
  updateBlogCategorySchema,
  updatePostSchema,
} from "../validations/engagement.validation";
import { z } from "zod";
import { authenticate } from "../middleware/auth.middleware";
import { requireAdmin } from "../middleware/role.middleware";
import { recordAdminActivity } from "../middleware/adminActivity";
import { addHelper, listActivity, listTeam, removeHelper, updateHelper } from "../controllers/adminTeam.controller";
import { addHelperSchema, adminEditDetailsSchema, eraseSchema, optionalReasonSchema, reasonSchema, recordConsentSchema, suspendSchema, updateHelperSchema, withdrawConsentSchema } from "../validations/users.validation";
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
  getCashfreeSettings,
  resetCashfreeSettings,
  testCashfreeSettings,
  updateCashfreeSettings,
  resetRazorpaySettings,
  testRazorpaySettings,
  updateRazorpaySettings,
} from "../controllers/settings.controller";
import {
  smtpSettingsInputSchema,
  smtpTestInputSchema,
  storageSettingsInputSchema,
  razorpaySettingsInputSchema,
  cashfreeSettingsInputSchema,
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
  refundOrderAdmin,
  updateNote,
} from "../controllers/adminNotes.controller";
import {
  createNoteSchema,
  grantNoteSchema,
  noteFileSchema,
  noteUploadUrlSchema,
  startRefundSchema,
  updateNoteSchema,
} from "../validations/notes.validation";
import {
  createBanner,
  createFaq,
  createNews,
  deleteBanner,
  deleteFaq,
  deleteNews,
  getPageAdmin,
  getStandardPageAdmin,
  listBannersAdmin,
  listFaqAdmin,
  listNewsAdmin,
  listPagesAdmin,
  reorderBanners,
  reorderFaq,
  reorderNews,
  updateBanner,
  updateFaq,
  updateNews,
  updatePage,
} from "../controllers/pages.controller";
import {
  createBannerSchema,
  createFaqSchema,
  createNewsSchema,
  reorderBannersSchema,
  reorderFaqSchema,
  reorderNewsSchema,
  updateBannerSchema,
  updateFaqSchema,
  updateNewsSchema,
  updatePageSchema,
} from "../validations/pages.validation";
import adminCatalogRoutes from "./adminCatalog.routes";
import { clearUserSignInLock, getUserSignInStatus, listAdminLogins, securityLimitsMeta } from "../controllers/adminSecurity.controller";
import adminContentRoutes from "./adminContent.routes";
import { getQuizAttempt, getQuizStatsHandler, listQuizAttempts } from "../controllers/adminQuiz.controller";
import {
  adjustUserCoins,
  blockUserAdmin,
  editUserDetailsAdmin,
  eraseUserAdmin,
  exportUserAdmin,
  getUserAdmin,
  listUsersAdmin,
  signOutUserAdmin,
  suspendUserAdmin,
  unblockUserAdmin,
  unsuspendUserAdmin,
  updateUserAdmin,
  userAccountAdmin,
  getUserConsentAdmin,
  recordConsentAdmin,
  withdrawConsentAdmin,
  resendConsentAdmin,
} from "../controllers/adminUsers.controller";
import { getDashboardStats } from "../controllers/adminStats.controller";
import { deleteContactMessage, listContactMessages, updateContactMessage } from "../controllers/contact.controller";
import { contactStatusSchema } from "../validations/pages.validation";
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
// Admins only; helper admins only in their sections (config/adminAccess.ts).
// Every change is written to the activity log (middleware/adminActivity.ts).
router.use(authenticate, requireAdmin, recordAdminActivity);

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

// Payments (Cashfree) — the gateway at launch; saving checks the keys first
router.get("/settings/cashfree", getCashfreeSettings);
router.put("/settings/cashfree", validateBody(cashfreeSettingsInputSchema), updateCashfreeSettings);
router.post("/settings/cashfree/test", validateBody(cashfreeSettingsInputSchema), testCashfreeSettings);
router.delete("/settings/cashfree", resetCashfreeSettings);

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
// Dashboard figures (read-only)
router.get("/stats", getDashboardStats);
router.get("/users", listUsersAdmin);
router.get("/users/:id", getUserAdmin);
router.patch("/users/:id", validateBody(updateUserAdminSchema), updateUserAdmin);
router.post("/users/:id/coins", validateBody(adjustCoinsSchema), adjustUserCoins);
// Account actions (reasons required; all in the activity log)
router.get("/users/:id/account", userAccountAdmin);
router.post("/users/:id/suspend", validateBody(suspendSchema), suspendUserAdmin);
router.post("/users/:id/unsuspend", validateBody(optionalReasonSchema), unsuspendUserAdmin);
router.post("/users/:id/block", validateBody(reasonSchema), blockUserAdmin); // Super Admin
router.post("/users/:id/unblock", validateBody(optionalReasonSchema), unblockUserAdmin); // Super Admin
router.post("/users/:id/sign-out", validateBody(optionalReasonSchema), signOutUserAdmin);
router.patch("/users/:id/details", validateBody(adminEditDetailsSchema), editUserDetailsAdmin);
router.get("/users/:id/export", exportUserAdmin);
// Parental consent (record / withdraw: Super Admin)
router.get("/users/:id/consent", getUserConsentAdmin);
router.post("/users/:id/consent/record", validateBody(recordConsentSchema), recordConsentAdmin);
router.post("/users/:id/consent/withdraw", validateBody(withdrawConsentSchema), withdrawConsentAdmin);
router.post("/users/:id/consent/resend", resendConsentAdmin);
router.delete("/users/:id", validateBody(eraseSchema), eraseUserAdmin); // Super Admin

// Team and activity log: Super Admin only (not in config/adminAccess.ts sections)
router.get("/team", listTeam);
router.post("/team", validateBody(addHelperSchema), addHelper);
router.patch("/team/:id", validateBody(updateHelperSchema), updateHelper);
router.delete("/team/:id", removeHelper);
router.get("/activity", listActivity);
router.get("/users/:id/sign-in", getUserSignInStatus);
router.post("/users/:id/sign-in/clear", clearUserSignInLock);

// Security: every sign-in attempt on an admin account
router.get("/security/admin-logins", listAdminLogins);
router.get("/security/limits", securityLimitsMeta);

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
// Full refund through the order's gateway, with a written reason
router.post("/orders/:id/refund", validateBody(startRefundSchema), refundOrderAdmin);

// Static pages & FAQ
router.get("/pages", listPagesAdmin);
router.get("/pages/:slug", getPageAdmin);
router.get("/pages/:slug/standard", getStandardPageAdmin);
router.put("/pages/:slug", validateBody(updatePageSchema), updatePage);
// Contact-form messages
router.get("/messages", listContactMessages);
router.patch("/messages/:id", validateBody(contactStatusSchema), updateContactMessage);
router.delete("/messages/:id", deleteContactMessage);

router.get("/faq", listFaqAdmin);
router.post("/faq", validateBody(createFaqSchema), createFaq);
router.put("/faq/reorder", validateBody(reorderFaqSchema), reorderFaq);
router.patch("/faq/:id", validateBody(updateFaqSchema), updateFaq);
router.delete("/faq/:id", deleteFaq);

// Home page "Latest news" links
router.get("/news", listNewsAdmin);
router.post("/news", validateBody(createNewsSchema), createNews);
router.put("/news/reorder", validateBody(reorderNewsSchema), reorderNews);
router.patch("/news/:id", validateBody(updateNewsSchema), updateNews);
router.delete("/news/:id", deleteNews);

// Home page banner slideshow
router.get("/banners", listBannersAdmin);
router.post("/banners", validateBody(createBannerSchema), createBanner);
router.put("/banners/reorder", validateBody(reorderBannersSchema), reorderBanners);
router.patch("/banners/:id", validateBody(updateBannerSchema), updateBanner);
router.delete("/banners/:id", deleteBanner);

// Blog (posts + categories)
router.get("/blog/posts", eng.listPosts);
router.post("/blog/posts", validateBody(createPostSchema), eng.createPost);
router.get("/blog/posts/:id", eng.getPost);
router.patch("/blog/posts/:id", validateBody(updatePostSchema), eng.updatePost);
router.delete("/blog/posts/:id", eng.deletePost);
router.get("/blog/categories", eng.listCategories);
router.post("/blog/categories", validateBody(createBlogCategorySchema), eng.createCategory);
router.put("/blog/categories/reorder", validateBody(reorderIdsSchema), eng.reorderCategories);
router.patch("/blog/categories/:id", validateBody(updateBlogCategorySchema), eng.updateCategory);
router.delete("/blog/categories/:id", eng.deleteCategory);

// Announcements
router.get("/announcements", eng.listAnnouncements);
router.post("/announcements", validateBody(createAnnouncementSchema), eng.createAnnouncement);
router.put("/announcements/reorder", validateBody(reorderIdsSchema), eng.reorderAnnouncements);
router.patch("/announcements/:id", validateBody(updateAnnouncementSchema), eng.updateAnnouncement);
router.delete("/announcements/:id", eng.deleteAnnouncement);

// Notices and warnings (the student's bell inbox)
router.get("/notices", eng.listNotices);
router.post("/notices", validateBody(sendNoticeSchema), eng.postNotice);
router.delete("/notices/:id", eng.removeNotice);

// Refer and Earn (Super Admin): records, review, reverse
router.get("/referrals", referrals.listReferrals);
router.get("/referrals/summary", referrals.getReferralSummary);
router.post("/referrals/:id/approve", validateBody(referralNoteSchema), referrals.approve);
router.post("/referrals/:id/reject", validateBody(referralNoteSchema), referrals.reject);
router.post("/referrals/:id/reverse", validateBody(referralNoteSchema), referrals.reverse);

// Likes and saves (moderation)
router.get("/reactions", eng.listReactions);
router.get("/reactions/summary", eng.getReactionSummary);
router.delete("/reactions/likes/:id", eng.removeLike);
router.delete("/reactions/saves/:id", eng.removeSaved);
router.post("/reactions/users/:userId/clear-likes", eng.clearLikes);

export default router;
