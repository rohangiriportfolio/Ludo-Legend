export type PlayerColor = 'red' | 'green' | 'yellow' | 'blue';

export const COLORS: PlayerColor[] = ['red', 'green', 'yellow', 'blue'];

export const COLOR_HEX = {
  red:    '#FF1744',
  green:  '#00C853',
  yellow: '#FFD600',
  blue:   '#2979FF',
};

// Start positions in the TRACK_PATH array
export const START_POSITIONS = { red: 0, green: 13, yellow: 26, blue: 39 };

// The track square immediately before each color turns off into its private
// home column — sitting on/blocking this square denies that color's entry.
export const HOME_ENTRY_SQUARES: Record<PlayerColor, number> = {
  red:    (START_POSITIONS.red    - 1 + 52) % 52,
  green:  (START_POSITIONS.green  - 1 + 52) % 52,
  yellow: (START_POSITIONS.yellow - 1 + 52) % 52,
  blue:   (START_POSITIONS.blue   - 1 + 52) % 52,
};

export const SAFE_SQUARES = [0, 8, 13, 21, 26, 34, 39, 47];

// Team Up (pairing) partners — fixed diagonal-corner pairing, matching the
// classic Ludo King "Team Up" mode: Red+Yellow are diagonally opposite
// corners, Green+Blue are diagonally opposite corners.
export const TEAMMATE_COLOR: Record<PlayerColor, PlayerColor> = {
  red: 'yellow', yellow: 'red',
  green: 'blue', blue: 'green',
};

// A stable key identifying which "team" a color belongs to (used to group
// blocks/sides together). Two colors share a TEAM_KEY iff they're partners.
export const TEAM_KEY: Record<PlayerColor, string> = {
  red: 'RY', yellow: 'RY',
  green: 'GB', blue: 'GB',
};

export const TRACK_PATH = [
  // 0-4
  {x: 1, y: 6}, {x: 2, y: 6}, {x: 3, y: 6}, {x: 4, y: 6}, {x: 5, y: 6},
  // 5-10
  {x: 6, y: 5}, {x: 6, y: 4}, {x: 6, y: 3}, {x: 6, y: 2}, {x: 6, y: 1}, {x: 6, y: 0},
  // 11-12
  {x: 7, y: 0}, {x: 8, y: 0},
  // 13-17
  {x: 8, y: 1}, {x: 8, y: 2}, {x: 8, y: 3}, {x: 8, y: 4}, {x: 8, y: 5},
  // 18-23
  {x: 9, y: 6}, {x: 10, y: 6}, {x: 11, y: 6}, {x: 12, y: 6}, {x: 13, y: 6}, {x: 14, y: 6},
  // 24-25
  {x: 14, y: 7}, {x: 14, y: 8},
  // 26-30
  {x: 13, y: 8}, {x: 12, y: 8}, {x: 11, y: 8}, {x: 10, y: 8}, {x: 9, y: 8},
  // 31-36
  {x: 8, y: 9}, {x: 8, y: 10}, {x: 8, y: 11}, {x: 8, y: 12}, {x: 8, y: 13}, {x: 8, y: 14},
  // 37-38
  {x: 7, y: 14}, {x: 6, y: 14},
  // 39-43
  {x: 6, y: 13}, {x: 6, y: 12}, {x: 6, y: 11}, {x: 6, y: 10}, {x: 6, y: 9},
  // 44-49
  {x: 5, y: 8}, {x: 4, y: 8}, {x: 3, y: 8}, {x: 2, y: 8}, {x: 1, y: 8}, {x: 0, y: 8},
  // 50-51
  {x: 0, y: 7}, {x: 0, y: 6}
];

export const HOME_PATHS = {
  red:    [{x: 1, y: 7}, {x: 2, y: 7}, {x: 3, y: 7}, {x: 4, y: 7}, {x: 5, y: 7}],
  green:  [{x: 7, y: 1}, {x: 7, y: 2}, {x: 7, y: 3}, {x: 7, y: 4}, {x: 7, y: 5}],
  yellow: [{x: 13, y: 7}, {x: 12, y: 7}, {x: 11, y: 7}, {x: 10, y: 7}, {x: 9, y: 7}],
  blue:   [{x: 7, y: 13}, {x: 7, y: 12}, {x: 7, y: 11}, {x: 7, y: 10}, {x: 7, y: 9}]
};

// Four coin slots per yard — circles at local SVG (2,2),(4,2),(2,4),(4,4) in each 6×6 yard.
// Fractional grid values centre each pin over its yard circle.
export const YARD_POSITIONS = {
  red:    [{x: 1.5, y: 1.5}, {x: 3.5, y: 1.5}, {x: 1.5, y: 3.5}, {x: 3.5, y: 3.5}],
  green:  [{x: 10.5, y: 1.5}, {x: 12.5, y: 1.5}, {x: 10.5, y: 3.5}, {x: 12.5, y: 3.5}],
  yellow: [{x: 10.5, y: 10.5}, {x: 12.5, y: 10.5}, {x: 10.5, y: 12.5}, {x: 12.5, y: 12.5}],
  blue:   [{x: 1.5, y: 10.5}, {x: 3.5, y: 10.5}, {x: 1.5, y: 12.5}, {x: 3.5, y: 12.5}],
};

export const CENTER_POSITION = {x: 7, y: 7};

// Where a FINISHED token (progress 57) visually rests — inside that color's
// own triangular wedge of the center hub, not the single shared center
// point (which made every color's finished tokens pile up on top of each
// other at exactly the same pixel). Matches the center triangles' actual
// centroids: red=(6,6)-(6,9)-(7.5,7.5), green=(6,6)-(9,6)-(7.5,7.5),
// yellow=(9,6)-(9,9)-(7.5,7.5), blue=(6,9)-(9,9)-(7.5,7.5).
// NOTE ON COORDINATES: everywhere else on the board (track cells, yard
// slots), a token's stored (x,y) is its cell's rendering anchor, and the
// renderer centers the pin half a grid-unit past that anchor (e.g. yard
// slots are stored as 1.5 so the pin lands visually on the true center at
// 2.0 — see YARD_POSITIONS above). The values below were originally the
// *true* visual target points (triangle apex/base at their real grid
// coordinates) without that same -0.5 correction applied, so every home
// token rendered half a cell too far right and down — enough to spill into
// the neighboring color's wedge. Corrected by shifting the whole geometry
// -0.5/-0.5; the relative layout/pattern (HOME_SLOT_LAYOUTS) is untouched.
export const HOME_REST_POSITION: Record<PlayerColor, {x: number; y: number}> = {
  red:    {x: 6.0, y: 7.0},
  green:  {x: 7.0, y: 6.0},
  yellow: {x: 8.0, y: 7.0},
  blue:   {x: 7.0, y: 8.0},
};

// Apex (shared center point) and each color's base-edge midpoint/direction,
// used to lay 1-4 finished tokens out inside their own wedge without ever
// overlapping — a single token centered, two or three in a row, and four as
// a small triangle (1 near the tip, 3 near the wide base), always safely
// inset from every edge.
const HOME_APEX = {x: 7.0, y: 7.0};
const HOME_WEDGE_GEOMETRY: Record<PlayerColor, { base: {x: number; y: number}; spread: {x: number; y: number} }> = {
  red:    { base: {x: 5.5, y: 7.0}, spread: {x: 0, y: 1} },
  green:  { base: {x: 7.0, y: 5.5}, spread: {x: 1, y: 0} },
  yellow: { base: {x: 8.5, y: 7.0}, spread: {x: 0, y: 1} },
  blue:   { base: {x: 7.0, y: 8.5}, spread: {x: 1, y: 0} },
};

// Slot layouts, in (depth, spread) pairs — depth: 0 = at the base (outer,
// wide edge), 1 = at the apex (the shared center point). spread: offset
// along the base's direction, in grid units.
//   1 → the triangle's exact centroid (depth = 1/3, the true geometric center)
//   2 → one row, centered, two coins side by side
//   3 → two rows: 1 coin near the apex, 2 coins side by side near the base
//   4 → two rows: 1 coin near the apex, 3 coins side by side near the base
const HOME_SLOT_LAYOUTS: Record<number, { depth: number; spread: number }[]> = {
  1: [{ depth: 1 / 3, spread: 0 }],
  2: [{ depth: 1 / 3, spread: -0.5 }, { depth: 1 / 3, spread: 0.5 }],
  3: [
    { depth: 0.62, spread: 0 },                                          // row 1 (near apex): 1 coin
    { depth: 0.15, spread: -0.55 }, { depth: 0.15, spread: 0.55 },       // row 2 (near base): 2 coins
  ],
  4: [
    { depth: 0.6, spread: 0 },                                             // row 1 (near apex): 1 token
    { depth: 0.15, spread: -0.75 }, { depth: 0.15, spread: 0 }, { depth: 0.15, spread: 0.75 }, // row 2 (near base): 3 tokens
  ],
};

/** Where the `slotIndex`-th (of `count`, 1-4) finished token of `color` rests — uniformly spread, never overlapping, always inside that color's own wedge. */
export function homeSlotCoord(color: PlayerColor, count: number, slotIndex: number): {x: number; y: number} {
  const layout = HOME_SLOT_LAYOUTS[Math.max(1, Math.min(4, count))];
  const slot = layout[Math.max(0, Math.min(layout.length - 1, slotIndex))];
  const { base, spread } = HOME_WEDGE_GEOMETRY[color];
  return {
    x: base.x + (HOME_APEX.x - base.x) * slot.depth + spread.x * slot.spread,
    y: base.y + (HOME_APEX.y - base.y) * slot.depth + spread.y * slot.spread,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Shared rules engine
//
// Operates on the "progress" model used throughout the client:
//   0        = in the yard
//   1-51     = steps taken on the shared 52-cell outer track
//   52-56    = steps taken inside this color's private home column
//   57       = home (finished)
//
// This module is the single source of truth for legality (safe squares,
// blocks, capture, team-mode) so GameContext (state mutation) and the bot
// AI (move scoring) never disagree about what's legal.
// ─────────────────────────────────────────────────────────────────────────

export type BotDifficulty = 'easy' | 'medium' | 'hard';

export interface BotToken {
  progress: number;
}

export interface BotPlayer {
  id: string;
  color: PlayerColor;
  tokens: BotToken[];
}

/** Track index (0-51) for a token at `progress`, or null if not on the main track. */
export function trackPosFor(color: PlayerColor, progress: number): number | null {
  if (progress < 1 || progress > 51) return null;
  return (START_POSITIONS[color] + progress - 1) % 52;
}

/** True if `a` and `b` are the same player, or teammates under Team Up mode. */
export function isSameSide(
  players: BotPlayer[],
  aPlayerId: string,
  bPlayerId: string,
  teamMode: boolean,
): boolean {
  if (aPlayerId === bPlayerId) return true;
  if (!teamMode) return false;
  const a = players.find((p) => p.id === aPlayerId);
  const b = players.find((p) => p.id === bPlayerId);
  if (!a || !b) return false;
  return TEAM_KEY[a.color] === TEAM_KEY[b.color];
}

/**
 * True if a HOSTILE block (2+ tokens belonging to one opposing side) sits on
 * `trackPos`. A single opponent token can neither land on, capture, nor pass
 * through a block — it acts as a wall. EXCEPT on a safe/star square: those
 * already prevent capture outright regardless of how many tokens share them,
 * so a pair parked there doesn't wall it off — other colors can still land
 * on or pass through it freely.
 */
export function hostileBlockAt(
  players: BotPlayer[],
  moverPlayerId: string,
  trackPos: number,
  teamMode: boolean,
): boolean {
  if (SAFE_SQUARES.includes(trackPos)) return false;
  const groups = new Map<string, number>();
  for (const p of players) {
    if (isSameSide(players, moverPlayerId, p.id, teamMode)) continue;
    p.tokens.forEach((t) => {
      if (trackPosFor(p.color, t.progress) === trackPos) {
        const key = teamMode ? TEAM_KEY[p.color] : p.id;
        groups.set(key, (groups.get(key) ?? 0) + 1);
      }
    });
  }
  for (const count of groups.values()) if (count >= 2) return true;
  return false;
}

/** All track squares a token would cross (in order, landing square last) moving `steps` from `fromProgress`. */
export function squaresForMove(color: PlayerColor, fromProgress: number, steps: number): number[] {
  if (fromProgress === 0) {
    const start = trackPosFor(color, 1);
    return start === null ? [] : [start];
  }
  const upper = Math.min(fromProgress + steps, 51);
  const squares: number[] = [];
  for (let p = fromProgress + 1; p <= upper; p++) {
    const pos = trackPosFor(color, p);
    if (pos !== null) squares.push(pos);
  }
  return squares;
}

/**
 * Legal, dice-aware movable token indices for `currentPlayerId`, honoring
 * safe squares, blocks (cannot land on / pass through a hostile block), the
 * exact-count-to-enter-home rule, and Team Up capture immunity.
 */
export function computeLegalMoves(
  players: BotPlayer[],
  currentPlayerId: string,
  diceValue: number,
  teamMode = false,
): number[] {
  const player = players.find((p) => p.id === currentPlayerId);
  if (!player) return [];

  const movable: number[] = [];
  player.tokens.forEach((token, ti) => {
    if (token.progress === 57) return; // already home

    if (token.progress === 0) {
      if (diceValue !== 6) return;
      const squares = squaresForMove(player.color, 0, diceValue);
      if (squares.some((sq) => hostileBlockAt(players, currentPlayerId, sq, teamMode))) return;
      movable.push(ti);
      return;
    }

    const newProgress = token.progress + diceValue;
    if (newProgress > 57) return; // overshoot — exact count required to finish

    if (token.progress <= 51) {
      const squares = squaresForMove(player.color, token.progress, diceValue);
      if (squares.some((sq) => hostileBlockAt(players, currentPlayerId, sq, teamMode))) return;
    }
    // Home column (52-56): private lane, no blocking possible.
    movable.push(ti);
  });

  return movable;
}

export interface CaptureInfo {
  playerId: string;
  tokenIndex: number;
  progressBefore: number;
}

export interface MoveSimResult {
  players: BotPlayer[];
  newProgress: number;
  captured: CaptureInfo[];
  reachedHome: boolean;
  enteredHomeColumn: boolean;
  wonMatch: boolean; // this player (+ teammate, if team mode) finished all tokens
}

/** Apply a (legal) move and report what happened, without mutating the input. */
export function simulateMove(
  players: BotPlayer[],
  currentPlayerId: string,
  tokenIndex: number,
  diceValue: number,
  teamMode = false,
): MoveSimResult {
  const cloned: BotPlayer[] = players.map((p) => ({
    ...p,
    tokens: p.tokens.map((t) => ({ ...t })),
  }));
  const player = cloned.find((p) => p.id === currentPlayerId)!;
  const token = player.tokens[tokenIndex];

  const newProgress = token.progress === 0 ? 1 : token.progress + diceValue;
  token.progress = newProgress;

  const captured: CaptureInfo[] = [];
  const reachedHome = newProgress === 57;
  const enteredHomeColumn = newProgress >= 52 && newProgress <= 56;

  if (newProgress >= 1 && newProgress <= 51) {
    const trackPos = trackPosFor(player.color, newProgress)!;
    if (!SAFE_SQUARES.includes(trackPos)) {
      for (const p of cloned) {
        if (isSameSide(cloned, currentPlayerId, p.id, teamMode)) continue;
        p.tokens.forEach((t, ti) => {
          if (trackPosFor(p.color, t.progress) === trackPos) {
            captured.push({ playerId: p.id, tokenIndex: ti, progressBefore: t.progress });
            t.progress = 0;
          }
        });
      }
    }
  }

  const teammateColor = teamMode ? TEAMMATE_COLOR[player.color] : null;
  const teammate = teammateColor ? cloned.find((p) => p.color === teammateColor) : undefined;
  const selfDone = player.tokens.every((t) => t.progress === 57);
  const wonMatch = teamMode
    ? selfDone && (!teammate || teammate.tokens.every((t) => t.progress === 57))
    : selfDone;

  return { players: cloned, newProgress, captured, reachedHome, enteredHomeColumn, wonMatch };
}

/** True if the token is currently sitting on a square where it cannot be captured. */
export function isTokenSafe(
  players: BotPlayer[],
  playerId: string,
  tokenIndex: number,
  teamMode: boolean,
): boolean {
  const player = players.find((p) => p.id === playerId)!;
  const token = player.tokens[tokenIndex];
  const trackPos = trackPosFor(player.color, token.progress);
  if (trackPos === null) return true; // yard / home column / home
  if (SAFE_SQUARES.includes(trackPos)) return true;

  // Protected if part of an own-side block on this square.
  let sideCount = 0;
  for (const p of players) {
    if (!isSameSide(players, playerId, p.id, teamMode)) continue;
    p.tokens.forEach((t) => { if (trackPosFor(p.color, t.progress) === trackPos) sideCount++; });
  }
  if (sideCount >= 2) return true;

  return !isTrackPosThreatened(players, playerId, trackPos, teamMode);
}

/** Could a single hostile token reach `trackPos` with one dice roll (1-6) next turn? */
export function isTrackPosThreatened(
  players: BotPlayer[],
  playerId: string,
  trackPos: number,
  teamMode: boolean,
): number | false {
  if (SAFE_SQUARES.includes(trackPos)) return false;
  let closest: number | false = false;
  for (const p of players) {
    if (isSameSide(players, playerId, p.id, teamMode)) continue;
    for (const t of p.tokens) {
      const pos = trackPosFor(p.color, t.progress);
      if (pos === null) continue;
      for (let d = 1; d <= 6; d++) {
        if ((pos + d) % 52 === trackPos) {
          if (closest === false || d < closest) closest = d;
        }
      }
    }
  }
  return closest;
}

// ─────────────────────────────────────────────────────────────────────────
// Offline / bot AI
//
// Scores every legal move a bot can make this turn using the priority
// ladder below (highest first) and returns the strongest one, so bots play
// with real strategy instead of picking a random movable token:
//
//   1. Capture an opponent                    +1000
//   2. Save a token that was about to be taken +900
//   3. Reach Home                              +850
//   4. Enter the home column                   +800
//   5. Escape the base (roll of 6)             +700
//   6. Avoid being captured                    -(100 - distance)
//   7. Create / keep a block                   +600
//   8. Break enemy strategy (junctions, choke points) +500
//   9. Advance the most-progressed token       +400
//  10. Spread tokens out when clustered        +300
//  11. Move the furthest-behind token          +200
//  12. Random tiebreak                         ~0
//
// "hard" plays this ladder near-optimally (95-99%); "medium"/"easy" mix in
// an increasing chance of a deliberately weaker move so the bot stays fun
// and beatable.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Pick the best token (by index) for the bot to move, given the current
 * dice value and the list of legally-movable token indices.
 */
export function chooseBotMove(
  players: BotPlayer[],
  currentPlayerId: string,
  diceValue: number,
  movableIndices: number[],
  difficulty: BotDifficulty = 'hard',
  teamMode = false,
): number {
  if (movableIndices.length === 0) return -1;
  if (movableIndices.length === 1) return movableIndices[0];

  const player = players.find((p) => p.id === currentPlayerId);
  if (!player) return movableIndices[0];

  const opponentStartSquares = COLORS
    .filter((c) => !isSameSide(players, currentPlayerId, players.find((p) => p.color === c)?.id ?? '', teamMode))
    .map((c) => START_POSITIONS[c]);
  const opponentHomeEntrySquares = COLORS
    .filter((c) => !isSameSide(players, currentPlayerId, players.find((p) => p.color === c)?.id ?? '', teamMode))
    .map((c) => HOME_ENTRY_SQUARES[c]);

  const onTrackProgresses = player.tokens.map((t) => t.progress).filter((p) => p >= 1 && p <= 51);
  const clustered = onTrackProgresses.length >= 2 &&
    Math.max(...onTrackProgresses) - Math.min(...onTrackProgresses) <= 6;
  const movableProgresses = movableIndices.map((ti) => player.tokens[ti].progress);
  const maxMovableProgress = Math.max(...movableProgresses.filter((p) => p > 0), -1);
  const minMovableProgress = Math.min(...movableProgresses.filter((p) => p > 0), Infinity);
  const onBoardCount = player.tokens.filter((t) => t.progress > 0 && t.progress < 57).length;

  const scores = movableIndices.map((ti) => {
    const token = player.tokens[ti];
    const wasThreatened = token.progress >= 1 && token.progress <= 51 &&
      !isTokenSafe(players, currentPlayerId, ti, teamMode);

    const sim = simulateMove(players, currentPlayerId, ti, diceValue, teamMode);
    let score = 0;

    // Priority 1 — capture
    if (sim.captured.length > 0) {
      score += 1000;
      for (const c of sim.captured) {
        score += c.progressBefore >= 52 ? 60 : Math.min(30, c.progressBefore * 0.8);
      }
    }

    // Priority 3/4 — reach home / enter home column
    if (sim.reachedHome) score += 850;
    else if (sim.enteredHomeColumn) score += 800 + (sim.newProgress - 52) * 5;

    // Priority 5 — escape base on a 6
    if (token.progress === 0) score += 700 - onBoardCount * 15;

    // Safety of the resulting position (drives priorities 2 and 6)
    const safeAfter = sim.newProgress < 1 || sim.newProgress > 51 ||
      isTokenSafe(sim.players, currentPlayerId, ti, teamMode);

    if (wasThreatened && safeAfter) {
      score += 900; // Priority 2 — saved a token that was in danger
    } else if (!safeAfter) {
      const threatDist = isTrackPosThreatened(sim.players, currentPlayerId, trackPosFor(player.color, sim.newProgress)!, teamMode);
      const distance = threatDist === false ? 6 : threatDist;
      score -= 100 - distance; // Priority 6 — avoid being captured
    }

    // Priority 7 — forms/keeps a block with an own-side token
    if (sim.newProgress >= 1 && sim.newProgress <= 51) {
      const landTrackPos = trackPosFor(player.color, sim.newProgress)!;
      const simPlayer = sim.players.find((p) => p.id === currentPlayerId)!;
      const blockPartner = sim.players.some((p) => {
        if (!isSameSide(sim.players, currentPlayerId, p.id, teamMode)) return false;
        return p.tokens.some((t, idx) => {
          if (p.id === currentPlayerId && idx === ti) return false;
          return trackPosFor(p.color, t.progress) === landTrackPos;
        });
      });
      if (blockPartner) score += 600;

      // Priority 8 — break enemy strategy: sit on an opponent's launch pad
      // or right before their home-column entrance (a choke point), or on
      // any other strategic safe square.
      if (opponentStartSquares.includes(landTrackPos) || opponentHomeEntrySquares.includes(landTrackPos)) score += 500;
      else if (SAFE_SQUARES.includes(landTrackPos)) score += 120;
    }

    // Priority 9 — advance the token that's already furthest along
    if (token.progress > 0 && token.progress === maxMovableProgress) score += 400;

    // Priority 10 — spread out when clustered (favor progressing at all)
    if (clustered) score += 300;

    // Priority 11 — catch up the furthest-behind token
    if (token.progress > 0 && token.progress === minMovableProgress) score += 200;

    // General forward-progress tiebreak so "better" board position still
    // matters when the categorical bonuses above are tied.
    score += token.progress * 0.2;

    // Priority 12 — tiny random tiebreak
    score += Math.random() * 0.5;

    return score;
  });

  // Easy: mostly sound, but sometimes deliberately picks a weaker move so
  // the bot stays beatable for casual/new players.
  if (difficulty === 'easy' && Math.random() < 0.35) {
    const sorted = [...movableIndices].sort(
      (a, b) => scores[movableIndices.indexOf(a)] - scores[movableIndices.indexOf(b)],
    );
    const weakerHalf = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 2)));
    return weakerHalf[Math.floor(Math.random() * weakerHalf.length)];
  }

  // Medium: strong play with an occasional (~10%) imperfect move.
  if (difficulty === 'medium' && Math.random() < 0.10 && movableIndices.length > 1) {
    const sorted = [...movableIndices].sort(
      (a, b) => scores[movableIndices.indexOf(b)] - scores[movableIndices.indexOf(a)],
    );
    return sorted[1];
  }

  // Hard: near-optimal (95-99%), tiny chance of a human-like slip.
  if (difficulty === 'hard' && Math.random() < 0.03 && movableIndices.length > 1) {
    const sorted = [...movableIndices].sort(
      (a, b) => scores[movableIndices.indexOf(b)] - scores[movableIndices.indexOf(a)],
    );
    return sorted[1];
  }

  const bestIdx = scores.indexOf(Math.max(...scores));
  return movableIndices[bestIdx];
}

// ─────────────────────────────────────────────────────────────────────────
// Catch-up dice weighting
//
// A small anti-frustration mechanic: if a player has gone many turns
// without rolling the number they actually need — a 6 to finally leave the
// yard, or a value that would let them capture an opponent — the odds of
// that number showing up creep up the longer the drought goes on. It's
// still random every single roll, just no longer punishingly so over a long
// stretch of bad luck. Resets to plain 1-in-6 the moment a useful number
// does land.
// ─────────────────────────────────────────────────────────────────────────

/** Which dice values (1-6) would meaningfully help `playerId` right now: escaping the yard, or landing a capture. */
export function usefulDiceValues(
  players: BotPlayer[],
  playerId: string,
  teamMode: boolean,
): Set<number> {
  const player = players.find((p) => p.id === playerId);
  if (!player) return new Set();
  const allInYard = player.tokens.every((t) => t.progress === 0);

  const useful = new Set<number>();
  for (let v = 1; v <= 6; v++) {
    if (allInYard) {
      if (v === 6) useful.add(v);
      continue;
    }
    const legal = computeLegalMoves(players, playerId, v, teamMode);
    for (const ti of legal) {
      const sim = simulateMove(players, playerId, ti, v, teamMode);
      if (sim.captured.length > 0) { useful.add(v); break; }
    }
  }
  return useful;
}

/** A dice roll biased toward `usefulValues` in proportion to `pity` (a drought counter) — plain uniform 1-6 when there's nothing useful to bias toward. */
export function weightedDiceRoll(usefulValues: Set<number>, pity: number): number {
  if (usefulValues.size === 0) return Math.floor(Math.random() * 6) + 1;
  const boost = Math.min(pity * 0.35, 2.2); // extra weight per useful value, capped
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

/** Compute the absolute grid (x,y) for a token at `progress` for `color`. */
export function progressToCoord(
  color: PlayerColor,
  progress: number
): { x: number; y: number } {
  if (progress === 0) {
    // caller should use token index for yard — return a fallback
    return YARD_POSITIONS[color][0];
  }
  if (progress >= 1 && progress <= 51) {
    const trackIdx = (START_POSITIONS[color] + progress - 1) % 52;
    return TRACK_PATH[trackIdx];
  }
  if (progress >= 52 && progress <= 56) {
    return HOME_PATHS[color][progress - 52];
  }
  return HOME_REST_POSITION[color]; // progress === 57
}
