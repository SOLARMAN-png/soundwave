export type AuthSameSite = "lax" | "strict" | "none";

export interface AuthConfiguration {
  accessTokenSecret: Uint8Array;
  issuer: string;
  audience: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  cookie: {
    secure: boolean;
    sameSite: AuthSameSite;
    path: "/api";
    domain?: string;
  };
}

let cachedConfiguration: AuthConfiguration | undefined;

function requiredValue(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be set`);
  return value;
}

function positiveInteger(name: string, fallback: number, minimum: number, maximum: number) {
  const rawValue = process.env[name]?.trim();
  if (!rawValue) return fallback;

  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function cookieSecureSetting() {
  const rawValue = process.env.AUTH_COOKIE_SECURE?.trim().toLowerCase();
  if (!rawValue) return process.env.NODE_ENV === "production";
  if (rawValue !== "true" && rawValue !== "false") {
    throw new Error("AUTH_COOKIE_SECURE must be either true or false");
  }
  if (process.env.NODE_ENV === "production" && rawValue !== "true") {
    throw new Error("AUTH_COOKIE_SECURE must be true in production");
  }
  return rawValue === "true";
}

export function getAuthConfiguration(): AuthConfiguration {
  if (cachedConfiguration) return cachedConfiguration;

  const secret = requiredValue("JWT_ACCESS_SECRET");
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("JWT_ACCESS_SECRET must be at least 32 bytes");
  }

  const sameSiteValue = (process.env.AUTH_COOKIE_SAME_SITE?.trim().toLowerCase() || "lax");
  if (sameSiteValue !== "lax" && sameSiteValue !== "strict" && sameSiteValue !== "none") {
    throw new Error("AUTH_COOKIE_SAME_SITE must be lax, strict, or none");
  }

  const secure = cookieSecureSetting();
  if (sameSiteValue === "none" && !secure) {
    throw new Error("AUTH_COOKIE_SECURE must be true when AUTH_COOKIE_SAME_SITE is none");
  }

  const domain = process.env.AUTH_COOKIE_DOMAIN?.trim();
  cachedConfiguration = {
    accessTokenSecret: new TextEncoder().encode(secret),
    issuer: requiredValue("JWT_ISSUER"),
    audience: requiredValue("JWT_AUDIENCE"),
    accessTokenTtlSeconds: positiveInteger("JWT_ACCESS_TOKEN_TTL_SECONDS", 900, 60, 3600),
    refreshTokenTtlSeconds: positiveInteger(
      "JWT_REFRESH_TOKEN_TTL_SECONDS",
      604800,
      60,
      31536000,
    ),
    cookie: {
      secure,
      sameSite: sameSiteValue,
      path: "/api",
      ...(domain ? { domain } : {}),
    },
  };

  return cachedConfiguration;
}

export function assertAuthConfiguration() {
  getAuthConfiguration();
}