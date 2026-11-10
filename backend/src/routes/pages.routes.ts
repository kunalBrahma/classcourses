import { Router } from "express";
import { getPublicBanners, getPublicFaq, getPublicNews, getPublicPage, listPublicPages } from "../controllers/pages.controller";
import { submitContact } from "../controllers/contact.controller";
import { getAnnouncements, getBlog, getBlogPost, getBlogSlugs } from "../controllers/engagement.controller";
import { optionalAuthenticate } from "../middleware/auth.middleware";
import { contactLimiter } from "../middleware/rateLimiter";
import { validateBody } from "../middleware/validate.middleware";
import { contactMessageSchema } from "../validations/pages.validation";

// Public static pages + FAQ (published only, {{tokens}} filled in), news links and home banners.
const router = Router();

router.get("/pages", listPublicPages);
router.get("/pages/:slug", getPublicPage);
router.get("/faq", getPublicFaq);
router.get("/news", getPublicNews);
router.get("/banners", getPublicBanners);
router.get("/blog", getBlog);
router.get("/blog-slugs", getBlogSlugs);
router.get("/blog/:slug", getBlogPost);
// Guests see "everyone" announcements; signed-in students also theirs
router.get("/announcements", optionalAuthenticate, getAnnouncements);
router.post("/contact", contactLimiter, optionalAuthenticate, validateBody(contactMessageSchema), submitContact);

export default router;
