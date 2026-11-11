import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import { getAuthConfiguration } from "../config/auth.js";

export const CSRF_COOKIE_NAME = "soundwave_csrf";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const TOKEN_PART_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function csrfSignature(nonce: string) {
  return createHmac("sha256", getAuthConfiguration().accessTokenSecret)
    .update(`soundwave-csrf:${nonce}`)
    .digest("base64url");
}

export function createCsrfToken() {
  const nonce = randomBytes(32).toString("base64url");
  return `${nonce}.${csrfSignature(nonce)}`;
}

function hasValidCsrfSignature(token: string) {
  const [nonce, signature, ...extraParts] = token.split(".");
  if (
    !nonce ||
    !signature ||
    extraParts.length > 0 ||
    !TOKEN_PART_PATTERN.test(nonce) ||
    !TOKEN_PART_PATTERN.test(signature)
  ) {
    return false;
  }

  const expected = Buffer.from(csrfSignature(nonce));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function constantTimeEqual(first: string, second: string) {
  const firstBuffer = Buffer.from(first);
  const secondBuffer = Buffer.from(second);
  return firstBuffer.length === secondBuffer.length && timingSafeEqual(firstBuffer, secondBuffer);
}

export function createCookieCsrfGuard(clientOrigin: string): RequestHandler {
  return (request, response, next) => {
    if (SAFE_METHODS.has(request.method)) {
      next();
      return;
    }

    if (request.get("origin") !== clientOrigin) {
      response.status(403).json({
        error: "Request origin is not allowed",
        code: "ORIGIN_NOT_ALLOWED",
      });
      return;
    }

    const cookieToken: unknown = request.cookies?.[CSRF_COOKIE_NAME];
    const headerToken = request.get("x-csrf-token");
    if (
      typeof cookieToken !== "string" ||
      typeof headerToken !== "string" ||
      !constantTimeEqual(cookieToken, headerToken) ||
      !hasValidCsrfSignature(cookieToken)
    ) {
      response.status(403).json({
        error: "CSRF token is missing or invalid",
        code: "CSRF_INVALID",
      });
      return;
    }

    next();
  };
}