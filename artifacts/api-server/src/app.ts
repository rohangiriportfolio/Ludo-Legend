import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import router from "./routes";
import { logger } from "./lib/logger";
import { attachUser } from "./middlewares/auth";
import { connectDb } from "@workspace/db";

const app: Express = express();

// Vercel terminates TLS in front of the Node function. Trust the platform
// proxy so Express handles secure production requests/cookies correctly.
app.set("trust proxy", 1);

// Ensures the DB connection exists before any request is handled, whether
// this app was started via index.ts's `main()` (local dev, single-process
// prod) or imported directly as a serverless function entrypoint (Vercel) —
// connectDb() is idempotent, so this is a no-op after the first call on a
// warm instance.
app.use((_req, _res, next) => {
  connectDb().then(() => next(), next);
});

app.use(
  pinoHttp({
    logger,
    // The client polls GET /api/rooms/:code/state roughly every 1.3s per
    // connected player, so a room with a few people in it produces several
    // of these requests every second — logging each one at info level
    // floods the terminal (and Vercel's log viewer) with routine noise that
    // drowns out everything actually worth seeing (sign-ins, match starts,
    // errors). Genuine failures on this route still surface — they go
    // through the error-handling middleware at the bottom of this file,
    // which isn't affected by this at all.
    autoLogging: {
      ignore: (req) => /^\/api\/rooms\/[^/]+\/state(\?|$)/.test(req.url || "") || req.url === "/api/healthz",
    },
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// Cookie-based auth requires CORS to name the exact origin (never "*") and
// set credentials:true. CORS_ORIGIN can be a single URL or a comma-separated
// list, e.g. "https://ludo-legend.vercel.app,https://ludolegend.com". If
// unset, every origin is reflected back (fine for same-origin/local-dev
// setups where no browser ever sees a mismatched origin) — set it explicitly
// once you deploy behind a real domain.
const allowedOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    credentials: true,
    origin: (origin, callback) => {
      // Same-origin browser requests normally have no Origin header.
      if (!origin) return callback(null, true);
      // Explicitly configured origins are the only cross-origin callers
      // allowed in production. With no list, keep local development easy.
      if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("CORS origin not allowed"));
    },
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(attachUser);

app.use("/api", router);

// After `pnpm build`, the frontend's static build lives in
// artifacts/ludo-game/dist/public. If it's present, serve it directly from
// this same process — this is what lets the whole app run as a single
// server on a laptop (no separate frontend dev server needed).
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.resolve(currentDir, "../../ludo-game/dist/public");

if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
  logger.info({ frontendDist }, "Serving built frontend as static files");
}

// Catches anything thrown/rejected in a route or middleware above that
// wasn't already handled — returns JSON instead of Express's default HTML
// error page, since every consumer of this API (the frontend, Vercel) only
// ever expects JSON back.
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err, url: req.url }, "Unhandled error");
  if (res.headersSent) return;
  res.status(500).json({ error: "Something went wrong" });
});

export default app;
