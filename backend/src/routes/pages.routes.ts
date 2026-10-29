import { Router } from "express";
import { getPublicFaq, getPublicNews, getPublicPage, listPublicPages } from "../controllers/pages.controller";
import { submitContact } from "../controllers/contact.controller";
import { optionalAuthenticate } from "../middleware/auth.middleware";
import { contactLimiter } from "../middleware/rateLimiter";
import { validateBody } from "../middleware/validate.middleware";
import { contactMessageSchema } from "../validations/pages.validation";

// Public static pages + FAQ (published only, {{tokens}} filled in) and news links.
const router = Router();

router.get("/pages", listPublicPages);
router.get("/pages/:slug", getPublicPage);
router.get("/faq", getPublicFaq);
router.get("/news", getPublicNews);
router.post("/contact", contactLimiter, optionalAuthenticate, validateBody(contactMessageSchema), submitContact);

export default router;
