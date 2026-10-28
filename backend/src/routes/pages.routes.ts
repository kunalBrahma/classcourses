import { Router } from "express";
import { getPublicFaq, getPublicNews, getPublicPage, listPublicPages } from "../controllers/pages.controller";

// Public static pages + FAQ (published only, {{tokens}} filled in) and news links.
const router = Router();

router.get("/pages", listPublicPages);
router.get("/pages/:slug", getPublicPage);
router.get("/faq", getPublicFaq);
router.get("/news", getPublicNews);

export default router;
