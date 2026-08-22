import { Router, type IRouter } from "express";
import { PlayerModel, RoomModel } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";

const router: IRouter = Router();

router.get("/leaderboard", requireAuth, async (req, res): Promise<void> => {
  const limitRaw = req.query.limit;
  const limit = Math.min(Number(limitRaw) || 20, 100);

  const players = await PlayerModel.find({ gamesPlayed: { $gt: 0 } })
    .sort({ gamesWon: -1, gamesPlayed: -1 })
    .limit(limit)
    .lean();

  const entries = players.map((p, idx) => ({
    rank: idx + 1,
    playerId: p._id,
    playerName: p.name,
    avatarColor: p.avatarColor,
    avatarEmoji: p.avatarEmoji,
    gamesWon: p.gamesWon,
    gamesPlayed: p.gamesPlayed,
    winRate: p.gamesPlayed > 0 ? p.gamesWon / p.gamesPlayed : 0,
  }));

  res.json(entries);
});

router.get("/leaderboard/summary", requireAuth, async (req, res): Promise<void> => {
  const [, activePlayers, activeRooms, gamesAgg, topCandidates] = await Promise.all([
    PlayerModel.countDocuments({}),
    PlayerModel.countDocuments({ gamesPlayed: { $gt: 0 } }),
    RoomModel.countDocuments({ status: "playing" }),
    PlayerModel.aggregate([{ $group: { _id: null, total: { $sum: "$gamesPlayed" } } }]),
    PlayerModel.find({ gamesPlayed: { $gte: 3 } }).lean(),
  ]);

  const totalGamesPlayed = Math.floor((gamesAgg[0]?.total ?? 0) / 2);

  const topWinRate = topCandidates.reduce((max, p) => {
    const wr = p.gamesPlayed > 0 ? p.gamesWon / p.gamesPlayed : 0;
    return wr > max ? wr : max;
  }, 0);

  res.json({
    totalGamesPlayed,
    activePlayers,
    activeRooms,
    topWinRate,
  });
});

export default router;
