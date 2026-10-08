import { Router } from "express";
import { authenticate, optionalAuthenticate } from "../middleware/auth.middleware";
import { downloadNote, getNote, listNotes, quoteNote } from "../controllers/notes.controller";

// Store listing is public (with "owned" for logged-in students); quote and
// download need an account. Free notes also need login to download.
const router = Router();

router.get("/", optionalAuthenticate, listNotes);
router.get("/:id", optionalAuthenticate, getNote);
router.get("/:id/quote", authenticate, quoteNote);
router.get("/:id/download", authenticate, downloadNote);

export default router;
