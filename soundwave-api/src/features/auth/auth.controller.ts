import type { RequestHandler } from "express";
import { z } from "zod";
import {
  loginSchema,
  onboardingPreferencesSchema,
  registerSchema,
  resendVerificationSchema,
  verifyEmailSchema,
} from "./auth.validation.js";
import {
  authenticateUser,
  createVerificationForPendingUser,
  createTokenPair,
  discardPendingRegistration,
  getOnboardingPreferences,
  InvalidOnboardingSelectionError,
  revokeRefreshToken,
  rotateRefreshToken,
  registerUserForEmailVerification,
  saveOnboardingPreferences,
  verifyEmailAddress,
} from "./auth.service.js";
import {
  ACCESS_COOKIE_NAME,
  getAuthCookieMaxAge,
  getAuthCookieOptions,
  LEGACY_SESSION_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
} from "./auth.middleware.js";
import { getAuthConfiguration } from "../../config/auth.js";
import { sendVerificationEmail } from "../../config/email.js";
import { createCsrfToken, CSRF_COOKIE_NAME } from "../../middleware/csrf.js";

function reportValidationError(
  error: z.ZodError,
  response: Parameters<RequestHandler>[1],
) {
  response.status(400).json({
    error: "Invalid request body",
    details: error.issues.map(({ path, message }) => ({ path, message })),
  });
}

function isDuplicateKeyError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

function setAuthCookies(
  response: Parameters<RequestHandler>[1],
  tokens: {
    accessToken: string;
    refreshToken: string;
    accessExpiresAt: Date;
    refreshExpiresAt: Date;
  },
) {
  response.clearCookie(LEGACY_SESSION_COOKIE_NAME, getAuthCookieOptions());
  response.cookie(ACCESS_COOKIE_NAME, tokens.accessToken, {
    ...getAuthCookieOptions(),
    maxAge: getAuthCookieMaxAge(tokens.accessExpiresAt),
    expires: tokens.accessExpiresAt,
  });
  response.cookie(REFRESH_COOKIE_NAME, tokens.refreshToken, {
    ...getAuthCookieOptions(),
    maxAge: getAuthCookieMaxAge(tokens.refreshExpiresAt),
    expires: tokens.refreshExpiresAt,
  });
}

function clearAuthCookies(response: Parameters<RequestHandler>[1]) {
  response.clearCookie(ACCESS_COOKIE_NAME, getAuthCookieOptions());
  response.clearCookie(REFRESH_COOKIE_NAME, getAuthCookieOptions());
  response.clearCookie(LEGACY_SESSION_COOKIE_NAME, getAuthCookieOptions());
  response.clearCookie(CSRF_COOKIE_NAME, { ...getAuthCookieOptions(), httpOnly: false });
}

export const getCsrfToken: RequestHandler = (_request, response) => {
  const csrfToken = createCsrfToken();
  const expiresAt = new Date(Date.now() + getAuthConfiguration().refreshTokenTtlSeconds * 1000);
  response.cookie(CSRF_COOKIE_NAME, csrfToken, {
    ...getAuthCookieOptions(),
    httpOnly: false,
    expires: expiresAt,
    maxAge: Math.max(0, expiresAt.getTime() - Date.now()),
  });
  response.set("Cache-Control", "no-store");
  response.status(200).json({ data: { csrfToken } });
};

export const register: RequestHandler = async (request, response) => {
  const parsed = registerSchema.safeParse(request.body);
  if (!parsed.success) {
    reportValidationError(parsed.error, response);
    return;
  }

  try {
    const { user, verificationToken } = await registerUserForEmailVerification(parsed.data);
    try {
      await sendVerificationEmail(user.email, user.displayName, verificationToken);
    } catch {
      await discardPendingRegistration(user.id);
      response.status(503).json({ error: "Verification email could not be sent. Please try again later." });
      return;
    }

    response.status(201).json({
      data: { email: user.email, verificationRequired: true },
    });
  } catch (error: unknown) {
    if (isDuplicateKeyError(error)) {
      response.status(409).json({ error: "Email or username is already in use" });
      return;
    }

    throw error;
  }
};

export const resendVerification: RequestHandler = async (request, response) => {
  const parsed = resendVerificationSchema.safeParse(request.body);
  if (!parsed.success) {
    reportValidationError(parsed.error, response);
    return;
  }

  const verification = await createVerificationForPendingUser(parsed.data.email);
  if (verification) {
    try {
      await sendVerificationEmail(
        verification.email,
        verification.displayName,
        verification.verificationToken,
      );
    } catch (error: unknown) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String(error.code)
          : "UNKNOWN";
      console.error("Could not resend verification email", { code });
    }
  }

  response.status(202).json({
    data: { message: "If the account is awaiting verification, a new link will be sent." },
  });
};

export const verifyEmail: RequestHandler = async (request, response) => {
  const parsed = verifyEmailSchema.safeParse(request.body);
  if (!parsed.success) {
    reportValidationError(parsed.error, response);
    return;
  }

  const verification = await verifyEmailAddress(parsed.data.token);
  if (!verification) {
    response.status(400).json({ error: "Verification link is invalid, expired, or already used" });
    return;
  }

  setAuthCookies(response, verification.tokens);
  response.status(200).json({ data: verification.user });
};

export const login: RequestHandler = async (request, response) => {
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) {
    reportValidationError(parsed.error, response);
    return;
  }

  const authentication = await authenticateUser(parsed.data.email, parsed.data.password);
  if (authentication && "emailVerificationRequired" in authentication) {
    response.status(403).json({
      error: "Confirm your email using the link we sent before signing in.",
      code: "EMAIL_NOT_VERIFIED",
    });
    return;
  }
  if (!authentication) {
    response.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const tokens = await createTokenPair(authentication.userId);
  setAuthCookies(response, tokens);
  response.status(200).json({ data: authentication.user });
};

export const refresh: RequestHandler = async (request, response) => {
  const refreshToken: unknown = request.cookies?.[REFRESH_COOKIE_NAME];
  if (typeof refreshToken !== "string" || !/^[a-f\d]{64}$/i.test(refreshToken)) {
    clearAuthCookies(response);
    response.status(401).json({ error: "Authentication required" });
    return;
  }

  const tokens = await rotateRefreshToken(refreshToken);
  if (!tokens) {
    clearAuthCookies(response);
    response.status(401).json({ error: "Authentication required" });
    return;
  }

  setAuthCookies(response, tokens);
  response.status(200).json({ data: tokens.user });
};

export const logout: RequestHandler = async (request, response) => {
  const token: unknown = request.cookies?.[REFRESH_COOKIE_NAME];
  if (typeof token === "string" && /^[a-f\d]{64}$/i.test(token)) {
    await revokeRefreshToken(token);
  }

  clearAuthCookies(response);
  response.status(204).end();
};

export const getCurrentUser: RequestHandler = (request, response) => {
  response.status(200).json({ data: request.authenticatedUser });
};

export const getCurrentUserPreferences: RequestHandler = async (request, response) => {
  const userId = request.authenticatedUser?.id;
  if (!userId) {
    response.status(401).json({ error: "Authentication required" });
    return;
  }

  const preferences = await getOnboardingPreferences(userId);
  if (!preferences) {
    response.status(404).json({ error: "Active user not found" });
    return;
  }

  response.status(200).json({ data: preferences });
};

export const saveCurrentUserPreferences: RequestHandler = async (request, response) => {
  const parsed = onboardingPreferencesSchema.safeParse(request.body);
  if (!parsed.success) {
    reportValidationError(parsed.error, response);
    return;
  }

  const userId = request.authenticatedUser?.id;
  if (!userId) {
    response.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const preferences = await saveOnboardingPreferences(userId, parsed.data);
    if (!preferences) {
      response.status(404).json({ error: "Active user not found" });
      return;
    }
    response.status(200).json({ data: preferences });
  } catch (error: unknown) {
    if (error instanceof InvalidOnboardingSelectionError) {
      response.status(422).json({ error: error.message });
      return;
    }
    throw error;
  }
};
