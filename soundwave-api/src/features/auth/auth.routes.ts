import rateLimit from "express-rate-limit";
import { Router } from "express";
import {
  getCsrfToken,
  getCurrentUser,
  getCurrentUserPreferences,
  login,
  logout,
  refresh,
  register,
  resendVerification,
  saveCurrentUserPreferences,
  verifyEmail,
} from "./auth.controller.js";
import { requireAuth } from "./auth.middleware.js";

const authRouter = Router();
const loginRegisterRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many authentication attempts. Try again later." },
});

authRouter.post("/register", loginRegisterRateLimit, register);
authRouter.post("/resend-verification", loginRegisterRateLimit, resendVerification);
authRouter.post("/verify-email", loginRegisterRateLimit, verifyEmail);
authRouter.get("/csrf", getCsrfToken);
authRouter.post("/login", loginRegisterRateLimit, login);
authRouter.post("/refresh", refresh);
authRouter.post("/logout", logout);
authRouter.get("/onboarding", requireAuth, getCurrentUserPreferences);
authRouter.put("/onboarding", requireAuth, saveCurrentUserPreferences);
authRouter.get("/me", requireAuth, getCurrentUser);

export default authRouter;
