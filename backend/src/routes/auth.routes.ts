import { Router } from "express";
import {
  register,
  login,
  loginWithGoogle,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  getMe,
  getProfileOptions,
  verifyEmail,
  resendVerificationCode,
  requestUnlockCode,
  unlockAccount,
} from "../controllers/auth.controller";
import { authenticate } from "../middleware/auth.middleware";
import { validateBody } from "../middleware/validate.middleware";
import { forgotAccountLimiter, forgotIpLimiter, googleLimiter, otpLimiter, resetPasswordLimiter, signupLimiter, unlockLimiter } from "../middleware/rateLimiter";
import {
  registerSchema,
  loginSchema,
  googleLoginSchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  resendCodeSchema,
  unlockRequestSchema,
  unlockSchema,
} from "../validations/auth.validation";

const router = Router();

router.post("/register", signupLimiter, validateBody(registerSchema), register);
router.post("/verify-email", otpLimiter, validateBody(verifyEmailSchema), verifyEmail);
router.post("/resend-code", otpLimiter, validateBody(resendCodeSchema), resendVerificationCode);
// Failed sign-ins are counted in the database (loginThrottle.service.ts), not here.
router.post("/login", validateBody(loginSchema), login);
router.post("/google", googleLimiter, validateBody(googleLoginSchema), loginWithGoogle);
router.post("/refresh", validateBody(refreshSchema), refresh);
router.post("/logout", validateBody(refreshSchema), logout);
router.post("/forgot-password", forgotIpLimiter, forgotAccountLimiter, validateBody(forgotPasswordSchema), forgotPassword);
router.post("/reset-password", resetPasswordLimiter, validateBody(resetPasswordSchema), resetPassword);
// Sign-in paused after wrong passwords: email a code to the account, enter it.
router.post("/unlock/request", unlockLimiter, forgotAccountLimiter, validateBody(unlockRequestSchema), requestUnlockCode);
router.post("/unlock", unlockLimiter, validateBody(unlockSchema), unlockAccount);
router.get("/me", authenticate, getMe);
// Classes and districts for the sign-up / profile forms
router.get("/profile-options", getProfileOptions);

export default router;
