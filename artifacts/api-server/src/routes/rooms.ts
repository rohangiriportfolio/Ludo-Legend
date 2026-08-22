import { Router, type IRouter } from "express";
import { RoomModel, withId } from "@workspace/db";
import { randomUUID } from "crypto";
import {
  joinRoom,
  leaveSeat,
  selectColor,
  renameSeat,
  addBot,
  startGame,
  leaveRoom,
  cancelMatch,
  rollDice,
  moveToken,
  getRoomState,
  RoomNotFoundError,
  ConflictError,
} from "../lib/room-engine.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function normalizeCode(raw: string | string[]): string {
  return (Array.isArray(raw) ? raw[0] : raw).toUpperCase();
}

// Wraps a room-engine call with the error mapping every route below shares.
async function handle(res: import("express").Response, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof RoomNotFoundError) {
      res.status(404).json({ error: "Room not found" });
      return;
    }
    if (err instanceof ConflictError) {
      res.status(409).json({ error: err.message });
      return;
    }
    logger.error({ err }, "room route error");
    res.status(500).json({ error: "Something went wrong" });
  }
}

router.post("/rooms", async (req, res): Promise<void> => {
  const { hostPlayerId, maxPlayers, isPrivate, allowBots, botDifficulty } = req.body;

  if (!hostPlayerId) {
    res.status(400).json({ error: "hostPlayerId is required" });
    return;
  }

  let code = generateRoomCode();
  for (let i = 0; i < 5; i++) {
    const existing = await RoomModel.exists({ code });
    if (!existing) break;
    code = generateRoomCode();
  }

  const doc = await RoomModel.create({
    _id: randomUUID(),
    code,
    hostPlayerId,
    maxPlayers: maxPlayers || 4,
    playerCount: 1,
    status: "waiting",
    isPrivate: isPrivate ?? false,
    allowBots: allowBots ?? false,
    botDifficulty: botDifficulty || null,
  });
  const room = withId(doc.toObject());

  res.status(201).json({ ...room, createdAt: room.createdAt.toISOString() });
});

router.get("/rooms/:roomCode", async (req, res): Promise<void> => {
  const code = normalizeCode(req.params.roomCode);
  const doc = await RoomModel.findOne({ code }).lean();
  if (!doc) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const room = withId(doc);
  res.json({ ...room, createdAt: room.createdAt.toISOString() });
});

router.post("/rooms/:roomCode/join", async (req, res): Promise<void> => {
  const code = normalizeCode(req.params.roomCode);
  const incoming = req.body.players ?? (req.body.player ? [req.body.player] : []);
  if (!Array.isArray(incoming) || incoming.length === 0) {
    res.status(400).json({ error: "players is required" });
    return;
  }
  await handle(res, async () => {
    const result = await joinRoom(code, incoming);
    res.json({
      room: { ...withId(result.room), createdAt: result.room.createdAt.toISOString() },
      lobby: result.lobby,
      game: result.game,
    });
  });
});

router.post("/rooms/:roomCode/leave-seat", async (req, res): Promise<void> => {
  const code = normalizeCode(req.params.roomCode);
  const { playerId } = req.body;
  await handle(res, async () => {
    const lobby = await leaveSeat(code, playerId);
    res.json({ lobby });
  });
});

router.post("/rooms/:roomCode/select-color", async (req, res): Promise<void> => {
  const code = normalizeCode(req.params.roomCode);
  const { playerId, color } = req.body;
  await handle(res, async () => {
    const lobby = await selectColor(code, playerId, color);
    res.json({ lobby });
  });
});

router.post("/rooms/:roomCode/rename", async (req, res): Promise<void> => {
  const code = normalizeCode(req.params.roomCode);
  const { playerId, name } = req.body;
  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  await handle(res, async () => {
    const lobby = await renameSeat(code, playerId, name);
    res.json({ lobby });
  });
});

router.post("/rooms/:roomCode/add-bot", async (req, res): Promise<void> => {
  const code = normalizeCode(req.params.roomCode);
  const { difficulty } = req.body;
  await handle(res, async () => {
    const lobby = await addBot(code, difficulty);
    res.json({ lobby });
  });
});

router.post("/rooms/:roomCode/start", async (req, res): Promise<void> => {
  const code = normalizeCode(req.params.roomCode);
  const { teamMode } = req.body;
  await handle(res, async () => {
    const game = await startGame(code, !!teamMode);
    res.json({ game });
  });
});

router.post("/rooms/:roomCode/leave", async (req, res): Promise<void> => {
  const code = normalizeCode(req.params.roomCode);
  const { playerId } = req.body;
  await handle(res, async () => {
    await leaveRoom(code, playerId);
    res.status(204).end();
  });
});

router.post("/rooms/:roomCode/cancel", async (req, res): Promise<void> => {
  const code = normalizeCode(req.params.roomCode);
  const { playerId } = req.body;
  await handle(res, async () => {
    await cancelMatch(code, playerId);
    res.status(204).end();
  });
});

router.post("/rooms/:roomCode/roll", async (req, res): Promise<void> => {
  const code = normalizeCode(req.params.roomCode);
  const { playerId } = req.body;
  await handle(res, async () => {
    const result = await rollDice(code, playerId);
    res.json(result);
  });
});

router.post("/rooms/:roomCode/move", async (req, res): Promise<void> => {
  const code = normalizeCode(req.params.roomCode);
  const { playerId, tokenIndex } = req.body;
  await handle(res, async () => {
    const result = await moveToken(code, playerId, tokenIndex);
    res.json(result);
  });
});

// The single endpoint the client polls (~every 1.3s) for both the pre-game
// lobby and the live match. `since` is the highest event seq the client has
// already processed — only newer events come back in `newEvents`.
router.get("/rooms/:roomCode/state", async (req, res): Promise<void> => {
  const code = normalizeCode(req.params.roomCode);
  const since = Number(req.query.since) || 0;
  await handle(res, async () => {
    const result = await getRoomState(code, since);
    res.json({
      room: { ...withId(result.room), createdAt: result.room.createdAt.toISOString() },
      lobby: result.lobby,
      game: result.game,
      newEvents: result.newEvents,
    });
  });
});

export default router;
