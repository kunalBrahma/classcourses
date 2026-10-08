import { Router } from "express";
import { getPublicFaq, getPublicPage, listPublicPages } from "../controllers/pages.controller";

// Public static pages + FAQ (published only, {{tokens}} filled in).
const router = Router();

router.get("/pages", listPublicPages);
router.get("/pages/:slug", getPublicPage);
router.get("/faq", getPublicFaq);

export default router;
