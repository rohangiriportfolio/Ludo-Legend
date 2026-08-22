import { Router, type IRouter } from "express";
import { PlayerModel, GameRecordModel, withId } from "@workspace/db";
import { randomUUID } from "crypto";

const router: IRouter = Router();

router.post("/players", async (req, res): Promise<void> => {
  const { name, avatarColor, avatarEmoji } = req.body;

  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const doc = await PlayerModel.create({
    _id: randomUUID(),
    name: name.slice(0, 20),
    avatarColor: avatarColor || "red",
    avatarEmoji: avatarEmoji || null,
  });
  const player = withId(doc.toObject());

  const winRate = player.gamesPlayed > 0 ? player.gamesWon / player.gamesPlayed : 0;

  res.status(201).json({
    ...player,
    winRate,
    createdAt: player.createdAt.toISOString(),
  });
});

router.get("/players/:playerId", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.playerId) ? req.params.playerId[0] : req.params.playerId;
  const doc = await PlayerModel.findById(raw).lean();

  if (!doc) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  const player = withId(doc);
  const winRate = player.gamesPlayed > 0 ? player.gamesWon / player.gamesPlayed : 0;
  res.json({ ...player, winRate, createdAt: player.createdAt.toISOString() });
});

router.patch("/players/:playerId", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.playerId) ? req.params.playerId[0] : req.params.playerId;
  const { name, avatarColor, avatarEmoji } = req.body;

  const existing = await PlayerModel.findById(raw).lean();
  if (!existing) {
    res.status(404).json({ error: "Player not found" });
    return;
  }
  // Google-authenticated accounts can only be edited by their own signed-in session.
  if (existing.authProvider === "google" && req.userId !== raw) {
    res.status(401).json({ error: "Sign in required" });
    return;
  }

  const updates: Partial<{ name: string; avatarColor: string; avatarEmoji: string | null; updatedAt: Date }> = {
    updatedAt: new Date(),
  };
  if (name) updates.name = name.slice(0, 20);
  if (avatarColor) updates.avatarColor = avatarColor;
  if (avatarEmoji !== undefined) updates.avatarEmoji = avatarEmoji;

  const doc = await PlayerModel.findByIdAndUpdate(raw, updates, { new: true }).lean();

  if (!doc) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  const player = withId(doc);
  const winRate = player.gamesPlayed > 0 ? player.gamesWon / player.gamesPlayed : 0;
  res.json({ ...player, winRate, createdAt: player.createdAt.toISOString() });
});

router.get("/players/:playerId/stats", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.playerId) ? req.params.playerId[0] : req.params.playerId;
  const doc = await PlayerModel.findById(raw).lean();

  if (!doc) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  const player = withId(doc);

  // Get recent games (small dataset for this app — filter/sort in memory).
  const records = await GameRecordModel.find().sort({ playedAt: -1 }).limit(50).lean();

  const recentGames = records
    .filter((r) => {
      const rankings: { playerId: string; rank: number }[] = JSON.parse(r.rankingsJson || "[]");
      return rankings.some((rk) => rk.playerId === raw);
    })
    .slice(0, 5)
    .map((r) => {
      const rankings: { playerId: string; rank: number }[] = JSON.parse(r.rankingsJson || "[]");
      const myRanking = rankings.find((rk) => rk.playerId === raw);
      return {
        id: r._id,
        roomCode: r.roomCode,
        playerCount: r.playerCount,
        result: myRanking?.rank === 1 ? "win" : "loss",
        playedAt: r.playedAt.toISOString(),
      };
    });

  const winRate = player.gamesPlayed > 0 ? player.gamesWon / player.gamesPlayed : 0;

  res.json({
    playerId: player.id,
    gamesPlayed: player.gamesPlayed,
    gamesWon: player.gamesWon,
    winRate,
    totalTokensHome: player.totalTokensHome,
    totalTokensCut: player.totalTokensCut,
    longestWinStreak: player.longestWinStreak,
    currentWinStreak: player.currentWinStreak,
    recentGames,
  });
});

export default router;
