import jwt from "jsonwebtoken";

export const SESSION_COOKIE = "ludo_session";

const JWT_SECRET = process.env.JWT_SECRET || "dev-only-insecure-secret-change-me";

if (!process.env.JWT_SECRET && process.env.NODE_ENV === "production") {
  // Not fatal — but a same, guessable secret in production would let anyone
  // forge session cookies, so make it very visible in the logs.
  // eslint-disable-next-line no-console
  console.warn(
    "[auth] JWT_SECRET is not set — using an insecure default. Set JWT_SECRET in artifacts/api-server/.env before deploying.",
  );
}

export interface SessionPayload {
  playerId: string;
}

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}

export function verifySession(token: string): SessionPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (typeof decoded === "object" && decoded && typeof decoded.playerId === "string") {
      return { playerId: decoded.playerId };
    }
    return null;
  } catch {
    return null;
  }
}

// Cross-origin deployments (Vercel frontend + a separately-hosted backend)
// need "SameSite=None; Secure" or the browser won't attach the cookie to
// API calls at all. Same-origin deployments (local dev, or the
// single-process "pnpm run start" mode) work fine with the stricter "Lax".
const isProduction = process.env.NODE_ENV === "production";

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: (isProduction ? "none" : "lax") as "none" | "lax",
  secure: isProduction,
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  path: "/",
};
