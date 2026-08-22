import type { Request, Response, NextFunction } from "express";
import { SESSION_COOKIE, verifySession } from "../lib/session.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/** Reads the session cookie (if any) and attaches `req.userId`. Never blocks the request. */
export function attachUser(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) {
    const session = verifySession(token);
    if (session) req.userId = session.playerId;
  }
  next();
}

/** Blocks the request with 401 unless a valid session is present. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.userId) {
    res.status(401).json({ error: "Sign in required" });
    return;
  }
  next();
}
