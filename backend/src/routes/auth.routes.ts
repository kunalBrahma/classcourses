import { Router } from "express";
import {
  register,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  getMe,
  verifyEmail,
  resendVerificationCode,
} from "../controllers/auth.controller";
import { authenticate } from "../middleware/auth.middleware";
import { validateBody } from "../middleware/validate.middleware";
import { forgotAccountLimiter, forgotIpLimiter, loginAccountLimiter, loginIpLimiter, otpLimiter, resetPasswordLimiter, signupLimiter } from "../middleware/rateLimiter";
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  resendCodeSchema,
} from "../validations/auth.validation";

const router = Router();

router.post("/register", signupLimiter, validateBody(registerSchema), register);
router.post("/verify-email", otpLimiter, validateBody(verifyEmailSchema), verifyEmail);
router.post("/resend-code", otpLimiter, validateBody(resendCodeSchema), resendVerificationCode);
router.post("/login", loginIpLimiter, loginAccountLimiter, validateBody(loginSchema), login);
router.post("/refresh", validateBody(refreshSchema), refresh);
router.post("/logout", validateBody(refreshSchema), logout);
router.post("/forgot-password", forgotIpLimiter, forgotAccountLimiter, validateBody(forgotPasswordSchema), forgotPassword);
router.post("/reset-password", resetPasswordLimiter, validateBody(resetPasswordSchema), resetPassword);
router.get("/me", authenticate, getMe);

export default router;
