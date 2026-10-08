import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware";
import { validateBody } from "../middleware/validate.middleware";
import { paymentLimiter } from "../middleware/rateLimiter";
import { createOrderHandler, getOrderHandler, verifyPaymentHandler } from "../controllers/payments.controller";
import { createOrderSchema, verifyPaymentSchema } from "../validations/notes.validation";

// Student checkout. The Razorpay webhook is mounted separately in app.ts
// (it needs the raw body and has no user auth).
const router = Router();
router.use(authenticate, paymentLimiter);

router.post("/orders", validateBody(createOrderSchema), createOrderHandler);
router.get("/orders/:id", getOrderHandler);
router.post("/verify", validateBody(verifyPaymentSchema), verifyPaymentHandler);

export default router;
