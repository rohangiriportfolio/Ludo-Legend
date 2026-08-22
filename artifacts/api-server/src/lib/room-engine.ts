/**
 * Stateless room/game orchestration, backed entirely by MongoDB.
 *
 * This replaces the old in-memory Socket.IO room-manager. There is no
 * server-side timer, no in-memory Map, and no persistent connection — every
 * action (join, roll, move, ...) is a single read-modify-write against the
 * `rooms` collection, and `getRoomState()` (the endpoint the client polls
 * every ~1.3s) lazily resolves anything a background timer used to do —
 * bot turns and turn-timeouts — based on how much wall-clock time has
 * passed since the relevant timestamp. This makes the whole thing work
 * identically whether it's served by a long-running Express process
 * (local dev, single-process prod) or a stateless serverless function
 * (Vercel) — there's no shared process memory to lose between requests.
 *
 * Concurrency: multiple players' browsers poll the same room at once, and
 * more than one of those polls can land inside a serverless platform at
 * the same moment. Every mutation uses `gameSeq` as an optimistic-
 * concurrency token: the write only lands if `gameSeq` still matches what
 * was read. A conflict just means another poll already made the same
 * (or a more current) update — the loser re-reads the fresh state instead
 * of erroring, so nothing is lost and nothing double-applies.
 */
import { randomUUID } from "crypto";
import {
  type GameState,
  type GamePlayer,
  type PlayerColor,
  createInitialGameState,
  processDiceRoll,
  moveToken as engineMoveToken,
  forfeitTurn,
  getBotMove,
  getControlledPlayer,
  playerProgressArray,
} from "./game-engine.js";
import { PlayerModel, RoomModel, GameRecordModel, type RoomRecord } from "@workspace/db";
import { logger } from "./logger.js";

export interface RankingEntry {
  playerId: string;
  rank: number;
}

const TURN_TIMEOUT_MS = 30_000;
const BOT_ROLL_DELAY_MS: Record<string, number> = { easy: 2000, medium: 1500, hard: 1000 };
const BOT_MOVE_DELAY_MS: Record<string, number> = { easy: 2000, medium: 1500, hard: 1000 };
// Rooms that are still alive (waiting/playing) get their expiry pushed
// forward on every meaningful activity — this is purely a safety net for
// rooms nobody ever comes back to (e.g. everyone just closes their tabs
// mid-lobby), not a limit on how long an actively-played match can run.
const ACTIVE_ROOM_TTL_MS = 24 * 60 * 60 * 1000; // 24h since last activity

/** Expiry to write alongside a status change — "now" for a terminal state
 * (cancelled/abandoned/finished), so MongoDB's TTL sweep clears it out
 * shortly after; otherwise pushed 24h out from this write. */
function expiryFor(status: string): Date {
  const isTerminal = status === "cancelled" || status === "abandoned" || status === "finished";
  return isTerminal ? new Date() : new Date(Date.now() + ACTIVE_ROOM_TTL_MS);
}

// One poll resolves at most this many "would have happened by now" steps —
// keeps a single request fast even if a room sat unpolled for a long time
// (e.g. everyone tabbed away for an hour with 3 bots queued up); the rest
// resolves gradually over the next few polls.
const MAX_RESOLUTIONS_PER_POLL = 8;

export interface LobbyPlayer {
  id: string;
  name: string;
  avatarColor?: string;
  avatarEmoji?: string;
  color: PlayerColor;
  isBot: boolean;
  botDifficulty?: "easy" | "medium" | "hard";
  isHost: boolean;
  isConnected: boolean;
}

export type GameEvent =
  | { seq: number; type: "game_started"; teamMode: boolean }
  | { seq: number; type: "dice_rolled"; playerId: string; value: number; movableTokens: number[] }
  | {
      seq: number;
      type: "token_moved";
      playerId: string;
      tokenIndex: number;
      newProgress: number;
      cuts: { victimId: string; tokenIndex: number; fromProgress: number }[];
      tokenReachedHome: boolean;
    }
  | { seq: number; type: "turn_changed"; currentTurn: string; turnTimerSeconds: number }
  | { seq: number; type: "game_over"; winnerId: string; rankings: RankingEntry[] }
  | { seq: number; type: "player_connected"; playerId: string }
  | { seq: number; type: "player_disconnected"; playerId: string }
  | { seq: number; type: "match_cancelled"; reason: "abandoned" | "host_cancelled" };

type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;

/** GameState plus the bookkeeping only the polling layer needs (never touched by the pure game-engine functions). */
export interface StoredGame extends GameState {
  /** When the CURRENT dice value was rolled — drives the bot's 2nd delay (decide + move) and isn't part of the core rules engine. */
  diceRolledAt: number | null;
  events: GameEvent[];
  eventSeq: number;
}

export class RoomNotFoundError extends Error {}
export class ConflictError extends Error {}
/** The action targeted a turn/player that no longer matches server state — the
 * client's cached `currentTurn` was stale (expected with polling latency).
 * Distinct from ConflictError so the client can resync immediately instead
 * of showing a hard error. */
export class StaleTurnError extends ConflictError {}

function nowMs(): number {
  return Date.now();
}

function tokensJsonFor(game: GameState): string {
  const map: Record<string, number[]> = {};
  for (const p of game.players) map[p.playerId] = playerProgressArray(p);
  return JSON.stringify(map);
}

function pushEvent(game: StoredGame, event: DistributiveOmit<GameEvent, "seq">): void {
  game.eventSeq += 1;
  game.events.push({ ...event, seq: game.eventSeq } as GameEvent);
  if (game.events.length > 40) game.events.splice(0, game.events.length - 40);
}

function parseLobby(json: string | null): LobbyPlayer[] {
  if (!json) return [];
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
}

function parseGame(json: string | null): StoredGame | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    // Backfill fields for any game saved before this bookkeeping existed.
    if (parsed.diceRolledAt === undefined) parsed.diceRolledAt = null;
    if (!Array.isArray(parsed.events)) parsed.events = [];
    if (typeof parsed.eventSeq !== "number") parsed.eventSeq = parsed.events.length;
    return parsed as StoredGame;
  } catch {
    return null;
  }
}

async function loadRoom(code: string): Promise<RoomRecord> {
  const room = await RoomModel.findOne({ code }).lean();
  if (!room) throw new RoomNotFoundError(`Room ${code} not found`);
  return room;
}

/** Atomically persists a new game state, guarded by the seq read at the start of the caller's operation. Returns the new seq on success, or null if another writer already advanced past it (caller should re-read and retry or give up). */
async function saveGame(code: string, expectedSeq: number, game: StoredGame): Promise<number | null> {
  const nextSeq = expectedSeq + 1;
  const status = game.status === "finished" ? "finished" : "playing";
  const result = await RoomModel.updateOne(
    { code, gameSeq: expectedSeq },
    {
      gameStateJson: JSON.stringify(game),
      gameSeq: nextSeq,
      status,
      expiresAt: expiryFor(status),
      updatedAt: new Date(),
    },
  );
  return result.matchedCount > 0 ? nextSeq : null;
}

async function saveLobby(code: string, lobby: LobbyPlayer[]): Promise<void> {
  await RoomModel.updateOne(
    { code },
    { lobbyJson: JSON.stringify(lobby), expiresAt: expiryFor("waiting"), updatedAt: new Date() },
  );
}

const COLOR_POOL: PlayerColor[] = ["red", "green", "yellow", "blue"];
const OPPOSITE_COLOR: Record<PlayerColor, PlayerColor> = {
  red: "yellow",
  yellow: "red",
  green: "blue",
  blue: "green",
};

function nextAvailableColor(existing: LobbyPlayer[], maxPlayers: number): PlayerColor {
  const used = new Set(existing.map((p) => p.color));
  const pool = maxPlayers === 2 ? (["red", "yellow", "green", "blue"] as PlayerColor[]) : COLOR_POOL;
  return pool.find((c) => !used.has(c)) ?? pool[existing.length % pool.length];
}

/** True if at least one non-bot seat is currently connected. */
function hasConnectedHuman(game: GameState): boolean {
  return game.players.some((p) => !p.isBot && p.isConnected);
}

// ─────────────────────────────────────────────────────────────────────────
// Lobby actions (pre-game)
// ─────────────────────────────────────────────────────────────────────────

export interface JoinResult {
  room: RoomRecord;
  lobby: LobbyPlayer[] | null;
  game: (StoredGame & { tokensJson: string }) | null;
}

export async function joinRoom(
  code: string,
  incoming: { id: string; name: string; avatarColor?: string; avatarEmoji?: string }[],
): Promise<JoinResult> {
  const room = await loadRoom(code);

  if (room.status === "cancelled" || room.status === "abandoned") {
    return { room, lobby: null, game: null };
  }

  // Game already started — this is a reconnect for these seats (e.g. a
  // refresh mid-match), not a lobby join.
  if (room.gameStateJson) {
    const game = parseGame(room.gameStateJson);
    if (game) {
      let seq = room.gameSeq;
      for (let attempt = 0; attempt < 3 && seq !== null; attempt++) {
        let changed = false;
        for (const p of incoming) {
          const gp = game.players.find((x) => x.playerId === p.id);
          if (gp && !gp.isConnected) {
            gp.isConnected = true;
            pushEvent(game, { type: "player_connected", playerId: p.id });
            changed = true;
          }
        }
        if (!changed) break;
        const newSeq = await saveGame(code, seq, game);
        if (newSeq !== null) {
          seq = newSeq;
          break;
        }
        // Conflict — reload and retry once or twice.
        const fresh = await loadRoom(code);
        const freshGame = parseGame(fresh.gameStateJson);
        if (!freshGame) break;
        Object.assign(game, freshGame);
        seq = fresh.gameSeq;
      }
      return { room, lobby: null, game: { ...game, tokensJson: tokensJsonFor(game) } };
    }
  }

  const lobby = parseLobby(room.lobbyJson);

  for (const p of incoming) {
    const existing = lobby.find((m) => m.id === p.id);
    if (existing) {
      existing.isConnected = true;
      if (p.name) existing.name = p.name.slice(0, 20);
      if (p.avatarColor) existing.avatarColor = p.avatarColor;
      if (p.avatarEmoji) existing.avatarEmoji = p.avatarEmoji;
      continue;
    }
    if (lobby.length >= room.maxPlayers) continue; // silently skip — room full
    lobby.push({
      id: p.id,
      name: (p.name || "Player").slice(0, 20),
      avatarColor: p.avatarColor,
      avatarEmoji: p.avatarEmoji,
      color: nextAvailableColor(lobby, room.maxPlayers),
      isBot: false,
      isHost: p.id === room.hostPlayerId,
      isConnected: true,
    });
  }

  await saveLobby(code, lobby);
  return { room, lobby, game: null };
}

export async function leaveSeat(code: string, playerId: string): Promise<LobbyPlayer[]> {
  const room = await loadRoom(code);
  const lobby = parseLobby(room.lobbyJson).filter((p) => p.id !== playerId);
  await saveLobby(code, lobby);
  return lobby;
}

export async function selectColor(code: string, playerId: string, color: PlayerColor): Promise<LobbyPlayer[]> {
  const room = await loadRoom(code);
  if (room.status !== "waiting") return parseLobby(room.lobbyJson); // no changing color mid-game

  const lobby = parseLobby(room.lobbyJson);
  const me = lobby.find((p) => p.id === playerId);
  if (!me) return lobby;

  const takenBy = lobby.find((p) => p.color === color && p.id !== playerId);
  if (takenBy) return lobby; // already in use — ignore

  if (room.maxPlayers === 2) {
    const other = lobby.find((p) => p.id !== playerId);
    if (other && color !== OPPOSITE_COLOR[other.color]) return lobby; // must stay diagonal
  }

  me.color = color;
  await saveLobby(code, lobby);
  return lobby;
}

/** Per-match display-name change (lobby only) — doesn't touch the player's persistent profile, just how they're shown in this room and the match that starts from it. */
export async function renameSeat(code: string, playerId: string, name: string): Promise<LobbyPlayer[]> {
  const room = await loadRoom(code);
  if (room.status !== "waiting") return parseLobby(room.lobbyJson); // no renaming mid-game

  const lobby = parseLobby(room.lobbyJson);
  const me = lobby.find((p) => p.id === playerId);
  if (!me) return lobby;

  const trimmed = (name || "").trim().slice(0, 20);
  if (!trimmed) return lobby;

  me.name = trimmed;
  await saveLobby(code, lobby);
  return lobby;
}

export async function addBot(
  code: string,
  difficulty?: "easy" | "medium" | "hard",
): Promise<LobbyPlayer[]> {
  const room = await loadRoom(code);
  if (!room.allowBots) return parseLobby(room.lobbyJson);

  const lobby = parseLobby(room.lobbyJson);
  if (lobby.length >= room.maxPlayers) return lobby;

  const botNumber = lobby.filter((p) => p.isBot).length + 1;
  lobby.push({
    id: `bot_${randomUUID().slice(0, 8)}`,
    name: `Bot ${botNumber}`,
    color: nextAvailableColor(lobby, room.maxPlayers),
    isBot: true,
    botDifficulty: difficulty || (room.botDifficulty as "easy" | "medium" | "hard" | null) || "medium",
    isHost: false,
    isConnected: true,
  });

  await saveLobby(code, lobby);
  return lobby;
}

export async function startGame(
  code: string,
  teamMode: boolean,
): Promise<StoredGame & { tokensJson: string }> {
  const room = await loadRoom(code);
  const lobby = parseLobby(room.lobbyJson);
  if (lobby.length < 2) throw new ConflictError("Need at least 2 players to start");

  const players: Omit<GamePlayer, "tokens" | "tokensHome">[] = lobby.map((p) => ({
    playerId: p.id,
    name: p.name,
    color: p.color,
    isBot: p.isBot,
    botDifficulty: p.botDifficulty,
    isConnected: p.isConnected,
  }));

  const base = createInitialGameState(code, players, teamMode);
  const game: StoredGame = { ...base, diceRolledAt: null, events: [], eventSeq: 0 };
  pushEvent(game, { type: "game_started", teamMode: game.teamMode });

  await RoomModel.updateOne(
    { code },
    {
      status: "playing",
      gameStateJson: JSON.stringify(game),
      gameSeq: 1,
      expiresAt: expiryFor("playing"),
      updatedAt: new Date(),
    },
  );

  logger.info({ roomCode: code }, "Game started");
  return { ...game, tokensJson: tokensJsonFor(game) };
}

export async function leaveRoom(code: string, playerId: string): Promise<void> {
  const room = await loadRoom(code);

  if (room.gameStateJson) {
    const game = parseGame(room.gameStateJson);
    if (game) {
      const gp = game.players.find((p) => p.playerId === playerId);
      if (gp && gp.isConnected) {
        gp.isConnected = false;
        pushEvent(game, { type: "player_disconnected", playerId });
        const newSeq = await saveGame(code, room.gameSeq, game);
        if (newSeq !== null && !hasConnectedHuman(game)) {
          await abandonGame(code, "abandoned");
        }
      }
    }
    return;
  }

  const lobby = parseLobby(room.lobbyJson).filter((p) => p.id !== playerId);
  await saveLobby(code, lobby);
}

export async function cancelMatch(code: string, playerId: string): Promise<void> {
  const room = await loadRoom(code);
  if (room.hostPlayerId !== playerId) return; // host-only
  await abandonGame(code, "host_cancelled");
  logger.info({ roomCode: code, playerId }, "Match cancelled by host");
}

async function abandonGame(code: string, reason: "abandoned" | "host_cancelled"): Promise<void> {
  const status = reason === "host_cancelled" ? "cancelled" : "abandoned";
  await RoomModel.updateOne(
    { code },
    { status, expiresAt: expiryFor(status), updatedAt: new Date() },
  );
}

// ─────────────────────────────────────────────────────────────────────────
// In-game actions
// ─────────────────────────────────────────────────────────────────────────

export interface ActionResult {
  game: StoredGame & { tokensJson: string };
}

export async function rollDice(code: string, playerId: string): Promise<ActionResult> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const room = await loadRoom(code);
    const game = parseGame(room.gameStateJson);
    if (!game) throw new ConflictError("Game not started");
    if (game.status !== "playing") throw new ConflictError("Game is not in progress");
    if (game.currentTurn !== playerId) {
      // The client's cached "whose turn" was stale (normal with polling —
      // it just hasn't seen the latest turn_changed event yet). Fail loudly
      // instead of silently no-op'ing, so the client can resync right away
      // rather than the dice looking like it's simply not working.
      throw new StaleTurnError("Not your turn");
    }

    const { newState, diceValue, movableTokens } = processDiceRoll(game, playerId);
    const next: StoredGame = { ...newState, diceRolledAt: movableTokens.length > 0 ? nowMs() : null, events: game.events, eventSeq: game.eventSeq };
    pushEvent(next, { type: "dice_rolled", playerId, value: diceValue, movableTokens });
    if (movableTokens.length === 0) {
      pushEvent(next, { type: "turn_changed", currentTurn: next.currentTurn, turnTimerSeconds: next.turnTimerSeconds });
    }
    // A legal move exists — give a fresh window to pick a token, same as
    // the old timer being restarted after a roll.
    if (movableTokens.length > 0) next.turnStartTime = nowMs();

    const newSeq = await saveGame(code, room.gameSeq, next);
    if (newSeq !== null) return { game: { ...next, tokensJson: tokensJsonFor(next) } };
    // Conflict — someone else wrote first (e.g. a duplicate double-click); retry against fresh state.
  }
  throw new ConflictError("Could not apply roll — too much contention");
}

export async function moveToken(code: string, playerId: string, tokenIndex: number): Promise<ActionResult> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const room = await loadRoom(code);
    const game = parseGame(room.gameStateJson);
    if (!game) throw new ConflictError("Game not started");
    if (game.status !== "playing") throw new ConflictError("Game is not in progress");
    if (game.currentTurn !== playerId) {
      // Same staleness case as rollDice — the client hasn't seen the
      // latest turn_changed yet.
      throw new StaleTurnError("Not your turn");
    }
    if (!game.movableTokens.includes(tokenIndex)) {
      // Turn is current, but this particular token isn't movable (e.g. the
      // client's dice/movable-tokens view was stale, or a double-click
      // raced a move that already happened) — same resync treatment.
      throw new StaleTurnError("That token isn't movable right now");
    }

    const controlledId = getControlledPlayer(game, playerId).playerId;
    const result = engineMoveToken(game, playerId, tokenIndex);
    const next: StoredGame = { ...result.newState, diceRolledAt: null, events: game.events, eventSeq: game.eventSeq };
    pushEvent(next, {
      type: "token_moved",
      playerId: controlledId,
      tokenIndex,
      newProgress: result.moverNewProgress,
      cuts: result.cuts.map((c) => ({ victimId: c.playerId, tokenIndex: c.tokenIndex, fromProgress: c.progressBefore })),
      tokenReachedHome: result.tokenReachedHome,
    });

    if (result.gameOver) {
      pushEvent(next, { type: "game_over", winnerId: next.winnerId!, rankings: next.rankings });
    } else {
      pushEvent(next, { type: "turn_changed", currentTurn: next.currentTurn, turnTimerSeconds: next.turnTimerSeconds });
    }

    const newSeq = await saveGame(code, room.gameSeq, next);
    if (newSeq === null) continue; // conflict — retry against fresh state

    if (result.gameOver) await saveGameResult(next);
    return { game: { ...next, tokensJson: tokensJsonFor(next) } };
  }
  throw new ConflictError("Could not apply move — too much contention");
}

// ─────────────────────────────────────────────────────────────────────────
// Polling read — this is where bot turns and turn-timeouts actually get
// resolved, lazily, based on how much time has passed since the relevant
// timestamp. No timers, no background process — just "catch the state up
// to what it should be right now" on every read.
// ─────────────────────────────────────────────────────────────────────────

export interface RoomStateResult {
  room: RoomRecord;
  lobby: LobbyPlayer[] | null;
  game: (StoredGame & { tokensJson: string }) | null;
  newEvents: GameEvent[];
}

export async function getRoomState(code: string, sinceSeq: number): Promise<RoomStateResult> {
  const room = await loadRoom(code);

  // Cancelled/abandoned rooms are terminal — never resolve bot turns or
  // timeouts against a game that's already been torn down. The client
  // detects this via `room.status` (mirrors the old `match_cancelled`
  // socket event, just polled instead of pushed).
  if (room.status === "cancelled" || room.status === "abandoned") {
    return { room, lobby: null, game: null, newEvents: [] };
  }

  if (!room.gameStateJson) {
    return { room, lobby: parseLobby(room.lobbyJson), game: null, newEvents: [] };
  }

  const parsedGame = parseGame(room.gameStateJson);
  if (!parsedGame) return { room, lobby: null, game: null, newEvents: [] };

  if (parsedGame.status !== "playing") {
    return { room, lobby: null, game: { ...parsedGame, tokensJson: tokensJsonFor(parsedGame) }, newEvents: parsedGame.events.filter((e) => e.seq > sinceSeq) };
  }

  // Declared as non-null StoredGame (not `StoredGame | null`) so the
  // narrowing above survives every reassignment inside the loop below —
  // `let game = parseGame(...)` would otherwise lose that narrowing across
  // loop iterations, since TS re-widens reassigned `let`s at loop boundaries.
  let game: StoredGame = parsedGame;

  const now = nowMs();
  let seq = room.gameSeq;
  let resolutions = 0;
  let mutated = false;

  while (resolutions < MAX_RESOLUTIONS_PER_POLL) {
    if (game.status !== "playing") break;

    if (!hasConnectedHuman(game)) {
      await abandonGame(code, "abandoned");
      const fresh = await loadRoom(code);
      return { room: fresh, lobby: null, game: null, newEvents: [] };
    }

    const currentPlayer = game.players.find((p) => p.playerId === game.currentTurn);
    if (!currentPlayer) break;

    let didSomething = false;

    if (currentPlayer.isBot) {
      const difficulty = currentPlayer.botDifficulty || "medium";
      if (game.diceValue === null) {
        // Bot hasn't rolled yet this turn — wait out the roll delay.
        if (now - game.turnStartTime! >= (BOT_ROLL_DELAY_MS[difficulty] || 1500)) {
          const { newState, diceValue, movableTokens } = processDiceRoll(game, currentPlayer.playerId);
          game = { ...newState, diceRolledAt: movableTokens.length > 0 ? now : null, events: game.events, eventSeq: game.eventSeq };
          pushEvent(game, { type: "dice_rolled", playerId: currentPlayer.playerId, value: diceValue, movableTokens });
          if (movableTokens.length === 0) {
            pushEvent(game, { type: "turn_changed", currentTurn: game.currentTurn, turnTimerSeconds: game.turnTimerSeconds });
          } else {
            game.turnStartTime = now;
          }
          didSomething = true;
        }
      } else if (game.diceRolledAt !== null) {
        // Bot rolled — wait out the "decide + move" delay, then move.
        if (now - game.diceRolledAt >= (BOT_MOVE_DELAY_MS[difficulty] || 1500)) {
          const tokenIdx = getBotMove(game, currentPlayer.playerId, difficulty as "easy" | "medium" | "hard");
          if (tokenIdx !== -1) {
            const controlledId = getControlledPlayer(game, currentPlayer.playerId).playerId;
            const result = engineMoveToken(game, currentPlayer.playerId, tokenIdx);
            game = { ...result.newState, diceRolledAt: null, events: game.events, eventSeq: game.eventSeq };
            pushEvent(game, {
              type: "token_moved",
              playerId: controlledId,
              tokenIndex: tokenIdx,
              newProgress: result.moverNewProgress,
              cuts: result.cuts.map((c) => ({ victimId: c.playerId, tokenIndex: c.tokenIndex, fromProgress: c.progressBefore })),
              tokenReachedHome: result.tokenReachedHome,
            });
            if (result.gameOver) {
              pushEvent(game, { type: "game_over", winnerId: game.winnerId!, rankings: game.rankings });
              await saveGameResult(game);
            } else {
              pushEvent(game, { type: "turn_changed", currentTurn: game.currentTurn, turnTimerSeconds: game.turnTimerSeconds });
            }
            didSomething = true;
          }
        }
      }
    } else if (now - game.turnStartTime! >= TURN_TIMEOUT_MS) {
      // Human whose turn-timer expired.
      if (game.diceValue !== null) {
        const forfeited = forfeitTurn(game);
        game = { ...forfeited, diceRolledAt: null, events: game.events, eventSeq: game.eventSeq };
        pushEvent(game, { type: "turn_changed", currentTurn: game.currentTurn, turnTimerSeconds: game.turnTimerSeconds });
      } else {
        const { newState, diceValue, movableTokens } = processDiceRoll(game, game.currentTurn);
        game = { ...newState, diceRolledAt: movableTokens.length > 0 ? now : null, events: game.events, eventSeq: game.eventSeq };
        pushEvent(game, { type: "dice_rolled", playerId: game.currentTurn, value: diceValue, movableTokens });
        if (movableTokens.length === 0) {
          pushEvent(game, { type: "turn_changed", currentTurn: game.currentTurn, turnTimerSeconds: game.turnTimerSeconds });
        } else {
          game.turnStartTime = now;
        }
      }
      didSomething = true;
    }

    if (!didSomething) break;
    mutated = true;
    resolutions += 1;
  }

  if (mutated) {
    const newSeq = await saveGame(code, seq, game);
    if (newSeq === null) {
      // Someone else's poll already persisted an equal-or-later state —
      // use theirs instead of erroring.
      const fresh = await loadRoom(code);
      const freshGame = parseGame(fresh.gameStateJson);
      if (freshGame) {
        return { room: fresh, lobby: null, game: { ...freshGame, tokensJson: tokensJsonFor(freshGame) }, newEvents: freshGame.events.filter((e) => e.seq > sinceSeq) };
      }
    } else {
      seq = newSeq;
    }
  }

  return {
    room: { ...room, gameSeq: seq },
    lobby: null,
    game: { ...game, tokensJson: tokensJsonFor(game) },
    newEvents: game.events.filter((e) => e.seq > sinceSeq),
  };
}

// ─────────────────────────────────────────────────────────────────────────

async function saveGameResult(game: GameState): Promise<void> {
  try {
    await GameRecordModel.create({
      _id: randomUUID(),
      roomCode: game.roomCode,
      playerCount: game.players.length,
      winnerId: game.winnerId!,
      rankingsJson: JSON.stringify(game.rankings),
      playedAt: new Date(),
    });

    for (const ranking of game.rankings) {
      const player = game.players.find((p) => p.playerId === ranking.playerId);
      if (!player || player.isBot) continue;

      const won = ranking.rank === 1 ? 1 : 0;
      const tokensHome = player.tokensHome;

      const current = await PlayerModel.findById(ranking.playerId).lean();
      if (!current) continue; // guest, not registered — nothing to update server-side

      const newStreak = won ? current.currentWinStreak + 1 : 0;

      await PlayerModel.updateOne(
        { _id: ranking.playerId },
        {
          gamesPlayed: current.gamesPlayed + 1,
          gamesWon: current.gamesWon + won,
          totalTokensHome: current.totalTokensHome + tokensHome,
          currentWinStreak: newStreak,
          longestWinStreak: Math.max(current.longestWinStreak, newStreak),
          updatedAt: new Date(),
        },
      );
    }
  } catch (err) {
    logger.error({ err }, "Failed to save game result");
  }
}
