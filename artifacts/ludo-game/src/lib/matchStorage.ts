// Guest-mode persistence. Guests never get a MongoDB Player row, so their
// stats, match history, and resumable match all live entirely in
// localStorage — this is what Profile.tsx reads for a guest, and what
// GameContext uses to offer "Resume Match" for guests.

const STATS_KEY = 'ludo_guest_stats';
const MATCH_KEY = 'ludo_guest_match';

export interface GuestGameSummary {
  id: string;
  roomCode: string | null;
  playerCount: number;
  result: 'win' | 'loss';
  playedAt: string;
}

export interface GuestStats {
  gamesPlayed: number;
  gamesWon: number;
  totalTokensHome: number;
  totalTokensCut: number;
  longestWinStreak: number;
  currentWinStreak: number;
  recentGames: GuestGameSummary[];
}

const EMPTY_STATS: GuestStats = {
  gamesPlayed: 0,
  gamesWon: 0,
  totalTokensHome: 0,
  totalTokensCut: 0,
  longestWinStreak: 0,
  currentWinStreak: 0,
  recentGames: [],
};

export function getGuestStats(): GuestStats {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return { ...EMPTY_STATS };
    const parsed = JSON.parse(raw);
    return { ...EMPTY_STATS, ...parsed };
  } catch {
    return { ...EMPTY_STATS };
  }
}

/** Records the outcome of a finished match (offline or online) for the guest. */
export function recordGuestGameResult(input: {
  won: boolean;
  tokensHome: number;
  roomCode?: string | null;
  playerCount: number;
}): GuestStats {
  const stats = getGuestStats();
  const newStreak = input.won ? stats.currentWinStreak + 1 : 0;

  const summary: GuestGameSummary = {
    id: crypto.randomUUID(),
    roomCode: input.roomCode ?? null,
    playerCount: input.playerCount,
    result: input.won ? 'win' : 'loss',
    playedAt: new Date().toISOString(),
  };

  const next: GuestStats = {
    gamesPlayed: stats.gamesPlayed + 1,
    gamesWon: stats.gamesWon + (input.won ? 1 : 0),
    totalTokensHome: stats.totalTokensHome + input.tokensHome,
    totalTokensCut: stats.totalTokensCut,
    longestWinStreak: Math.max(stats.longestWinStreak, newStreak),
    currentWinStreak: newStreak,
    recentGames: [summary, ...stats.recentGames].slice(0, 5),
  };

  localStorage.setItem(STATS_KEY, JSON.stringify(next));
  return next;
}

// ── Unfinished match ─────────────────────────────────────────────────────────
export interface SavedMatchSnapshot {
  mode: 'offline' | 'online';
  savedAt: number;
  // offline
  players?: unknown;
  currentTurnId?: string | null;
  teamMode?: boolean;
  // online
  roomCode?: string;
}

export function getGuestMatch(): SavedMatchSnapshot | null {
  try {
    const raw = localStorage.getItem(MATCH_KEY);
    return raw ? (JSON.parse(raw) as SavedMatchSnapshot) : null;
  } catch {
    return null;
  }
}

export function saveGuestMatch(snapshot: SavedMatchSnapshot): void {
  try {
    localStorage.setItem(MATCH_KEY, JSON.stringify(snapshot));
  } catch {
    // localStorage full/unavailable — resuming just won't be offered, not fatal.
  }
}

export function clearGuestMatch(): void {
  localStorage.removeItem(MATCH_KEY);
}
