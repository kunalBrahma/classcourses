import { Router } from "express";
import {
  register,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  getMe,
} from "../controllers/auth.controller";
import { authenticate } from "../middleware/auth.middleware";
import { validateBody } from "../middleware/validate.middleware";
import { authLimiter } from "../middleware/rateLimiter";
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "../validations/auth.validation";

const router = Router();

router.post("/register", authLimiter, validateBody(registerSchema), register);
router.post("/login", authLimiter, validateBody(loginSchema), login);
router.post("/refresh", validateBody(refreshSchema), refresh);
router.post("/logout", validateBody(refreshSchema), logout);
router.post(
  "/forgot-password",
  authLimiter,
  validateBody(forgotPasswordSchema),
  forgotPassword
);
router.post("/reset-password", authLimiter, validateBody(resetPasswordSchema), resetPassword);
router.get("/me", authenticate, getMe);

export default router;
