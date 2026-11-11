import type { RequestHandler } from "express";
import { getAuthConfiguration } from "../../config/auth.js";
import { findAuthenticatedUser } from "./auth.service.js";

export const ACCESS_COOKIE_NAME = "soundwave_access";
export const REFRESH_COOKIE_NAME = "soundwave_refresh";
export const LEGACY_SESSION_COOKIE_NAME = "soundwave_session";

export const requireAuth: RequestHandler = async (request, response, next) => {
  const token: unknown = request.cookies?.[ACCESS_COOKIE_NAME];

  if (typeof token !== "string") {
    response.clearCookie(LEGACY_SESSION_COOKIE_NAME, getAuthCookieOptions());
    response.status(401).json({ error: "Authentication required" });
    return;
  }

  const authentication = await findAuthenticatedUser(token);
  if (!authentication) {
    response.clearCookie(ACCESS_COOKIE_NAME, getAuthCookieOptions());
    response.clearCookie(LEGACY_SESSION_COOKIE_NAME, getAuthCookieOptions());
    response.status(401).json({ error: "Authentication required" });
    return;
  }

  request.authenticatedUser = authentication.user;
  next();
};

export const requireAdmin: RequestHandler = (request, response, next) => {
  const allowedEmails = new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
  const userEmail = request.authenticatedUser?.email;

  if (typeof userEmail !== "string" || !allowedEmails.has(userEmail.toLowerCase())) {
    response.status(403).json({ error: "Administrator access required" });
    return;
  }

  next();
};

export function getAuthCookieOptions() {
  const cookie = getAuthConfiguration().cookie;
  return {
    httpOnly: true,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
    path: cookie.path,
    ...(cookie.domain ? { domain: cookie.domain } : {}),
  };
}

export function getAuthCookieMaxAge(expiresAt: Date) {
  return Math.max(0, expiresAt.getTime() - Date.now());
}
