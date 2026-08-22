/**
 * Ludo Game Engine — server-side game state management
 * Handles all game logic, turn management, and state transitions
 */

export type PlayerColor = "red" | "green" | "yellow" | "blue";
export type GameStatus = "waiting" | "playing" | "paused" | "finished";

export interface TokenPosition {
  area: "yard" | "track" | "home_column" | "home";
  index: number; // track: 0-51, home_column: 0-5, yard/home: 0-3
}

export interface GamePlayer {
  playerId: string;
  name: string;
  color: PlayerColor;
  isBot: boolean;
  botDifficulty?: "easy" | "medium" | "hard";
  isConnected: boolean;
  tokensHome: number;
  tokens: TokenPosition[]; // 4 tokens
  socketId?: string;
}

export interface ChatMessage {
  playerId: string;
  name: string;
  message: string;
  emoji?: string;
  timestamp: number;
}

export interface GameState {
  roomCode: string;
  status: GameStatus;
  players: GamePlayer[];
  currentTurn: string; // playerId — who is rolling/acting this turn
  turnOrder: string[]; // player IDs in turn order (seat order, never redirected)
  diceValue: number | null;
  movableTokens: number[]; // indices of tokens that can move (on the *controlled* player)
  consecutiveSixes: number;
  turnStartTime: number | null;
  turnTimerSeconds: number;
  winnerId: string | null;
  rankings: { playerId: string; rank: number }[];
  chat: ChatMessage[];
  /** Team Up (pairing) mode — Red+Yellow vs Green+Blue. */
  teamMode: boolean;
  /** Catch-up dice: consecutive "unlucky" rolls per player (keyed by playerId). */
  pityCounters: Record<string, number>;
}

// Board layout constants
const TRACK_LENGTH = 52;
const HOME_COLUMN_LENGTH = 6;

// Starting positions on the main track for each color (0-indexed)
const COLOR_START: Record<PlayerColor, number> = {
  red: 0,
  green: 13,
  yellow: 26,
  blue: 39,
};

// The track position where each color enters their home column
const COLOR_HOME_ENTRY: Record<PlayerColor, number> = {
  red: 51,
  green: 12,
  yellow: 25,
  blue: 38,
};

// Safe squares (0-indexed track positions)
const SAFE_SQUARES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

// Fixed diagonal-corner Team Up partners: Red+Yellow / Green+Blue.
const TEAMMATE_COLOR: Record<PlayerColor, PlayerColor> = {
  red: "yellow",
  yellow: "red",
  green: "blue",
  blue: "green",
};
const TEAM_KEY: Record<PlayerColor, string> = {
  red: "RY",
  yellow: "RY",
  green: "GB",
  blue: "GB",
};

export function createInitialGameState(
  roomCode: string,
  players: Omit<GamePlayer, "tokens" | "tokensHome">[],
  teamMode = false,
): GameState {
  const gamePlayers: GamePlayer[] = players.map((p) => ({
    ...p,
    tokensHome: 0,
    tokens: [
      { area: "yard", index: 0 },
      { area: "yard", index: 1 },
      { area: "yard", index: 2 },
      { area: "yard", index: 3 },
    ],
  }));

  const turnOrder = gamePlayers.map((p) => p.playerId);

  return {
    roomCode,
    status: "playing",
    players: gamePlayers,
    currentTurn: turnOrder[0],
    turnOrder,
    diceValue: null,
    movableTokens: [],
    consecutiveSixes: 0,
    turnStartTime: Date.now(),
    turnTimerSeconds: 30,
    winnerId: null,
    rankings: [],
    chat: [],
    teamMode: !!teamMode && gamePlayers.length === 4,
    pityCounters: {},
  };
}

export function rollDice(): number {
  return Math.floor(Math.random() * 6) + 1;
}

// ─── Progress-number bridge (0-57) ───────────────────────────────────────────
// The client's animation/rules layer works in a single linear "progress"
// number (0 = yard, 1-51 = track, 52-56 = home column, 57 = home). The
// engine internally models tokens as {area, index}. These helpers translate
// between the two so every socket payload the client receives is expressed
// as a plain progress number — this is what the client already expects.
/** Convert a player's token (area/index model) into the 0-57 progress number, given its color. */
export function tokenProgressForPlayer(color: PlayerColor, token: TokenPosition): number {
  if (token.area === "yard") return 0;
  if (token.area === "home_column") return 52 + token.index;
  if (token.area === "home") return 57;
  // area === "track": index is absolute (0-51); convert to steps-from-start (1-51)
  const stepsFromStart = (token.index - COLOR_START[color] + TRACK_LENGTH) % TRACK_LENGTH;
  return stepsFromStart + 1;
}

/** All of a player's tokens as progress numbers — used to build `tokensJson` for the client. */
export function playerProgressArray(player: GamePlayer): number[] {
  return player.tokens.map((t) => tokenProgressForPlayer(player.color, t));
}

/** Track index (0-51) for a token at `progress` for `color`, or null if not on the main track. */
function trackPosForProgress(color: PlayerColor, progress: number): number | null {
  if (progress < 1 || progress > 51) return null;
  return (COLOR_START[color] + progress - 1) % TRACK_LENGTH;
}

function isSameSide(state: GameState, aPlayerId: string, bPlayerId: string): boolean {
  if (aPlayerId === bPlayerId) return true;
  if (!state.teamMode) return false;
  const a = state.players.find((p) => p.playerId === aPlayerId);
  const b = state.players.find((p) => p.playerId === bPlayerId);
  if (!a || !b) return false;
  return TEAM_KEY[a.color] === TEAM_KEY[b.color];
}

/** True if a hostile block (2+ tokens of one opposing side) sits on `trackPos`. */
/** True if a hostile block (2+ tokens of one opposing side) sits on `trackPos`.
 * Doesn't apply to safe/star squares — those already prevent capture
 * outright, so a same-side pair parked there doesn't wall it off. */
function hostileBlockAt(state: GameState, moverPlayerId: string, trackPos: number): boolean {
  if (SAFE_SQUARES.has(trackPos)) return false;
  const groups = new Map<string, number>();
  for (const p of state.players) {
    if (isSameSide(state, moverPlayerId, p.playerId)) continue;
    for (const t of p.tokens) {
      if (t.area === "track" && t.index === trackPos) {
        const key = state.teamMode ? TEAM_KEY[p.color] : p.playerId;
        groups.set(key, (groups.get(key) ?? 0) + 1);
      }
    }
  }
  for (const count of groups.values()) if (count >= 2) return true;
  return false;
}

/** Track squares crossed (landing square last) moving `steps` from `fromProgress` for `color`. */
function squaresForMove(color: PlayerColor, fromProgress: number, steps: number): number[] {
  if (fromProgress === 0) {
    const start = trackPosForProgress(color, 1);
    return start === null ? [] : [start];
  }
  const upper = Math.min(fromProgress + steps, 51);
  const squares: number[] = [];
  for (let p = fromProgress + 1; p <= upper; p++) {
    const pos = trackPosForProgress(color, p);
    if (pos !== null) squares.push(pos);
  }
  return squares;
}

/**
 * The player whose tokens are actually being moved this turn. Normally the
 * roller themself — but under Team Up mode, once a player finishes all 4
 * tokens they keep rolling and pilot their still-playing teammate's tokens.
 */
export function getControlledPlayer(state: GameState, turnPlayerId: string): GamePlayer {
  const turnPlayer = state.players.find((p) => p.playerId === turnPlayerId)!;
  if (!state.teamMode) return turnPlayer;
  if (turnPlayer.tokensHome < 4) return turnPlayer;
  const mateColor = TEAMMATE_COLOR[turnPlayer.color];
  const mate = state.players.find((p) => p.color === mateColor);
  if (mate && mate.tokensHome < 4) return mate;
  return turnPlayer;
}

/** Returns indices of tokens that can legally move given dice value (rules-aware: blocks + team immunity). */
export function getMovableTokens(
  state: GameState,
  turnPlayerId: string,
  diceValue: number,
): number[] {
  const player = getControlledPlayer(state, turnPlayerId);
  const movable: number[] = [];

  for (let i = 0; i < 4; i++) {
    const token = player.tokens[i];
    if (token.area === "home") continue;

    if (token.area === "yard") {
      if (diceValue !== 6) continue;
      const squares = squaresForMove(player.color, 0, diceValue);
      if (squares.some((sq) => hostileBlockAt(state, player.playerId, sq))) continue;
      movable.push(i);
      continue;
    }

    if (token.area === "track") {
      const progress = tokenProgressForPlayer(player.color, token);
      const newProgress = progress + diceValue;
      if (newProgress > 57) continue;
      const squares = squaresForMove(player.color, progress, diceValue);
      if (squares.some((sq) => hostileBlockAt(state, player.playerId, sq))) continue;
      movable.push(i);
      continue;
    }

    if (token.area === "home_column") {
      const newPos = token.index + diceValue;
      if (newPos <= HOME_COLUMN_LENGTH - 1) movable.push(i);
    }
  }

  return movable;
}

export interface CaptureInfo {
  playerId: string;
  tokenIndex: number;
  progressBefore: number;
}

export interface MoveResult {
  newState: GameState;
  cut: boolean; // legacy single-capture flag (true if any capture happened)
  cutPlayerId?: string; // legacy — first captured player, kept for backward compatibility
  cutTokenIndex?: number; // legacy — first captured token index
  cuts: CaptureInfo[]; // full capture list (usually 0 or 1 entries; blocks prevent multi-capture pileups)
  tokenReachedHome: boolean;
  moverNewProgress: number; // the moved token's resulting 0-57 progress, for client sync
  gameOver: boolean;
}

/** Apply a token move (by index, on the CONTROLLED player) to the game state. */
export function moveToken(
  state: GameState,
  turnPlayerId: string,
  tokenIndex: number,
): MoveResult {
  const newState: GameState = JSON.parse(JSON.stringify(state));
  const controlled = getControlledPlayer(state, turnPlayerId);
  const playerIdx = newState.players.findIndex((p) => p.playerId === controlled.playerId);
  const player = newState.players[playerIdx];
  const token = player.tokens[tokenIndex];
  const diceValue = state.diceValue!;
  const color = player.color;

  const cuts: CaptureInfo[] = [];
  let tokenReachedHome = false;

  if (token.area === "yard") {
    token.area = "track";
    token.index = COLOR_START[color];
  } else if (token.area === "track") {
    const homeEntry = COLOR_HOME_ENTRY[color];
    const distToEntry = (homeEntry - token.index + TRACK_LENGTH) % TRACK_LENGTH;

    if (diceValue <= distToEntry) {
      token.index = (token.index + diceValue) % TRACK_LENGTH;

      if (!SAFE_SQUARES.has(token.index)) {
        for (let pi = 0; pi < newState.players.length; pi++) {
          const opponent = newState.players[pi];
          if (isSameSide(newState, controlled.playerId, opponent.playerId)) continue;
          for (let ti = 0; ti < 4; ti++) {
            const opToken = opponent.tokens[ti];
            if (opToken.area === "track" && opToken.index === token.index) {
              const progressBefore = tokenProgressForPlayer(opponent.color, opToken);
              opToken.area = "yard";
              opToken.index = ti;
              cuts.push({ playerId: opponent.playerId, tokenIndex: ti, progressBefore });
            }
          }
        }
      }
    } else {
      const stepsIntoHomeCol = diceValue - distToEntry - 1;
      token.area = "home_column";
      token.index = stepsIntoHomeCol;

      if (token.index === HOME_COLUMN_LENGTH - 1) {
        token.area = "home";
        token.index = tokenIndex;
        player.tokensHome++;
        tokenReachedHome = true;
      }
    }
  } else if (token.area === "home_column") {
    token.index += diceValue;
    if (token.index >= HOME_COLUMN_LENGTH - 1) {
      token.area = "home";
      token.index = tokenIndex;
      player.tokensHome++;
      tokenReachedHome = true;
    }
  }

  const moverNewProgress = tokenProgressForPlayer(color, token);

  // Win check: solo mode finishes on 4/4; Team Up finishes on 8/8 (both partners).
  const teamDone = newState.teamMode
    ? player.tokensHome === 4 &&
      (() => {
        const mate = newState.players.find((p) => p.color === TEAMMATE_COLOR[color]);
        return !mate || mate.tokensHome === 4;
      })()
    : player.tokensHome === 4;

  if (teamDone) {
    newState.winnerId = turnPlayerId;
    newState.status = "finished";
    const finishOrder = newState.rankings.map((r) => r.playerId);
    finishOrder.push(turnPlayerId);
    const remaining = newState.players
      .filter((p) => p.playerId !== turnPlayerId)
      .sort((a, b) => b.tokensHome - a.tokensHome);
    remaining.forEach((p) => finishOrder.push(p.playerId));
    newState.rankings = finishOrder.map((pid, idx) => ({ playerId: pid, rank: idx + 1 }));
  }

  const gameOver = newState.status === "finished";
  const cut = cuts.length > 0;

  if (!gameOver) {
    // consecutiveSixes is tracked at roll time (see processDiceRoll); a
    // roll of 6 just means "same roller goes again" here, it does not
    // itself advance the streak counter.
    const extraTurn = diceValue === 6 || cut || tokenReachedHome;
    if (!extraTurn) {
      advanceTurn(newState); // resets consecutiveSixes as part of the handoff
    }
    newState.diceValue = null;
    newState.movableTokens = [];
    newState.turnStartTime = Date.now();
  }

  return {
    newState,
    cut,
    cutPlayerId: cuts[0]?.playerId,
    cutTokenIndex: cuts[0]?.tokenIndex,
    cuts,
    tokenReachedHome,
    moverNewProgress,
    gameOver,
  };
}

/** A seat (player) whose side has already finished (solo: 4/4; team: both partners 4/4). */
function sideFullyFinished(state: GameState, player: GamePlayer): boolean {
  if (player.tokensHome < 4) return false;
  if (!state.teamMode) return true;
  const mate = state.players.find((p) => p.color === TEAMMATE_COLOR[player.color]);
  return !mate || mate.tokensHome === 4;
}

function advanceTurn(state: GameState): void {
  state.consecutiveSixes = 0;
  const currentIdx = state.turnOrder.indexOf(state.currentTurn);

  let nextIdx = (currentIdx + 1) % state.turnOrder.length;
  let attempts = 0;
  while (attempts < state.turnOrder.length) {
    const nextPlayerId = state.turnOrder[nextIdx];
    const nextPlayer = state.players.find((p) => p.playerId === nextPlayerId);
    if (nextPlayer && !sideFullyFinished(state, nextPlayer)) {
      state.currentTurn = nextPlayerId;
      return;
    }
    nextIdx = (nextIdx + 1) % state.turnOrder.length;
    attempts++;
  }
}

/** Force-end the current player's turn without a new roll — used when they rolled, had a legal move, but never picked a token in time. */
export function forfeitTurn(state: GameState): GameState {
  const newState: GameState = JSON.parse(JSON.stringify(state));
  newState.diceValue = null;
  newState.movableTokens = [];
  advanceTurn(newState);
  return newState;
}

/** Which dice values (1-6) would meaningfully help `controlledPlayerId` right now: escaping the yard, or landing a capture. */
function usefulDiceValuesFor(state: GameState, controlledPlayerId: string): Set<number> {
  const player = state.players.find((p) => p.playerId === controlledPlayerId);
  if (!player) return new Set();
  const allInYard = player.tokens.every((t) => t.area === "yard");

  const useful = new Set<number>();
  for (let v = 1; v <= 6; v++) {
    if (allInYard) {
      if (v === 6) useful.add(v);
      continue;
    }
    const legal = getMovableTokens(state, controlledPlayerId, v);
    for (const ti of legal) {
      const simState: GameState = JSON.parse(JSON.stringify(state));
      simState.diceValue = v;
      const result = moveToken(simState, controlledPlayerId, ti);
      if (result.cut) { useful.add(v); break; }
    }
  }
  return useful;
}

/** A dice roll biased toward `usefulValues` in proportion to `pity` (a drought counter) — plain uniform 1-6 when there's nothing useful to bias toward. Mirrors the client's equivalent (utils/ludo.ts) so offline and online feel consistent. */
function weightedDiceRoll(usefulValues: Set<number>, pity: number): number {
  if (usefulValues.size === 0) return rollDice();
  const boost = Math.min(pity * 0.35, 2.2);
  const weights = [1, 1, 1, 1, 1, 1];
  usefulValues.forEach((v) => { weights[v - 1] += boost; });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < 6; i++) {
    r -= weights[i];
    if (r <= 0) return i + 1;
  }
  return 6;
}

/** Process dice roll on server side */
export function processDiceRoll(
  state: GameState,
  playerId: string,
): { newState: GameState; diceValue: number; movableTokens: number[] } {
  if (state.currentTurn !== playerId || state.status !== "playing") {
    return { newState: state, diceValue: 0, movableTokens: [] };
  }

  const controlled = getControlledPlayer(state, playerId);
  const useful = usefulDiceValuesFor(state, controlled.playerId);
  const pity = state.pityCounters[controlled.playerId] ?? 0;
  const diceValue = weightedDiceRoll(useful, pity);

  const newState: GameState = JSON.parse(JSON.stringify(state));
  newState.diceValue = diceValue;
  newState.pityCounters[controlled.playerId] = useful.has(diceValue) ? 0 : (useful.size > 0 ? pity + 1 : pity);

  newState.consecutiveSixes = diceValue === 6 ? state.consecutiveSixes + 1 : 0;

  if (newState.consecutiveSixes >= 3) {
    // Third consecutive 6 forfeits this roll outright — no token may move,
    // turn passes immediately.
    newState.consecutiveSixes = 0;
    advanceTurn(newState);
    newState.diceValue = null;
    return { newState, diceValue, movableTokens: [] };
  }

  const movableTokens = getMovableTokens(newState, playerId, diceValue);

  if (movableTokens.length === 0) {
    advanceTurn(newState);
    newState.diceValue = null;
    return { newState, diceValue, movableTokens: [] };
  }

  newState.movableTokens = movableTokens;
  return { newState, diceValue, movableTokens };
}

/**
 * Returns the smallest dice roll (1-6) an opposing single token could use to
 * land on `trackIndex` next turn, or false if none can. Used to weigh risk.
 */
function threatDistance(
  state: GameState,
  playerId: string,
  trackIndex: number,
): number | false {
  if (SAFE_SQUARES.has(trackIndex)) return false;

  let closest: number | false = false;
  for (const opponent of state.players) {
    if (isSameSide(state, playerId, opponent.playerId)) continue;
    for (const token of opponent.tokens) {
      if (token.area !== "track") continue;
      for (let d = 1; d <= 6; d++) {
        if ((token.index + d) % TRACK_LENGTH === trackIndex) {
          if (closest === false || d < closest) closest = d;
        }
      }
    }
  }
  return closest;
}

function isTokenSafe(state: GameState, playerId: string, color: PlayerColor, token: TokenPosition): boolean {
  if (token.area !== "track") return true;
  if (SAFE_SQUARES.has(token.index)) return true;

  let sideCount = 0;
  for (const p of state.players) {
    if (!isSameSide(state, playerId, p.playerId)) continue;
    for (const t of p.tokens) if (t.area === "track" && t.index === token.index) sideCount++;
  }
  if (sideCount >= 2) return true;

  return threatDistance(state, playerId, token.index) === false;
}

/**
 * Bot AI: scores every legal move against the priority ladder below (same
 * ladder used by the offline client bot) and picks the strongest one.
 *   1. Capture an opponent                      +1000
 *   2. Save a token that was about to be taken   +900
 *   3. Reach Home                                +850
 *   4. Enter the home column                     +800
 *   5. Escape the base (roll of 6)                +700
 *   6. Avoid being captured                       -(100 - distance)
 *   7. Create / keep a block                       +600
 *   8. Break enemy strategy (occupy their launch pad / safe square) +500
 *   9. Advance the most-progressed token           +400
 *  10. Spread tokens out when clustered            +300
 *  11. Move the furthest-behind token              +200
 *  12. Random tiebreak                             ~0
 * "hard" plays this near-optimally; "medium"/"easy" mix in a chance of a
 * deliberately weaker move so the bot stays fun and beatable.
 */
export function getBotMove(
  state: GameState,
  botPlayerId: string,
  difficulty: "easy" | "medium" | "hard" = "medium",
): number {
  const controlled = getControlledPlayer(state, botPlayerId);
  const movable = state.movableTokens;

  if (movable.length === 0) return -1;
  if (movable.length === 1) return movable[0];

  const opponentStartSquares = (Object.keys(COLOR_START) as PlayerColor[])
    .filter((c) => {
      const owner = state.players.find((p) => p.color === c);
      return owner && !isSameSide(state, controlled.playerId, owner.playerId);
    })
    .map((c) => COLOR_START[c]);
  const opponentHomeEntrySquares = (Object.keys(COLOR_HOME_ENTRY) as PlayerColor[])
    .filter((c) => {
      const owner = state.players.find((p) => p.color === c);
      return owner && !isSameSide(state, controlled.playerId, owner.playerId);
    })
    .map((c) => COLOR_HOME_ENTRY[c]);

  const onTrackProgresses = controlled.tokens
    .map((t) => tokenProgressForPlayer(controlled.color, t))
    .filter((p) => p >= 1 && p <= 51);
  const clustered = onTrackProgresses.length >= 2 &&
    Math.max(...onTrackProgresses) - Math.min(...onTrackProgresses) <= 6;

  const movableProgresses = movable.map((ti) => tokenProgressForPlayer(controlled.color, controlled.tokens[ti]));
  const maxMovableProgress = Math.max(...movableProgresses.filter((p) => p > 0), -1);
  const minMovableProgress = Math.min(...movableProgresses.filter((p) => p > 0), Infinity);
  const onBoardCount = controlled.tokens.filter((t) => t.area === "track" || t.area === "home_column").length;

  const scores = movable.map((ti) => {
    const token = controlled.tokens[ti];
    const progressBefore = tokenProgressForPlayer(controlled.color, token);
    const wasThreatened = token.area === "track" && !isTokenSafe(state, controlled.playerId, controlled.color, token);

    const simState: GameState = JSON.parse(JSON.stringify(state));
    const result = moveToken(simState, botPlayerId, ti);
    const movedPlayer = result.newState.players.find((p) => p.playerId === controlled.playerId)!;
    const movedToken = movedPlayer.tokens[ti];

    let score = 0;

    if (result.gameOver) score += 100_000; // finishing the game outright

    if (result.cut) {
      score += 1000;
      for (const c of result.cuts) {
        score += c.progressBefore >= 52 ? 60 : Math.min(30, c.progressBefore * 0.8);
      }
    }

    if (movedToken.area === "home") score += 850;
    else if (movedToken.area === "home_column") score += 800 + movedToken.index * 5;

    if (token.area === "yard") score += 700 - onBoardCount * 15;

    const safeAfter = isTokenSafe(result.newState, controlled.playerId, controlled.color, movedToken);
    if (wasThreatened && safeAfter) {
      score += 900;
    } else if (!safeAfter) {
      const dist = threatDistance(result.newState, controlled.playerId, movedToken.index);
      score -= 100 - (dist === false ? 6 : dist);
    }

    if (movedToken.area === "track") {
      let blockPartner = false;
      for (const p of result.newState.players) {
        if (!isSameSide(result.newState, controlled.playerId, p.playerId)) continue;
        for (let idx = 0; idx < 4; idx++) {
          if (p.playerId === controlled.playerId && idx === ti) continue;
          const t = p.tokens[idx];
          if (t.area === "track" && t.index === movedToken.index) blockPartner = true;
        }
      }
      if (blockPartner) score += 600;

      if (opponentStartSquares.includes(movedToken.index) || opponentHomeEntrySquares.includes(movedToken.index)) score += 500;
      else if (SAFE_SQUARES.has(movedToken.index)) score += 120;
    }

    const newProgress = tokenProgressForPlayer(controlled.color, movedToken);
    if (progressBefore > 0 && progressBefore === maxMovableProgress) score += 400;
    if (clustered) score += 300;
    if (progressBefore > 0 && progressBefore === minMovableProgress) score += 200;

    score += newProgress * 0.2;
    score += Math.random() * 0.5;

    return score;
  });

  if (difficulty === "easy" && Math.random() < 0.35) {
    const sorted = [...movable].sort((a, b) => scores[movable.indexOf(a)] - scores[movable.indexOf(b)]);
    const weakerHalf = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 2)));
    return weakerHalf[Math.floor(Math.random() * weakerHalf.length)];
  }

  if (difficulty === "medium" && Math.random() < 0.10 && movable.length > 1) {
    const sorted = [...movable].sort((a, b) => scores[movable.indexOf(b)] - scores[movable.indexOf(a)]);
    return sorted[1];
  }

  if (difficulty === "hard" && Math.random() < 0.03 && movable.length > 1) {
    const sorted = [...movable].sort((a, b) => scores[movable.indexOf(b)] - scores[movable.indexOf(a)]);
    return sorted[1];
  }

  const bestIdx = scores.indexOf(Math.max(...scores));
  return movable[bestIdx];
}
