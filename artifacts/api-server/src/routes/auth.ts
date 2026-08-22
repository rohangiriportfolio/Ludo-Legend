import { Router, type IRouter } from "express";
import { randomUUID } from "crypto";
import { OAuth2Client } from "google-auth-library";
import { PlayerModel, withId } from "@workspace/db";
import { signSession, SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from "../lib/session.js";
import { requireAuth } from "../middlewares/auth.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const oauthClient = new OAuth2Client(GOOGLE_CLIENT_ID);

function serializePlayer(doc: any) {
  const player = withId(doc);
  const winRate = player.gamesPlayed > 0 ? player.gamesWon / player.gamesPlayed : 0;
  return {
    ...player,
    winRate,
    createdAt: player.createdAt.toISOString(),
  };
}

// ── Google Sign-In ──────────────────────────────────────────────────────────
// Body: { credential } — the ID token produced by Google Identity Services'
// button/One Tap on the client. We verify it server-side (no client secret
// needed for this flow), then upsert a single Player row per Google account
// — first by googleId, falling back to email — so repeat logins always land
// on the same account instead of creating duplicates.
router.post("/auth/google", async (req, res): Promise<void> => {
  const { credential } = req.body || {};

  if (!credential || typeof credential !== "string") {
    res.status(400).json({ error: "credential is required" });
    return;
  }
  if (!GOOGLE_CLIENT_ID) {
    res.status(500).json({ error: "Google sign-in is not configured on this server" });
    return;
  }

  let payload;
  try {
    const ticket = await oauthClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch (err) {
    logger.warn({ err }, "Google ID token verification failed");
    res.status(401).json({ error: "Invalid Google credential" });
    return;
  }

  if (!payload?.sub) {
    res.status(401).json({ error: "Invalid Google credential" });
    return;
  }

  const googleId = payload.sub;
  const email = payload.email || null;
  const name = (payload.name || email || "Player").slice(0, 20);
  const avatarUrl = payload.picture || null;

  try {
    // 1. Same Google account signing in again — reuse its existing row.
    let doc = await PlayerModel.findOne({ googleId }).lean();

    // 2. First time we've seen this googleId, but an account with the same
    //    email already exists (e.g. created a different way) — link it
    //    instead of creating a duplicate.
    if (!doc && email) {
      doc = await PlayerModel.findOne({ email, authProvider: "google" }).lean();
      if (doc) {
        await PlayerModel.updateOne({ _id: doc._id }, { googleId, updatedAt: new Date() });
      }
    }

    // 3. Brand new account.
    if (!doc) {
      const created = await PlayerModel.create({
        _id: randomUUID(),
        name,
        avatarColor: "red",
        avatarEmoji: null,
        authProvider: "google",
        googleId,
        email,
        avatarUrl,
      });
      doc = created.toObject();
    }

    const token = signSession({ playerId: doc._id });
    res.cookie(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
    res.status(200).json(serializePlayer(doc));
  } catch (err) {
    logger.error({ err }, "Google sign-in failed");
    res.status(500).json({ error: "Sign-in failed" });
  }
});

// ── Current session ──────────────────────────────────────────────────────────
router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const doc = await PlayerModel.findById(req.userId).lean();
  if (!doc) {
    res.status(401).json({ error: "Session no longer valid" });
    return;
  }
  res.json(serializePlayer(doc));
});

router.post("/auth/logout", (_req, res): void => {
  res.clearCookie(SESSION_COOKIE, { ...SESSION_COOKIE_OPTIONS, maxAge: undefined });
  res.status(204).end();
});

// ── Unfinished match (resume-on-refresh, authenticated users) ───────────────
router.put("/auth/match", requireAuth, async (req, res): Promise<void> => {
  const { matchJson } = req.body || {};
  if (matchJson !== null && typeof matchJson !== "string") {
    res.status(400).json({ error: "matchJson must be a string or null" });
    return;
  }
  await PlayerModel.updateOne({ _id: req.userId }, { unfinishedMatchJson: matchJson, updatedAt: new Date() });
  res.status(204).end();
});

router.delete("/auth/match", requireAuth, async (req, res): Promise<void> => {
  await PlayerModel.updateOne({ _id: req.userId }, { unfinishedMatchJson: null, updatedAt: new Date() });
  res.status(204).end();
});

// ── Record an offline-match result (online results are already recorded
//    server-side in room-manager.ts's saveGameResult) ────────────────────────
router.post("/auth/record-offline-result", requireAuth, async (req, res): Promise<void> => {
  const { won, tokensHome } = req.body || {};
  if (typeof won !== "boolean" || typeof tokensHome !== "number") {
    res.status(400).json({ error: "won (boolean) and tokensHome (number) are required" });
    return;
  }

  const current = await PlayerModel.findById(req.userId).lean();
  if (!current) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  const newStreak = won ? current.currentWinStreak + 1 : 0;
  await PlayerModel.updateOne(
    { _id: req.userId },
    {
      gamesPlayed: current.gamesPlayed + 1,
      gamesWon: current.gamesWon + (won ? 1 : 0),
      totalTokensHome: current.totalTokensHome + tokensHome,
      currentWinStreak: newStreak,
      longestWinStreak: Math.max(current.longestWinStreak, newStreak),
      updatedAt: new Date(),
    },
  );

  res.status(204).end();
});

export default router;
