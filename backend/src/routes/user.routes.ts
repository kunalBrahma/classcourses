import { Router } from "express";
import { getMyCoins, getUsers, updateMyPreferences } from "../controllers/user.controller";
import { authenticate } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/role.middleware";
import { validateBody } from "../middleware/validate.middleware";
import { myNotes } from "../controllers/notes.controller";
import { myOrders } from "../controllers/payments.controller";
import { updatePreferencesSchema } from "../validations/catalog.validation";

const router = Router();

// Lists every user's email — admins only.
router.get("/", authenticate, requireRole("ADMIN"), getUsers);
router.get("/me/coins", authenticate, getMyCoins);
router.get("/me/notes", authenticate, myNotes);
router.get("/me/orders", authenticate, myOrders);
router.patch("/me/preferences", authenticate, validateBody(updatePreferencesSchema), updateMyPreferences);

export default router;
