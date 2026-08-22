import React, { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  PlayerColor, TEAM_KEY,
  computeLegalMoves, simulateMove, chooseBotMove, type BotDifficulty,
  usefulDiceValues, weightedDiceRoll,
} from '../utils/ludo';
import * as roomApi from '@/lib/roomApi';
import { sound } from '../lib/sound';
import { usePlayer } from './PlayerContext';
import { useAuth } from './AuthContext';
import { saveGuestMatch, getGuestMatch, clearGuestMatch, recordGuestGameResult, type SavedMatchSnapshot } from '@/lib/matchStorage';
import { saveUnfinishedMatch, clearUnfinishedMatch, recordOfflineResult } from '@/lib/authApi';

export interface TokenState {
  progress: number;
}

export interface GamePlayerState {
  id: string;
  name: string;
  color: PlayerColor;
  isBot: boolean;
  isConnected: boolean;
  tokens: TokenState[];
  botDifficulty?: BotDifficulty;
}

/** Fired when a token gets sent home so Board.tsx can animate the walk-back. */
export interface RankingEntry {
  playerId: string;
  rank: number;
}

export interface CutEvent {
  victimId: string;
  tokenIndex: number;
  fromProgress: number;    // victim's progress before the cut
  predatorSteps: number;   // steps the predator moved (for arrival timing)
}

export interface LobbySeat {
  id: string;
  name: string;
  avatarColor?: string;
  avatarEmoji?: string;
  color: PlayerColor;
  isBot: boolean;
  botDifficulty?: BotDifficulty;
  isHost: boolean;
  isConnected: boolean;
}

export interface GameContextType {
  mode: 'offline' | 'online' | null;
  roomCode: string | null;
  status: 'waiting' | 'playing' | 'finished';
  players: GamePlayerState[];
  currentTurnId: string | null;
  /** Whose tokens are actually movable this turn — normally == currentTurnId,
   *  but under Team Up mode a finished player pilots their teammate's tokens. */
  controlledPlayerId: string | null;
  teamMode: boolean;
  /** True for ~1.5s right as a match begins — drives the "Game Start!" banner. */
  showGameStart: boolean;
  diceValue: number | null;
  diceRolling: boolean;
  turnTimeRemaining: number;
  winnerId: string | null;
  /** Full final standings (1st..Nth) once the match ends — 1st is always `winnerId`. */
  rankings: RankingEntry[];
  lastCutEvents: CutEvent[];
  setOfflineGame: (players: GamePlayerState[], teamMode?: boolean) => void;
  rollDice: () => void;
  moveToken: (tokenIndex: number) => void;
  leaveGame: () => void;
  connectToRoom: (roomCode: string, player: any) => void;
  // ── Room lobby (pre-game, online) ──────────────────────────────────────
  lobbyPlayers: LobbySeat[];
  myPlayerIds: string[];
  roomError: string | null;
  /** Add another local seat from this same device (pass-and-play alongside online friends). */
  addLocalPlayer: (name: string, avatarEmoji?: string, avatarColor?: string) => void;
  /** Remove one of this device's own seats from the lobby (not other devices' seats). */
  removeLocalPlayer: (playerId: string) => void;
  /** Host-only: fill an empty seat with a bot (room must allow bots). */
  addBotToRoom: (difficulty?: BotDifficulty) => void;
  /** Host-only: start the match using the current lobby seats. Team Up requires exactly 4 seats. */
  startOnlineGame: (teamMode?: boolean) => void;
  /** Change one of MY OWN seats' color/corner before the game starts (2-player rooms are locked to opposite corners). */
  selectColor: (playerId: string, color: PlayerColor) => void;
  renameSeat: (playerId: string, name: string) => void;
  /** True if the local player is the host of the current online room. */
  isHost: boolean;
  /** Host-only: end the match immediately for everyone and tear the room down. */
  cancelMatch: () => void;
  /** Set (once) when the match was torn down by the host or by everyone leaving. */
  matchCancelled: { reason: 'abandoned' | 'host_cancelled' } | null;
  clearMatchCancelled: () => void;
  // ── Resume unfinished match (guest: localStorage, signed-in: MongoDB) ──────
  /** Non-null when a previous session left an in-progress match that can be resumed. */
  resumableMatch: { mode: 'offline' | 'online'; savedAt: number; roomCode?: string } | null;
  /** Rehydrates an offline match from the saved snapshot. Returns false if there's nothing to resume. */
  resumeOfflineMatch: () => boolean;
  /** Hides the resume prompt without deleting the saved match (it can still be resumed later). */
  dismissResumableMatch: () => void;
}

const GameContext = createContext<GameContextType | null>(null);

// Clockwise seat order — used to sort players so turns always go clockwise.
const CLOCKWISE_ORDER: PlayerColor[] = ['red', 'green', 'yellow', 'blue'];

// ms per animation step — must stay in sync with Board.tsx STEP_DELAY_MS
const STEP_ANIM_MS = 220;

// Final standings once a match ends. Solo: winner is 1st, everyone else
// ranked by how many tokens they got home. Team Up: both winning teammates
// share 1st ("Champions"), the losing side is ranked 3rd/4th between
// themselves — matches the server's equivalent computation in moveToken().
function computeOfflineRankings(players: GamePlayerState[], winnerId: string, teamMode: boolean): RankingEntry[] {
  const tokensHome = (p: GamePlayerState) => p.tokens.filter(t => t.progress === 57).length;
  const winner = players.find(p => p.id === winnerId);
  if (!winner) return [];

  if (teamMode) {
    const mate = players.find(p => p.id !== winnerId && TEAM_KEY[p.color] === TEAM_KEY[winner.color]);
    const winSide = [winner, ...(mate ? [mate] : [])];
    const otherSide = players
      .filter(p => !winSide.some(w => w.id === p.id))
      .sort((a, b) => tokensHome(b) - tokensHome(a));
    return [
      ...winSide.map(p => ({ playerId: p.id, rank: 1 })),
      ...otherSide.map((p, i) => ({ playerId: p.id, rank: 3 + i })),
    ];
  }

  const rest = players.filter(p => p.id !== winnerId).sort((a, b) => tokensHome(b) - tokensHome(a));
  return [{ playerId: winnerId, rank: 1 }, ...rest.map((p, i) => ({ playerId: p.id, rank: i + 2 }))];
}

export function GameProvider({ children }: { children: React.ReactNode }) {
  const { player: localPlayer, isGuest } = usePlayer();
  const { user, isLoading: authLoading } = useAuth();
  const [mode, setMode] = useState<'offline' | 'online' | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [status, setStatus] = useState<'waiting' | 'playing' | 'finished'>('waiting');
  const [players, setPlayers] = useState<GamePlayerState[]>([]);
  const [currentTurnId, setCurrentTurnId] = useState<string | null>(null);
  const [teamMode, setTeamMode] = useState(false);
  const [diceValue, setDiceValue] = useState<number | null>(null);
  const [diceRolling, setDiceRolling] = useState(false);
  const [turnTimeRemaining, setTurnTimeRemaining] = useState(30);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [rankings, setRankings] = useState<RankingEntry[]>([]);
  const [lastCutEvents, setLastCutEvents] = useState<CutEvent[]>([]);
  const [lobbyPlayers, setLobbyPlayers] = useState<LobbySeat[]>([]);
  const [myPlayerIds, setMyPlayerIds] = useState<string[]>([]);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [matchCancelled, setMatchCancelled] = useState<{ reason: 'abandoned' | 'host_cancelled' } | null>(null);
  const [showGameStart, setShowGameStart] = useState(false);
  const [resumableMatch, setResumableMatch] = useState<{ mode: 'offline' | 'online'; savedAt: number; roomCode?: string } | null>(null);
  const savedSnapshotRef = useRef<SavedMatchSnapshot | null>(null);
  const resultRecordedRef = useRef(false);
  const persistDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Refs for always-fresh values inside stable callbacks ───────────────────
  const currentTurnIdRef = useRef<string | null>(null);
  const turnSlotIdRef    = useRef<string | null>(null); // nominal seat in rotation (never redirected)
  const diceValueRef     = useRef<number | null>(null);
  const diceRollingRef   = useRef(false);
  const modeRef          = useRef<'offline' | 'online' | null>(null);
  const roomCodeRef      = useRef<string | null>(null);
  const playersRef       = useRef<GamePlayerState[]>([]);
  const teamModeRef      = useRef(false);
  const myPlayerIdsRef   = useRef<string[]>([]);
  const pityRef = useRef<Record<string, number>>({}); // catch-up dice: consecutive "unlucky" rolls per player
  const consecutiveSixesRef = useRef(0); // sixes rolled in a row by the CURRENT roller
  const forfeitedRollRef = useRef(false); // true while showing a forfeited 3rd-six roll (no move allowed)
  const diceRollDisplayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null); // pending "dice_rolled" reveal (online)
  const pendingTurnChangeRef = useRef<{ currentTurn: string; turnTimerSeconds: number } | null>(null); // queued while a reveal is in flight
  // ── Polling (online mode — replaces the old Socket.IO push connection) ──────
  const pollInFlightRef = useRef(false); // guards against overlapping poll requests
  const lastEventSeqRef = useRef(0); // highest game-event seq already applied
  const pollGameSeenRef = useRef(false); // true once we've applied the game's first snapshot this session
  const pollNowRef = useRef<() => void>(() => {}); // lets an action's error handler trigger an immediate resync instead of waiting for the next scheduled tick

  const statusRef = useRef<'waiting' | 'playing' | 'finished'>('waiting');
  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { currentTurnIdRef.current = currentTurnId; }, [currentTurnId]);
  useEffect(() => { diceValueRef.current     = diceValue;     }, [diceValue]);
  useEffect(() => { diceRollingRef.current   = diceRolling;   }, [diceRolling]);
  useEffect(() => { modeRef.current          = mode;          }, [mode]);
  useEffect(() => { roomCodeRef.current      = roomCode;      }, [roomCode]);
  useEffect(() => { playersRef.current       = players;       }, [players]);
  useEffect(() => { teamModeRef.current      = teamMode;      }, [teamMode]);
  useEffect(() => { myPlayerIdsRef.current    = myPlayerIds;   }, [myPlayerIds]);

  // ─── Load any resumable match once we know whether we're signed in ──────────
  // Guests: read straight from localStorage. Signed-in: read the snapshot
  // MongoDB has for this account (also picks up matches saved from another
  // device/browser, since it's keyed by the Google account, not this tab).
  useEffect(() => {
    if (authLoading) return;
    if (modeRef.current) return; // already mid-match in this tab — nothing to prompt for
    let snapshot: SavedMatchSnapshot | null = null;
    if (user) {
      const raw = user.unfinishedMatchJson;
      if (raw) {
        try { snapshot = JSON.parse(raw); } catch { snapshot = null; }
      }
    } else {
      snapshot = getGuestMatch();
    }
    if (snapshot) {
      savedSnapshotRef.current = snapshot;
      setResumableMatch({ mode: snapshot.mode, savedAt: snapshot.savedAt, roomCode: snapshot.roomCode });
    }
  }, [user, authLoading]);

  // ─── Persist / clear the resumable match snapshot as the game progresses ────
  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);

  const persistSnapshot = useCallback((snapshot: SavedMatchSnapshot | null) => {
    if (snapshot) saveGuestMatch(snapshot); else clearGuestMatch();
    if (persistDebounceRef.current) clearTimeout(persistDebounceRef.current);
    if (!userRef.current) return;
    persistDebounceRef.current = setTimeout(() => {
      const json = snapshot ? JSON.stringify(snapshot) : null;
      if (json === null) {
        clearUnfinishedMatch().catch(() => {});
      } else {
        saveUnfinishedMatch(json).catch(() => {});
      }
    }, 600);
  }, []);

  // ─── Team Up: who actually controls the tokens this turn ────────────────────
  // A player who has finished all 4 tokens keeps rolling for their team, but
  // pilots their still-playing teammate's tokens instead of their own.
  const resolveControlledPlayerId = useCallback((turnId: string | null, ps: GamePlayerState[], tm: boolean): string | null => {
    if (!turnId) return turnId;
    if (!tm) return turnId;
    const p = ps.find(x => x.id === turnId);
    if (!p) return turnId;
    const finished = p.tokens.every(t => t.progress === 57);
    if (!finished) return turnId;
    const mate = ps.find(x => x.id !== turnId && TEAM_KEY[x.color] === TEAM_KEY[p.color]);
    if (mate && !mate.tokens.every(t => t.progress === 57)) return mate.id;
    return turnId;
  }, []);

  const controlledPlayerId = useMemo(
    () => resolveControlledPlayerId(currentTurnId, players, teamMode),
    [currentTurnId, players, teamMode, resolveControlledPlayerId],
  );
  const controlledPlayerIdRef = useRef<string | null>(null);
  useEffect(() => { controlledPlayerIdRef.current = controlledPlayerId; }, [controlledPlayerId]);

  // ─── Advance turn (stable) ───────────────────────────────────────────────────
  const advanceTurnOffline = useCallback((extraTurn = false) => {
    const ps = playersRef.current;
    const tm = teamModeRef.current;
    const slotId = turnSlotIdRef.current;
    const curIdx = ps.findIndex(x => x.id === slotId);
    if (curIdx === -1) return;

    let nextIdx = curIdx;
    if (!extraTurn) {
      consecutiveSixesRef.current = 0; // streak only persists across the SAME roller's extra turns
      nextIdx = (curIdx + 1) % ps.length;
      for (let i = 0; i < ps.length; i++) {
        const candidate = ps[nextIdx];
        const finished = candidate.tokens.every(t => t.progress === 57);
        const mate = tm ? ps.find(x => x.id !== candidate.id && TEAM_KEY[x.color] === TEAM_KEY[candidate.color]) : undefined;
        const teamStillPlaying = !!mate && !mate.tokens.every(t => t.progress === 57);
        if (!finished || teamStillPlaying) break; // this seat can still act
        nextIdx = (nextIdx + 1) % ps.length; // fully-finished side — skip
      }
    }

    const slot = ps[nextIdx];
    turnSlotIdRef.current = slot.id;
    const pilotId = resolveControlledPlayerId(slot.id, ps, tm) ?? slot.id;

    // currentTurnId stays the nominal *roller* (matches "they continue
    // rolling" from the spec) — token control is derived separately via
    // controlledPlayerId, computed by the same resolver above.
    setCurrentTurnId(slot.id);
    currentTurnIdRef.current = slot.id;
    controlledPlayerIdRef.current = pilotId;
    forfeitedRollRef.current = false;
    setDiceValue(null);
    diceValueRef.current = null;
    setTurnTimeRemaining(30);
  }, [resolveControlledPlayerId]);

  // ─── Move token (stable) ─────────────────────────────────────────────────────
  const moveTokenOffline = useCallback((tokenIndex: number) => {
    const dice = diceValueRef.current;
    const tid  = currentTurnIdRef.current;
    if (dice === null || diceRollingRef.current || tid === null || forfeitedRollRef.current) return;

    const prevPlayers = playersRef.current;
    const tm = teamModeRef.current;
    const controlledId = resolveControlledPlayerId(tid, prevPlayers, tm) ?? tid;

    const legal = computeLegalMoves(prevPlayers, controlledId, dice, tm);
    if (!legal.includes(tokenIndex)) return;

    const pIdx = prevPlayers.findIndex(p => p.id === controlledId);
    if (pIdx === -1) return;
    const fromProgress = prevPlayers[pIdx].tokens[tokenIndex].progress;

    const sim = simulateMove(prevPlayers, controlledId, tokenIndex, dice, tm);
    const updated: GamePlayerState[] = prevPlayers.map((p, i) => ({
      ...p,
      tokens: sim.players[i].tokens.map(t => ({ progress: t.progress })),
    }));

    const newCutEvents: CutEvent[] = sim.captured.map(c => ({
      victimId:      c.playerId,
      tokenIndex:    c.tokenIndex,
      fromProgress:  c.progressBefore,
      predatorSteps: sim.newProgress - fromProgress,
    }));
    const cutOccurred = newCutEvents.length > 0;

    // Win check — solo: this player's 4 tokens home. Team Up: both partners' 8.
    if (sim.wonMatch) {
      if (cutOccurred) setLastCutEvents(newCutEvents);
      setPlayers(updated);
      setTimeout(() => {
        setWinnerId(tid); // credit the rolling seat, matching "team wins" flavor
        setRankings(computeOfflineRankings(updated, tid, tm));
        setStatus('finished');
        sound.playWin();
      }, 0);
      return;
    }

    const predatorSteps = Math.abs(sim.newProgress - fromProgress);
    const animDelay = cutOccurred
      ? predatorSteps * STEP_ANIM_MS + 2400
      : Math.min(predatorSteps * STEP_ANIM_MS + 300, 1500);

    // Reaching Home also grants an extra turn per the full rule set.
    const extra = dice === 6 || cutOccurred || sim.reachedHome;

    // React 18 auto-batches these two setters → Board sees both in one render.
    if (newCutEvents.length > 0) setLastCutEvents(newCutEvents);
    setPlayers(updated);

    setTimeout(() => advanceTurnOffline(extra), animDelay);

    // Clear cut events well after the animation is done
    if (newCutEvents.length > 0) {
      setTimeout(() => setLastCutEvents([]), animDelay + 1500);
    }
  }, [advanceTurnOffline, resolveControlledPlayerId]);

  // ─── "Game Start!" moment — stop the menu BGM, play a short fanfare, and
  // show the banner for ~1.5s. All other SFX (dice, moves, captures, clicks)
  // are untouched — only the looping background theme pauses. Moved up here
  // (from its old spot further down) since applySnapshot, below, needs it. ──
  const announceGameStart = useCallback(() => {
    sound.setGameplayActive(true); // suppressed until leaveGame() — stays off for the whole match
    sound.playGameStart();
    setShowGameStart(true);
    setTimeout(() => setShowGameStart(false), 2600);
  }, []);

  // ─── Online mode: apply a full game snapshot (fresh start, or reconnect) ────
  // Mirrors what the old `game_started`/`game_state` socket handlers did —
  // now fed by either connectToRoom's initial join, startOnlineGame's
  // response, or the poll loop noticing the game just appeared.
  const applySnapshot = useCallback((game: any, opts: { announce: boolean }) => {
    setStatus(game.status === 'finished' ? 'finished' : 'playing');
    setTeamMode(!!game.teamMode);
    setCurrentTurnId(game.currentTurn);
    currentTurnIdRef.current = game.currentTurn;
    turnSlotIdRef.current = game.currentTurn;
    const tokensByPlayer: Record<string, number[]> = JSON.parse(game.tokensJson || '{}');
    setPlayers(game.players.map((p: any) => ({
      id: p.playerId,
      name: p.name,
      color: p.color,
      isBot: p.isBot,
      isConnected: p.isConnected,
      botDifficulty: p.botDifficulty,
      tokens: (tokensByPlayer[p.playerId] || [0, 0, 0, 0]).map((progress: number) => ({ progress })),
    })));
    setDiceValue(game.diceValue ?? null);
    diceValueRef.current = game.diceValue ?? null;
    if (game.winnerId) {
      setWinnerId(game.winnerId);
      setRankings(game.rankings || []);
    }
    lastEventSeqRef.current = game.eventSeq ?? 0;
    if (opts.announce) {
      announceGameStart();
    } else {
      sound.setGameplayActive(true);
    }
  }, [announceGameStart]);

  const applyTurnChanged = useCallback((data: { currentTurn: string; turnTimerSeconds: number }) => {
    setCurrentTurnId(data.currentTurn);
    currentTurnIdRef.current = data.currentTurn;
    turnSlotIdRef.current = data.currentTurn;
    setTurnTimeRemaining(data.turnTimerSeconds);
    setDiceValue(null);
    diceValueRef.current = null;
    setDiceRolling(false);
    diceRollingRef.current = false;
  }, []);

  // ─── Online mode: apply one incremental game event ───────────────────────────
  // Same logic the old socket.on('dice_rolled'/'token_moved'/'turn_changed'/
  // 'game_over', ...) handlers had — now driven by the room's event log
  // instead of a push per event. Processes events one at a time, in order,
  // whether they arrive from this player's own action response or from a
  // poll tick that caught several events (e.g. a bot's whole turn) at once.
  const applyEvent = useCallback((event: any) => {
    switch (event.type) {
      case 'dice_rolled': {
        setDiceRolling(true);
        sound.playDiceRoll();
        // The server can (and often does) follow this with `turn_changed`
        // almost immediately — e.g. every roll that isn't a 6 while all
        // tokens are still in the yard (no legal move → turn auto-passes).
        // Cancel any earlier pending reveal, but let THIS one still show —
        // otherwise nobody ever sees what they rolled, it just silently
        // skips to the next player, which looks frozen.
        if (diceRollDisplayTimeoutRef.current) clearTimeout(diceRollDisplayTimeoutRef.current);
        diceRollDisplayTimeoutRef.current = setTimeout(() => {
          setDiceValue(event.value);
          diceValueRef.current = event.value;
          setDiceRolling(false);
          diceRollingRef.current = false;
          diceRollDisplayTimeoutRef.current = null;

          if (pendingTurnChangeRef.current) {
            applyTurnChanged(pendingTurnChangeRef.current);
            pendingTurnChangeRef.current = null;
          }
        }, 1000);
        break;
      }

      case 'token_moved': {
        let fromProgress = 0;
        setPlayers(prev => {
          const next: GamePlayerState[] = JSON.parse(JSON.stringify(prev));
          const p = next.find(x => x.id === event.playerId);
          if (p) {
            fromProgress = p.tokens[event.tokenIndex].progress;
            p.tokens[event.tokenIndex].progress = event.newProgress;
          }
          (event.cuts || []).forEach((c: any) => {
            const victim = next.find(x => x.id === c.victimId);
            if (victim) victim.tokens[c.tokenIndex].progress = 0;
          });
          return next;
        });

        if (event.cuts && event.cuts.length > 0) {
          const predatorSteps = Math.max(1, event.newProgress - fromProgress);
          const cutEvents: CutEvent[] = event.cuts.map((c: any) => ({
            victimId: c.victimId,
            tokenIndex: c.tokenIndex,
            fromProgress: c.fromProgress,
            predatorSteps,
          }));
          setLastCutEvents(cutEvents);
          setTimeout(() => setLastCutEvents([]), predatorSteps * STEP_ANIM_MS + 2400 + 1500);
        }
        break;
      }

      case 'turn_changed': {
        if (diceRollDisplayTimeoutRef.current) {
          // A dice reveal is still animating (this is almost certainly the
          // no-legal-move turn-change for the roll in flight) — queue it so
          // the roller gets to see their number land before their turn ends.
          pendingTurnChangeRef.current = { currentTurn: event.currentTurn, turnTimerSeconds: event.turnTimerSeconds };
          break;
        }
        applyTurnChanged({ currentTurn: event.currentTurn, turnTimerSeconds: event.turnTimerSeconds });
        break;
      }

      case 'game_over': {
        setWinnerId(event.winnerId);
        setRankings(event.rankings ?? []);
        setStatus('finished');
        sound.playWin();
        break;
      }

      // 'game_started' is handled via applySnapshot instead (it needs the
      // full initial board, not a delta). 'player_connected'/
      // 'player_disconnected' were never reflected in the UI even in the
      // socket-based version (presence was server bookkeeping only), and
      // 'match_cancelled' is detected via room.status in the poll loop, not
      // this event log — so there's nothing to do for those here.
      default:
        break;
    }
  }, [applyTurnChanged]);

  // ─── Online mode: apply a batch of game events, exactly once each ───────────
  // Single entry point used by every place that receives a `game` payload —
  // the poll tick, and this player's own roll/move responses. Always
  // re-filters against the CURRENT lastEventSeqRef (never trusts a
  // pre-filtered list computed earlier), so it's safe to call from more than
  // one in-flight request without ever double-applying (or skipping) an
  // event, no matter which response happens to land first. If a gap is
  // detected — some events aren't in the trailing log anymore, e.g. this
  // client was unfocused for a while — it falls back to a full snapshot
  // resync instead of animating a partial, now-inaccurate batch, since a
  // client silently drifting out of sync with the real board is a much
  // worse outcome than an occasional skipped animation.
  const applyGameEvents = useCallback((game: any) => {
    const currentSeq = lastEventSeqRef.current;
    const targetSeq = game.eventSeq ?? currentSeq;
    if (targetSeq <= currentSeq) return; // already applied everything this payload has — nothing to do

    const pending = (game.events || []).filter((e: any) => e.seq > currentSeq);
    const gapDetected = pending.length > 0 && pending[0].seq !== currentSeq + 1;

    lastEventSeqRef.current = targetSeq; // bump first — makes this call idempotent against any other in-flight call

    if (gapDetected) {
      applySnapshot(game, { announce: false });
      return;
    }
    for (const event of pending) applyEvent(event);
  }, [applySnapshot, applyEvent]);

  // ─── Roll dice (stable) ───────────────────────────────────────────────────────
  const rollDice = useCallback(() => {
    if (diceRollingRef.current || diceValueRef.current !== null) return;

    if (modeRef.current === 'offline') {
      setDiceRolling(true);
      diceRollingRef.current = true;
      sound.playDiceRoll();

      setTimeout(() => {
        const tid = currentTurnIdRef.current;
        const tm = teamModeRef.current;
        const controlledId = resolveControlledPlayerId(tid, playersRef.current, tm);

        // Catch-up dice: bias toward whatever number this player actually
        // needs (escaping the yard, or landing a capture) in proportion to
        // how many turns in a row they've missed it. Falls back to a plain
        // uniform 1-6 whenever nothing's currently "useful" to bias toward.
        const useful = controlledId ? usefulDiceValues(playersRef.current, controlledId, tm) : new Set<number>();
        const pity = controlledId ? (pityRef.current[controlledId] ?? 0) : 0;
        const val = weightedDiceRoll(useful, pity);
        if (controlledId) {
          pityRef.current[controlledId] = useful.has(val) ? 0 : (useful.size > 0 ? pity + 1 : pity);
        }

        // Three consecutive 6s forfeits the third roll outright — no token
        // may move on it, turn passes immediately.
        consecutiveSixesRef.current = val === 6 ? consecutiveSixesRef.current + 1 : 0;
        const forfeited = consecutiveSixesRef.current >= 3;
        if (forfeited) consecutiveSixesRef.current = 0;
        forfeitedRollRef.current = forfeited;

        setDiceValue(val);
        diceValueRef.current = val;
        setDiceRolling(false);
        diceRollingRef.current = false;

        if (forfeited) {
          setTimeout(() => advanceTurnOffline(false), 900);
          return;
        }

        const hasMoves = controlledId
          ? computeLegalMoves(playersRef.current, controlledId, val, tm).length > 0
          : false;

        if (!hasMoves) {
          setTimeout(() => advanceTurnOffline(false), 1000);
        }
      }, 1000);
    } else {
      roomApi.rollRoomDice(roomCodeRef.current!, currentTurnIdRef.current!)
        .then(({ game }) => applyGameEvents(game))
        .catch((err: unknown) => {
          // Most likely cause: this client's view of "whose turn" was a
          // beat stale (normal with polling) and the server rejected it.
          // Resync right away instead of leaving the dice looking stuck
          // until the next scheduled poll (~1.3s later).
          console.error('Failed to roll dice', err);
          pollNowRef.current();
        });
    }
  }, [advanceTurnOffline, resolveControlledPlayerId, applyGameEvents]);

  // ─── Public moveToken ─────────────────────────────────────────────────────────
  const moveToken = useCallback((tokenIndex: number) => {
    if (modeRef.current === 'offline') {
      moveTokenOffline(tokenIndex);
    } else {
      roomApi.moveRoomToken(roomCodeRef.current!, currentTurnIdRef.current!, tokenIndex)
        .then(({ game }) => applyGameEvents(game))
        .catch((err: unknown) => {
          console.error('Failed to move token', err);
          pollNowRef.current();
        });
    }
  }, [moveTokenOffline, applyGameEvents]);

  // ─── Set up offline game ──────────────────────────────────────────────────────
  const setOfflineGame = (newPlayers: GamePlayerState[], nextTeamMode = false) => {
    // Sort players into clockwise board order (red → green → yellow → blue)
    // so turns always rotate the same direction regardless of setup order.
    const sorted = [...newPlayers].sort(
      (a, b) => CLOCKWISE_ORDER.indexOf(a.color) - CLOCKWISE_ORDER.indexOf(b.color),
    );
    const tm = nextTeamMode && sorted.length === 4;

    setMode('offline');
    modeRef.current = 'offline';
    setTeamMode(tm);
    teamModeRef.current = tm;
    setPlayers(sorted);
    playersRef.current = sorted;
    setStatus('playing');
    turnSlotIdRef.current = sorted[0].id;
    consecutiveSixesRef.current = 0;
    pityRef.current = {};
    setCurrentTurnId(sorted[0].id);
    currentTurnIdRef.current = sorted[0].id;
    controlledPlayerIdRef.current = sorted[0].id;
    setDiceValue(null);
    diceValueRef.current = null;
    setTurnTimeRemaining(30);
    setWinnerId(null);
    setRankings([]);
    setLastCutEvents([]);
    resultRecordedRef.current = false;
    announceGameStart();
  };

  const leaveGame = () => {
    if (modeRef.current === 'online' && roomCodeRef.current) {
      const code = roomCodeRef.current;
      // Best-effort — the poll loop is about to be torn down anyway (mode
      // is cleared below), so nothing depends on this resolving.
      Promise.all(myPlayerIdsRef.current.map(id => roomApi.leaveRoom(code, id))).catch((err: unknown) => {
        console.error('Failed to notify server of leaving room', err);
      });
    }
    // Only clear the resumable match if this match actually ended (finished);
    // an intentional quit mid-match should still leave it resumable.
    if (statusRef.current === 'finished') {
      persistSnapshot(null);
      setResumableMatch(null);
    }
    setMode(null);
    setRoomCode(null);
    setStatus('waiting');
    setPlayers([]);
    setCurrentTurnId(null);
    setTeamMode(false);
    setDiceValue(null);
    setWinnerId(null);
    setRankings([]);
    setLastCutEvents([]);
    setLobbyPlayers([]);
    setMyPlayerIds([]);
    setRoomError(null);
    setMatchCancelled(null);
    setShowGameStart(false);
    pollGameSeenRef.current = false;
    lastEventSeqRef.current = 0;
    sound.setGameplayActive(false);
    if (!sound.isMuted()) sound.startBGM();
  };

  const connectToRoom = (code: string, player: any) => {
    setMode('online');
    modeRef.current = 'online';
    setRoomCode(code);
    roomCodeRef.current = code;
    setRoomError(null);
    pollGameSeenRef.current = false;
    lastEventSeqRef.current = 0;
    setMyPlayerIds(prev => (prev.includes(player.id) ? prev : [...prev, player.id]));

    // Retries a few times before giving up — this first join can otherwise
    // surface a transient failure (a slow/flaky mobile connection, or a
    // cold-starting serverless function) as a hard error, even though the
    // room is genuinely fine and the very next attempt would succeed.
    const attemptJoin = (attemptsLeft: number) => {
      roomApi.joinRoom(code, [player]).then(({ lobby, game }) => {
        if (game) {
          // Game already in progress — this is a reconnect/resume, not a
          // fresh start, so no "Game Start!" banner.
          pollGameSeenRef.current = true;
          applySnapshot(game, { announce: false });
        } else if (lobby) {
          setLobbyPlayers(lobby);
        }
      }).catch((err: unknown) => {
        if (attemptsLeft > 0) {
          setTimeout(() => attemptJoin(attemptsLeft - 1), 1000);
          return;
        }
        console.error('Failed to join room', err);
        setRoomError(err instanceof Error ? err.message : 'Failed to join room');
      });
    };
    attemptJoin(3);
  };

  // Add another seat from THIS device (same browser tab) — e.g. 3 players
  // on one phone joining alongside a friend on another device.
  const addLocalPlayer = useCallback((name: string, avatarEmoji?: string, avatarColor?: string) => {
    const code = roomCodeRef.current;
    if (!code) return;
    const id = `guest_${Math.random().toString(36).slice(2, 10)}`;
    setMyPlayerIds(prev => [...prev, id]);
    roomApi.joinRoom(code, [{ id, name: name.slice(0, 20) || 'Guest', avatarEmoji, avatarColor }])
      .then(({ lobby }) => { if (lobby) setLobbyPlayers(lobby); })
      .catch((err: unknown) => console.error('Failed to add local player', err));
  }, []);

  const removeLocalPlayer = useCallback((playerId: string) => {
    const code = roomCodeRef.current;
    if (!code) return;
    setMyPlayerIds(prev => prev.filter(id => id !== playerId));
    roomApi.leaveSeat(code, playerId)
      .then(({ lobby }) => setLobbyPlayers(lobby))
      .catch((err: unknown) => console.error('Failed to remove local player', err));
  }, []);

  const addBotToRoom = useCallback((difficulty?: BotDifficulty) => {
    const code = roomCodeRef.current;
    if (!code) return;
    roomApi.addRoomBot(code, difficulty)
      .then(({ lobby }) => setLobbyPlayers(lobby))
      .catch((err: unknown) => console.error('Failed to add bot', err));
  }, []);

  const selectColor = useCallback((playerId: string, color: PlayerColor) => {
    const code = roomCodeRef.current;
    if (!code) return;
    roomApi.selectRoomColor(code, playerId, color)
      .then(({ lobby }) => setLobbyPlayers(lobby))
      .catch((err: unknown) => console.error('Failed to select color', err));
  }, []);

  const renameSeat = useCallback((playerId: string, name: string) => {
    const code = roomCodeRef.current;
    const trimmed = name.trim();
    if (!code || !trimmed) return;
    roomApi.renameRoomSeat(code, playerId, trimmed)
      .then(({ lobby }) => setLobbyPlayers(lobby))
      .catch((err: unknown) => console.error('Failed to rename player', err));
  }, []);

  const isHost = useMemo(
    () => lobbyPlayers.some(p => p.isHost && myPlayerIds.includes(p.id)),
    [lobbyPlayers, myPlayerIds],
  );

  const cancelMatch = useCallback(() => {
    const code = roomCodeRef.current;
    const myLobbySeat = lobbyPlayers.find(p => p.isHost && myPlayerIds.includes(p.id));
    if (!code || !myLobbySeat) return;
    // No optimistic local update needed — the next poll tick (for every
    // player, host included) picks up room.status flipping to 'cancelled'.
    roomApi.cancelRoomMatch(code, myLobbySeat.id).catch((err: unknown) => console.error('Failed to cancel match', err));
  }, [lobbyPlayers, myPlayerIds]);

  const clearMatchCancelled = useCallback(() => setMatchCancelled(null), []);

  const startOnlineGame = useCallback((nextTeamMode = false) => {
    const code = roomCodeRef.current;
    if (!code) return;
    roomApi.startRoomGame(code, nextTeamMode)
      .then(({ game }) => {
        pollGameSeenRef.current = true;
        applySnapshot(game, { announce: true });
      })
      .catch((err: unknown) => console.error('Failed to start game', err));
  }, [applySnapshot]);

  // ─── Bot: roll dice ──────────────────────────────────────────────────────────
  // Gated on the TURN HOLDER's own isBot flag (not the controlled player's) —
  // under Team Up mode, a finished bot keeps auto-rolling/piloting its human
  // teammate's tokens, exactly like a finished human keeps manual control.
  useEffect((): ReturnType<React.EffectCallback> => {
    if (status !== 'playing' || mode !== 'offline') return;
    const currentPlayer = playersRef.current.find(p => p.id === currentTurnId);
    if (!currentPlayer?.isBot) return;
    if (diceValue !== null || diceRolling) return;

    const t = setTimeout(rollDice, 1200);
    return () => clearTimeout(t);
  }, [currentTurnId, diceValue, diceRolling, status, mode, rollDice]);

  // ─── Bot: move token ─────────────────────────────────────────────────────────
  useEffect((): ReturnType<React.EffectCallback> => {
    if (status !== 'playing' || mode !== 'offline') return;
    if (diceValue === null || diceRolling) return;
    const currentPlayer = playersRef.current.find(p => p.id === currentTurnId);
    if (!currentPlayer?.isBot) return;

    const controlledId = resolveControlledPlayerId(currentTurnId, playersRef.current, teamMode) ?? currentPlayer.id;
    const movable = computeLegalMoves(playersRef.current, controlledId, diceValue, teamMode);

    if (movable.length > 0) {
      const t = setTimeout(() => {
        const best = chooseBotMove(
          playersRef.current.map(p => ({ id: p.id, color: p.color, tokens: p.tokens })),
          controlledId,
          diceValue,
          movable,
          currentPlayer.botDifficulty || 'hard',
          teamMode,
        );
        moveTokenOffline(best === -1 ? movable[0] : best);
      }, 1000);
      return () => clearTimeout(t);
    }
  }, [currentTurnId, diceValue, diceRolling, status, mode, teamMode, moveTokenOffline, resolveControlledPlayerId]);

  // ─── Auto-move: exactly one valid token — offline (any human/piloted seat)
  // and online (the LOCAL player's own turn only — never auto-moves a
  // remote human's token from someone else's browser). ───────────────────────
  useEffect((): ReturnType<React.EffectCallback> => {
    if (diceValue === null || diceRolling || status !== 'playing') return;
    if (mode !== 'offline' && mode !== 'online') return;
    const tid = currentTurnIdRef.current;
    if (!tid) return;
    const currentPlayer = playersRef.current.find(p => p.id === tid);
    if (!currentPlayer || currentPlayer.isBot) return;
    if (mode === 'online' && !myPlayerIdsRef.current.includes(tid)) return;

    const controlledId = resolveControlledPlayerId(tid, playersRef.current, teamMode) ?? currentPlayer.id;
    const movable = computeLegalMoves(playersRef.current, controlledId, diceValue, teamMode);

    // Auto-move when there's exactly one legal option, OR when several
    // movable tokens are all sitting on the exact same cell (a stack/block)
    // — since they're visually and functionally identical right now,
    // making the player pick which one is just friction with no real
    // choice behind it.
    const controlledPlayer = playersRef.current.find(p => p.id === controlledId);
    const allSamePosition = controlledPlayer && movable.length > 1 &&
      new Set(movable.map(i => controlledPlayer.tokens[i].progress)).size === 1;

    if (movable.length === 1 || allSamePosition) {
      const t = setTimeout(() => moveToken(movable[0]), 450);
      return () => clearTimeout(t);
    }
  }, [diceValue, diceRolling, mode, status, teamMode, moveToken, resolveControlledPlayerId]);

  // ─── Turn timer: live 1s countdown ───────────────────────────────────────────
  // The badge previously just showed whatever number the last turn_changed/
  // advanceTurnOffline set and never moved. This ticks it down for real.
  // Online: purely cosmetic — the server is authoritative and enforces the
  // actual timeout independently. Offline: there's no server, so this is
  // also what enforces the timeout (auto-skips the turn at 0).
  useEffect((): ReturnType<React.EffectCallback> => {
    if (status !== 'playing') return;
    const interval = setInterval(() => {
      setTurnTimeRemaining(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [status, currentTurnId]);

  useEffect(() => {
    if (status !== 'playing' || mode !== 'offline' || turnTimeRemaining !== 0) return;
    advanceTurnOffline(false);
  }, [turnTimeRemaining, status, mode, advanceTurnOffline]);

  // ─── Keep the resumable-match snapshot in sync while a match is in progress ─
  useEffect(() => {
    if (status === 'playing' && mode === 'offline') {
      persistSnapshot({ mode: 'offline', savedAt: Date.now(), players, currentTurnId, teamMode });
    } else if (status === 'playing' && mode === 'online' && roomCode) {
      persistSnapshot({ mode: 'online', savedAt: Date.now(), roomCode });
    }
  }, [status, mode, players, currentTurnId, teamMode, roomCode, persistSnapshot]);

  // ─── Record the result once a match finishes ─────────────────────────────────
  // Guests: always tracked locally (localStorage). Signed-in users: offline
  // results are recorded here (online results are already recorded
  // server-side, in room-manager.ts's saveGameResult, for registered accounts).
  useEffect(() => {
    if (status !== 'finished' || resultRecordedRef.current) return;
    resultRecordedRef.current = true;
    persistSnapshot(null); // match is over — nothing left to resume
    setResumableMatch(null);

    const mainId = localPlayer?.id;
    if (!mainId) return;
    const relevantIds = mode === 'online' ? myPlayerIdsRef.current : [mainId];
    if (!relevantIds.includes(mainId)) return;

    const me = players.find(p => p.id === mainId);
    if (!me) return;
    const won = winnerId === mainId || rankings.some(r => r.playerId === mainId && r.rank === 1);
    const tokensHome = me.tokens.filter(t => t.progress === 57).length;

    if (isGuest) {
      recordGuestGameResult({ won, tokensHome, roomCode: mode === 'online' ? roomCodeRef.current : null, playerCount: players.length });
    } else if (mode === 'offline') {
      recordOfflineResult(won, tokensHome).catch((e) => console.error('Failed to record match result', e));
    }
  }, [status, mode, players, winnerId, rankings, localPlayer, isGuest, persistSnapshot]);

  const resumeOfflineMatch = useCallback((): boolean => {
    const snap = savedSnapshotRef.current;
    if (!snap || snap.mode !== 'offline' || !Array.isArray(snap.players) || snap.players.length === 0) return false;

    const restored = snap.players as GamePlayerState[];
    setMode('offline'); modeRef.current = 'offline';
    setTeamMode(!!snap.teamMode); teamModeRef.current = !!snap.teamMode;
    setPlayers(restored); playersRef.current = restored;
    setStatus('playing');
    const tid = snap.currentTurnId || restored[0].id;
    turnSlotIdRef.current = tid;
    setCurrentTurnId(tid); currentTurnIdRef.current = tid;
    controlledPlayerIdRef.current = tid;
    forfeitedRollRef.current = false;
    consecutiveSixesRef.current = 0;
    pityRef.current = {};
    setDiceValue(null); diceValueRef.current = null;
    setTurnTimeRemaining(30);
    setWinnerId(null);
    setRankings([]);
    setLastCutEvents([]);
    resultRecordedRef.current = false;
    setResumableMatch(null);
    sound.setGameplayActive(true);
    return true;
  }, []);

  const dismissResumableMatch = useCallback(() => setResumableMatch(null), []);

  // ─── Polling loop (online mode) ───────────────────────────────────────────────
  // Replaces the old Socket.IO push connection: every ~1.3s, ask the server
  // what's changed since the last event we've seen. `getRoomState` itself is
  // what lazily resolves bot turns and turn-timeouts server-side, so this
  // one loop is also what makes those actually happen from the client's
  // point of view — same end result as the old background timers, just
  // pulled instead of pushed.
  useEffect(() => {
    if (mode !== 'online' || !roomCode) return;

    let cancelled = false;

    const tick = async () => {
      if (pollInFlightRef.current) return;
      pollInFlightRef.current = true;
      try {
        const data = await roomApi.getRoomState(roomCodeRef.current!, lastEventSeqRef.current);
        if (cancelled) return;

        if (data.room.status === 'cancelled' || data.room.status === 'abandoned') {
          setMatchCancelled({ reason: data.room.status === 'cancelled' ? 'host_cancelled' : 'abandoned' });
          // The room is now scheduled for automatic cleanup on the server
          // (MongoDB TTL) — clear any "resume this match" pointer so a
          // later visit doesn't try to resume a room that's about to be
          // deleted (same as the existing 'finished' handling below).
          persistSnapshot(null);
          setResumableMatch(null);
          return;
        }

        if (data.game) {
          if (!pollGameSeenRef.current) {
            pollGameSeenRef.current = true;
            applySnapshot(data.game, { announce: true });
          } else {
            // Deliberately NOT using data.newEvents here — it was
            // pre-filtered server-side against the `since` value this
            // request was SENT with, which can be stale by the time the
            // RESPONSE arrives (e.g. this player's own roll/move response
            // landed in the meantime and already advanced
            // lastEventSeqRef). applyGameEvents always re-filters against
            // the CURRENT ref, so it's safe regardless of which response
            // lands first — the old code's blind trust in data.newEvents is
            // exactly what could double-apply a move and desync the board
            // between two players watching the same match.
            applyGameEvents(data.game);
          }
        } else if (data.lobby) {
          setLobbyPlayers(data.lobby);
        }
      } catch (err) {
        console.error('Room poll failed', err);
      } finally {
        pollInFlightRef.current = false;
      }
    };

    tick();
    const interval = setInterval(tick, 1300);
    pollNowRef.current = tick;

    return () => {
      cancelled = true;
      clearInterval(interval);
      pollNowRef.current = () => {};
      if (diceRollDisplayTimeoutRef.current) {
        clearTimeout(diceRollDisplayTimeoutRef.current);
        diceRollDisplayTimeoutRef.current = null;
      }
      pendingTurnChangeRef.current = null;
    };
  }, [mode, roomCode, applySnapshot, applyGameEvents, persistSnapshot]);

  return (
    <GameContext.Provider value={{
      mode, roomCode, status, players, currentTurnId,
      controlledPlayerId, teamMode,
      diceValue, diceRolling, turnTimeRemaining, winnerId, rankings,
      lastCutEvents,
      setOfflineGame, rollDice, moveToken, leaveGame, connectToRoom,
      lobbyPlayers, myPlayerIds, roomError,
      addLocalPlayer, removeLocalPlayer, addBotToRoom, startOnlineGame, selectColor, renameSeat,
      isHost, cancelMatch, matchCancelled, clearMatchCancelled, showGameStart,
      resumableMatch, resumeOfflineMatch, dismissResumableMatch,
    }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGameEngine() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGameEngine must be used within GameProvider');
  return ctx;
}
