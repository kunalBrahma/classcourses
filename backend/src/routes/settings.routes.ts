import { Router } from "express";
import { getPublicSettingsHandler } from "../controllers/settings.controller";

const router = Router();

// Non-secret settings the student site needs (social links, contact, quiz rules, coins).
router.get("/public", getPublicSettingsHandler);

export default router;
