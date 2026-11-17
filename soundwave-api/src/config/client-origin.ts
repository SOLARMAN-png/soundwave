export function normalizeOrigin(rawOrigin: string): string | null {
  const trimmed = rawOrigin.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function getAllowedClientOrigins(rawOrigins?: string): string[] {
  const allowed = new Set<string>();

  const configuredOrigins = (rawOrigins ?? "http://localhost:5173,http://localhost:5174")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  for (const configuredOrigin of configuredOrigins) {
    const normalized = normalizeOrigin(configuredOrigin);
    if (normalized) {
      allowed.add(normalized);
    }
  }

  for (const fallbackOrigin of [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
  ]) {
    const normalized = normalizeOrigin(fallbackOrigin);
    if (normalized) {
      allowed.add(normalized);
    }
  }

  return [...allowed];
}

export function getPrimaryClientOrigin(rawOrigins?: string): string {
  return getAllowedClientOrigins(rawOrigins)[0] ?? "http://localhost:5173";
}

export function isAllowedClientOrigin(origin: string | undefined, allowedOrigins: string[]): boolean {
  if (!origin) {
    return true;
  }

  return allowedOrigins.includes(origin);
}
