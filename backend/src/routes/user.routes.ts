import { Router } from "express";
import { getMyCoins, getMyConsent, getUsers, requestMyConsent, resendMyConsent, updateMyPreferences, updateMyProfile } from "../controllers/user.controller";
import { parentConsentLimiter } from "../middleware/rateLimiter";
import { requestConsentSchema } from "../validations/users.validation";
import { authenticate } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/role.middleware";
import { validateBody } from "../middleware/validate.middleware";
import { myNotes } from "../controllers/notes.controller";
import { myOrders } from "../controllers/payments.controller";
import { updatePreferencesSchema } from "../validations/catalog.validation";
import { updateProfileSchema } from "../validations/auth.validation";
import { deleteMySaved, getMySaved, getNotifications, getUnreadCount, postMarkRead } from "../controllers/engagement.controller";
import { markReadSchema } from "../validations/engagement.validation";
import { getMyReferrals } from "../controllers/referral.controller";

const router = Router();

// Lists every user's email — admins only.
router.get("/", authenticate, requireRole("ADMIN"), getUsers);
router.get("/me/coins", authenticate, getMyCoins);
router.get("/me/notes", authenticate, myNotes);
router.get("/me/orders", authenticate, myOrders);
router.patch("/me/preferences", authenticate, validateBody(updatePreferencesSchema), updateMyPreferences);
router.patch("/me/profile", authenticate, validateBody(updateProfileSchema), updateMyProfile);
// Under 18: ask a parent / guardian for consent
router.get("/me/consent", authenticate, getMyConsent);
router.post("/me/consent", authenticate, parentConsentLimiter, validateBody(requestConsentSchema), requestMyConsent);
router.post("/me/consent/resend", authenticate, parentConsentLimiter, resendMyConsent);
// Profile → Saved
router.get("/me/saved", authenticate, getMySaved);
router.delete("/me/saved/:id", authenticate, deleteMySaved);
// Refer and Earn
router.get("/me/referrals", authenticate, getMyReferrals);
// The bell inbox
router.get("/me/notifications", authenticate, getNotifications);
router.get("/me/notifications/unread", authenticate, getUnreadCount);
router.post("/me/notifications/read", authenticate, validateBody(markReadSchema), postMarkRead);

export default router;
