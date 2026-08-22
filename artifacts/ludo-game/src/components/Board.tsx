import React, { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  COLOR_HEX, TRACK_PATH, HOME_PATHS, YARD_POSITIONS,
  START_POSITIONS, SAFE_SQUARES, progressToCoord, homeSlotCoord,
  computeLegalMoves,
  type PlayerColor
} from '../utils/ludo';
import { useGameEngine, type CutEvent } from '../contexts/GameContext';
import { usePlayer } from '../contexts/PlayerContext';
import { useIsMobile } from '../hooks/use-mobile';
import { sound } from '../lib/sound';

// ─── Animation timing ────────────────────────────────────────────────────────
// Must stay in sync with STEP_ANIM_MS in GameContext.tsx
const STEP_DELAY_MS  = 220;  // ms per forward step
const STEP_BACK_MS   = 80;   // ms per backward (walk-home) step — faster than forward

// ─── Step-by-step animation helpers ─────────────────────────────────────────
function getCoordForToken(
  color: PlayerColor, progress: number, tokenIndex: number,
  homeSlot?: { count: number; rank: number },
) {
  if (progress === 0) {
    return YARD_POSITIONS[color][tokenIndex];
  }
  if (progress === 57 && homeSlot) {
    return homeSlotCoord(color, homeSlot.count, homeSlot.rank);
  }
  return progressToCoord(color, progress);
}

// ─── Coin rotation ────────────────────────────────────────────────────────────
// Desktop: 0° for every coin (board is large enough to read from any angle).
// Mobile:  red / green sit at the TOP of the board.  Rotating their coins 180°
//          keeps the pin tip pointing toward their cell centre while making the
//          body face toward the nearby edge — matching each player's real seat.
//          Rotation is bound to the coin's OWN color, NOT to whose turn it is,
//          so it never changes mid-animation when the active turn switches.
const TOP_COLORS: PlayerColor[] = ['red', 'green'];

// ─── Crash-burst overlay ─────────────────────────────────────────────────────
interface CrashEntry { id: string; x: number; y: number }

function CrashBurst({ x, y, pct }: { x: number; y: number; pct: number }) {
  // Centred on the cell that holds the collision
  const left = `${(x + 0.5) * pct}%`;
  const top  = `${(y + 0.5) * pct}%`;
  return (
    <motion.div
      className="absolute pointer-events-none"
      style={{
        left, top,
        width: 0, height: 0,   // no size — children are positioned relative to this anchor
      }}
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ duration: 0.65, ease: 'easeOut' }}
    >
      {/* Expanding ring */}
      <motion.div
        className="absolute rounded-full border-4 border-yellow-400"
        style={{ translateX: '-50%', translateY: '-50%' }}
        initial={{ width: 4, height: 4 }}
        animate={{ width: 48, height: 48 }}
        transition={{ duration: 0.55, ease: 'easeOut' }}
      />
      {/* Inner flash */}
      <motion.div
        className="absolute rounded-full bg-red-500/50"
        style={{ translateX: '-50%', translateY: '-50%' }}
        initial={{ width: 4, height: 4 }}
        animate={{ width: 28, height: 28 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      />
      {/* Star sparks */}
      {[0, 60, 120, 180, 240, 300].map(deg => (
        <motion.div
          key={deg}
          className="absolute w-2 h-2 rounded-full bg-yellow-300"
          style={{
            translateX: '-50%',
            translateY: '-50%',
            rotate: deg,
          }}
          initial={{ x: 0, y: 0, opacity: 1 }}
          animate={{
            x: Math.cos((deg * Math.PI) / 180) * 20,
            y: Math.sin((deg * Math.PI) / 180) * 20,
            opacity: 0,
          }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      ))}
    </motion.div>
  );
}

// ─── Board component ──────────────────────────────────────────────────────────
export function Board() {
  const {
    players, currentTurnId, controlledPlayerId, teamMode,
    moveToken, diceValue, diceRolling, lastCutEvents,
  } = useGameEngine();
  const { player: localPlayer } = usePlayer();
  const isMobile = useIsMobile();

  // Helper: find player by color
  const playerByColor = (color: PlayerColor) => players.find(p => p.color === color);

  // Only the CURRENT roller's turn allows moves — but under Team Up mode a
  // finished player pilots their teammate's tokens, so the tokens that are
  // actually clickable belong to `controlledPlayerId`, not `currentTurnId`.
  const currentPlayer = players.find(p => p.id === currentTurnId);
  const isMyTurn = currentTurnId === localPlayer?.id || currentPlayer?.isBot === true;
  const canMove  = isMyTurn && diceValue !== null && !diceRolling;

  // Rules-aware legal moves for whoever is actually being piloted this turn
  // (blocks, safe squares, Team Up capture-immunity all honored here).
  const legalMoves = useMemo(() => {
    if (!canMove || !controlledPlayerId || diceValue === null) return [];
    return computeLegalMoves(
      players.map(p => ({ id: p.id, color: p.color, tokens: p.tokens })),
      controlledPlayerId,
      diceValue,
      teamMode,
    );
  }, [players, controlledPlayerId, diceValue, canMove, teamMode]);

  // ── Visual (animated) progress, separate from game state ──────────────────
  const visProgRef  = useRef<Record<string, number>>({});
  const [visProg, setVisProg] = useState<Record<string, number>>({});
  const animTimers  = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const animating   = useRef<Record<string, boolean>>({});

  // ── Crash-burst overlay ────────────────────────────────────────────────────
  const [crashes, setCrashes] = useState<CrashEntry[]>([]);
  const addCrash = useCallback((x: number, y: number) => {
    const id = `crash-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setCrashes(prev => [...prev, { id, x, y }]);
    setTimeout(() => setCrashes(prev => prev.filter(c => c.id !== id)), 800);
  }, []);
  // Stable ref so the animation useEffect can call it without stale closures
  const addCrashRef = useRef(addCrash);
  useEffect(() => { addCrashRef.current = addCrash; }, [addCrash]);

  // Keep a stable ref to lastCutEvents so the animation effect always reads
  // the batch-updated value without needing it as a dep (which would cause
  // spurious re-runs when cut events are cleared 4 s later).
  const lastCutEventsRef = useRef<CutEvent[]>(lastCutEvents);
  useEffect(() => { lastCutEventsRef.current = lastCutEvents; }, [lastCutEvents]);

  // Initialise visual progress when players are first set
  useEffect(() => {
    const patch: Record<string, number> = {};
    players.forEach(p =>
      p.tokens.forEach((t, i) => {
        const k = `${p.id}-${i}`;
        if (visProgRef.current[k] === undefined) {
          patch[k] = t.progress;
          visProgRef.current[k] = t.progress;
        }
      })
    );
    if (Object.keys(patch).length) setVisProg(prev => ({ ...prev, ...patch }));
  }, [players.length]);

  // Animate token when actual progress changes
  useEffect(() => {
    players.forEach(p => {
      p.tokens.forEach((t, i) => {
        const k    = `${p.id}-${i}`;
        const from = visProgRef.current[k] ?? t.progress;
        const to   = t.progress;
        if (from === to) return;

        // ── Token was cut back to yard ────────────────────────────────────────
        if (to === 0) {
          clearTimeout(animTimers.current[k]);
          animating.current[k] = false;

          // Look up cut event (set synchronously with setPlayers in context)
          const cut = lastCutEventsRef.current.find(
            c => c.victimId === p.id && c.tokenIndex === i,
          );

          if (cut && from > 0) {
            // ① Wait for the predator to arrive, then play crash + walk-home.
            const arrivalMs = cut.predatorSteps * STEP_DELAY_MS;
            // Capture the victim's current cell now (before vis position resets)
            const crashCoord = getCoordForToken(p.color, from, i);

            animating.current[k] = true;
            animTimers.current[k] = setTimeout(() => {
              // Flash the collision burst
              addCrashRef.current(crashCoord.x, crashCoord.y);
              sound.playCapture();

              // ② Walk backward along the track to the yard
              const stepBack = (cur: number) => {
                const next = Math.max(0, cur - 1);
                visProgRef.current[k] = next;
                setVisProg(prev => ({ ...prev, [k]: next }));
                if (next > 0) {
                  animTimers.current[k] = setTimeout(
                    () => stepBack(next),
                    STEP_BACK_MS,
                  );
                } else {
                  animating.current[k] = false;
                }
              };
              stepBack(from);
            }, arrivalMs);
            return; // don't instant-reset
          }

          // No cut event (online mode, or from === 0): instant teleport to yard
          visProgRef.current[k] = 0;
          setVisProg(prev => ({ ...prev, [k]: 0 }));
          return;
        }

        // ── Forward step-by-step move ─────────────────────────────────────────
        if (animating.current[k]) return; // already running toward a target
        animating.current[k] = true;

        const step = (cur: number) => {
          const next = cur + 1;
          visProgRef.current[k] = next;
          setVisProg(prev => ({ ...prev, [k]: next }));
          if (next < to) {
            sound.playTokenStep();
            animTimers.current[k] = setTimeout(() => step(next), STEP_DELAY_MS);
          } else {
            animating.current[k] = false;
            if (to === 57) sound.playTokenHome();
            else sound.playTokenStep();
          }
        };
        step(from);
      });
    });

    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      Object.values(animTimers.current).forEach(clearTimeout);
    };
  }, [players]);

  // ── Build tokens to render ─────────────────────────────────────────────────
  const tokensToRender = useMemo(() => {
    const list: {
      playerId: string; color: PlayerColor; tokenIndex: number;
      x: number; y: number; isMovable: boolean;
      stackOffsetX: number; stackOffsetY: number; stackScale: number;
      stackIndex: number; hidden: boolean;
      progress: number; homeCount: number;
    }[] = [];

    players.forEach(p => {
      // Stable rank (by token index order) among this player's currently
      // finished tokens — used to lay 1-4 home tokens out inside their
      // wedge without overlapping, per HOME_SLOT_LAYOUTS.
      const homeCount = p.tokens.filter(tok => tok.progress === 57).length;
      let homeRankCounter = 0;

      p.tokens.forEach((t, i) => {
        const k = `${p.id}-${i}`;
        const displayProg = visProg[k] ?? t.progress;

        const homeSlot = t.progress === 57 ? { count: homeCount, rank: homeRankCounter++ } : undefined;
        const { x, y } = getCoordForToken(p.color, displayProg, i, homeSlot);

        const isMovable =
          canMove &&
          p.id === controlledPlayerId &&
          legalMoves.includes(i);

        list.push({
          playerId: p.id, color: p.color, tokenIndex: i, x, y, isMovable,
          stackOffsetX: 0, stackOffsetY: 0, stackScale: 1, stackIndex: 0, hidden: false,
          progress: displayProg, homeCount,
        });
      });
    });

    // ── Stack tokens that share the same cell ──────────────────────────────
    const cellGroups = new Map<string, typeof list>();
    list.forEach(t => {
      const key = `${Math.round(t.x * 2)}-${Math.round(t.y * 2)}`;
      if (!cellGroups.has(key)) cellGroups.set(key, []);
      cellGroups.get(key)!.push(t);
    });

    // Offsets and scale for 1-4 visible tokens (never shrink beyond 4-piece size)
    const STACK_OFFSETS = [
      [{ x: 0, y: 0 }],
      [{ x: -0.14, y: 0 }, { x: 0.14, y: 0 }],
      [{ x: -0.16, y: -0.08 }, { x: 0.16, y: -0.08 }, { x: 0, y: 0.10 }],
      [{ x: -0.14, y: -0.10 }, { x: 0.14, y: -0.10 }, { x: -0.14, y: 0.10 }, { x: 0.14, y: 0.10 }],
    ];
    const STACK_SCALES = [1.0, 0.62, 0.55, 0.50];

    cellGroups.forEach(group => {
      // Sort: movable tokens first so they always get a visible slot
      const sorted = [...group].sort((a, b) =>
        (b.isMovable ? 1 : 0) - (a.isMovable ? 1 : 0)
      );

      // Scale is based on how many tokens are in the cell, capped at 4
      const visibleCount = Math.min(sorted.length, 4);
      const scale  = STACK_SCALES[visibleCount - 1];
      const offsets = STACK_OFFSETS[visibleCount - 1];

      sorted.forEach((t, idx) => {
        if (idx < 4) {
          // Normal visible slot — all get the same scale
          t.stackOffsetX = offsets[idx].x;
          t.stackOffsetY = offsets[idx].y;
          t.stackScale   = scale;
          t.stackIndex   = idx;
          t.hidden       = false;
        } else {
          // Overflow beyond 4: hidden unless it's this player's turn,
          // in which case show it on top (over the others) at same scale
          if (t.isMovable) {
            t.stackOffsetX = 0;
            t.stackOffsetY = -0.12;
            t.stackScale   = scale;
            t.stackIndex   = 30; // renders above everything
            t.hidden       = false;
          } else {
            t.stackOffsetX = offsets[0].x;
            t.stackOffsetY = offsets[0].y;
            t.stackScale   = scale;
            t.stackIndex   = idx;
            t.hidden       = true;
          }
        }
      });
    });

    // ── Home tokens: each already has its own distinct, non-overlapping slot
    // (from homeSlotCoord) rather than sharing one cell, so the generic
    // same-cell stacking above doesn't apply — instead scale down just
    // enough that 1-4 of them comfortably fit side by side inside their
    // small triangular wedge without touching.
    const HOME_TOKEN_SCALE: Record<number, number> = { 1: 0.8, 2: 0.72, 3: 0.62, 4: 0.52 };
    list.forEach(t => {
      if (t.progress === 57) {
        t.stackScale = HOME_TOKEN_SCALE[Math.max(1, Math.min(4, t.homeCount))];
        t.stackOffsetX = 0;
        t.stackOffsetY = 0;
        t.hidden = false;
      }
    });

    return list;
  }, [players, visProg, canMove, diceValue, controlledPlayerId, legalMoves]);

  // ── Cell width as % of board (15 cells across) ────────────────────────────
  const pct = 100 / 15;

  return (
    <div className="relative w-full max-w-2xl aspect-square rounded-xl shadow-2xl border-4 border-white/60 p-2 bg-white">
      {/* Board background — clipped to the rounded corners so the colored
          quadrant squares don't poke out past the rounded edge. */}
      <div className="absolute inset-2 rounded-xl overflow-hidden">
      <svg viewBox="0 0 15 15" className="w-full h-full drop-shadow-sm">
        {/* Background */}
        <rect x="0" y="0" width="15" height="15" fill="#f0f0f0" />

        {/* Yards */}
        <YardSVG color="red"    x={0} y={0} namePosition="top"    playerName={playerByColor('red')?.name}    rotateText={isMobile && TOP_COLORS.includes((currentPlayer?.color ?? '') as PlayerColor)} />
        <YardSVG color="green"  x={9} y={0} namePosition="top"    playerName={playerByColor('green')?.name}  rotateText={isMobile && TOP_COLORS.includes((currentPlayer?.color ?? '') as PlayerColor)} />
        <YardSVG color="yellow" x={9} y={9} namePosition="bottom" playerName={playerByColor('yellow')?.name} rotateText={isMobile && TOP_COLORS.includes((currentPlayer?.color ?? '') as PlayerColor)} />
        <YardSVG color="blue"   x={0} y={9} namePosition="bottom" playerName={playerByColor('blue')?.name}   rotateText={isMobile && TOP_COLORS.includes((currentPlayer?.color ?? '') as PlayerColor)} />

        {/* Home column paths */}
        {(['red', 'green', 'yellow', 'blue'] as PlayerColor[]).map(c =>
          HOME_PATHS[c].map((pos, i) => (
            <rect
              key={`${c}-home-${i}`}
              x={pos.x} y={pos.y} width="1" height="1"
              fill={COLOR_HEX[c]} opacity={0.85}
              stroke="#fff" strokeWidth="0.05"
            />
          ))
        )}

        {/* Track squares */}
        {TRACK_PATH.map((pos, i) => {
          const isSafe = SAFE_SQUARES.includes(i);
          let fill = '#ffffff';
          if (i === START_POSITIONS.red)    fill = COLOR_HEX.red;
          if (i === START_POSITIONS.green)  fill = COLOR_HEX.green;
          if (i === START_POSITIONS.yellow) fill = COLOR_HEX.yellow;
          if (i === START_POSITIONS.blue)   fill = COLOR_HEX.blue;
          const cx = pos.x + 0.5;
          const cy = pos.y + 0.5;
          return (
            <g key={`track-${i}`}>
              <rect x={pos.x} y={pos.y} width="1" height="1"
                    fill={fill} stroke="#bbb" strokeWidth="0.05" />
              {isSafe && fill === '#ffffff' && (
                <Star cx={cx} cy={cy} r={0.33} />
              )}
            </g>
          );
        })}

        {/* Center triangles */}
        <polygon points="6,6 9,6 7.5,7.5" fill={COLOR_HEX.green} />
        <polygon points="9,6 9,9 7.5,7.5" fill={COLOR_HEX.yellow} />
        <polygon points="9,9 6,9 7.5,7.5" fill={COLOR_HEX.blue} />
        <polygon points="6,9 6,6 7.5,7.5" fill={COLOR_HEX.red} />
      </svg>
      </div>

      {/* Token + crash overlay (HTML so framer-motion works with percentages).
          Deliberately a SIBLING of the clipped board-background wrapper above
          (not nested inside it) — same exact position/size as before, but no
          longer clipped, so pins in the top/bottom rows render in full
          instead of having their tips/heads cut off at the board edge. */}
      <div className="absolute inset-2 pointer-events-none">

        {/* ── Crash burst animations ─────────────────────────────────────── */}
        {crashes.map(c => (
          <CrashBurst key={c.id} x={c.x} y={c.y} pct={pct} />
        ))}

        {/* ── Tokens ────────────────────────────────────────────────────── */}
        <AnimatePresence>
          {tokensToRender.map(t => {
            // Pin geometry — always laid out at FULL size. Shrinking for a
            // stack is done purely via an animated `scale` transform (below)
            // around the same pin-tip anchor used for rotation, so every
            // token in a stack shrinks/grows in lockstep on one shared,
            // Framer-Motion-tracked transition instead of each one
            // recomputing raw width/height/top/left independently on every
            // render (which could paint out of sync — the "one coin doesn't
            // shrink" bug).
            const pinSize = 95;
            const pinTop  = 50 - 0.95 * pinSize;
            const pinLeft = (100 - pinSize) / 2;

            // ── Coin rotation ─────────────────────────────────────────────
            // ALL coins rotate based on whose TURN it is, not the coin's own
            // color.  When it is red/green's turn → 180° for every coin on
            // mobile so the active player always sees the board right-side-up.
            // The rotation is held during movement so coins don't snap back.
            const displayRotation =
              isMobile && TOP_COLORS.includes((currentPlayer?.color ?? '') as PlayerColor) ? 180 : 0;

            // NOTE: deliberately excludes stackIndex — stackIndex can be
            // reassigned by the movable-first sort without the token's cell
            // actually changing, and remounting this wrapper on every such
            // reassignment caused visible desync between stacked siblings.
            const hopKey = `${t.x.toFixed(1)}-${t.y.toFixed(1)}`;

            return (
              <motion.div
                key={`${t.playerId}-${t.tokenIndex}`}
                className="absolute"
                style={{
                  width:  `${pct}%`,
                  height: `${pct}%`,
                  zIndex: t.isMovable ? 20 : t.stackIndex + 1,
                  opacity: t.hidden ? 0 : 1,
                  pointerEvents: t.hidden ? 'none' : undefined,
                }}
                initial={false}
                animate={{
                  left: `${(t.x + t.stackOffsetX) * pct}%`,
                  top:  `${(t.y + t.stackOffsetY) * pct}%`,
                }}
                transition={{ duration: 0.18, ease: 'easeInOut' }}
              >
                {/* Hop wrapper — re-mounts on each grid step, triggering bounce */}
                <motion.div
                  key={hopKey}
                  className="w-full h-full"
                  initial={{ y: '0%' }}
                  animate={{ y: ['0%', '-38%', '0%'] }}
                  transition={{ duration: 0.22, ease: 'easeOut', times: [0, 0.38, 1] }}
                >
                  <button
                    className={[
                      'relative w-full h-full pointer-events-auto',
                      t.isMovable ? 'cursor-pointer animate-pulse' : 'cursor-default',
                    ].join(' ')}
                    style={{ background: 'none', border: 'none', padding: 0 }}
                    onClick={() => {
                      if (t.isMovable && t.playerId === controlledPlayerId) {
                        moveToken(t.tokenIndex);
                      }
                    }}
                    disabled={!t.isMovable || t.playerId !== controlledPlayerId}
                    aria-label={`${t.color} token ${t.tokenIndex + 1}`}
                  >
                    {/*
                     * transformOrigin '50% 95%' keeps the pin's tip (SVG y≈0.95)
                     * anchored to the exact centre of the cell for all rotation
                     * values — the body spins around the tip, not the centre.
                     */}
                    <motion.svg
                      viewBox="0 0 1 1"
                      preserveAspectRatio="xMidYMid meet"
                      style={{
                        position: 'absolute',
                        top:    `${pinTop}%`,
                        left:   `${pinLeft}%`,
                        width:  `${pinSize}%`,
                        height: `${pinSize}%`,
                        overflow: 'visible',
                        transformOrigin: '50% 95%',
                        filter: t.isMovable
                          ? 'drop-shadow(0px 0px 5px white) drop-shadow(0px 2px 6px rgba(0,0,0,0.6))'
                          : 'drop-shadow(0px 2px 6px rgba(0,0,0,0.55))',
                      }}
                      initial={{ rotate: displayRotation, scale: t.stackScale }}
                      animate={{ rotate: displayRotation, scale: t.stackScale }}
                      transition={{ duration: 0.25, ease: 'easeInOut' }}
                    >
                      {/* Base circle — centered on pin tip so tip overlaps it */}
                      <circle
                        cx="0.5" cy="0.95" r="0.30"
                        fill={COLOR_HEX[t.color]}
                        fillOpacity="0.45"
                        stroke="rgba(255,255,255,0.8)"
                        strokeWidth="0.05"
                      />
                      {/* Pin body */}
                      <path
                        d="M0.5,0.95 C0.26,0.75 0.15,0.58 0.15,0.38 A0.35,0.35 0 1 1 0.85,0.38 C0.85,0.58 0.74,0.75 0.5,0.95 Z"
                        fill={COLOR_HEX[t.color]}
                        stroke="rgba(255,255,255,0.9)"
                        strokeWidth="0.06"
                        strokeLinejoin="round"
                      />
                      {/* Inner gloss dot */}
                      <circle cx="0.5" cy="0.33" r="0.15" fill="rgba(255,255,255,0.5)" />
                    </motion.svg>
                  </button>
                </motion.div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Yard SVG sub-component ──────────────────────────────────────────────────
function YardSVG({
  color, x, y,
  playerName, namePosition = 'top', rotateText = false,
}: {
  color: string; x: number; y: number;
  playerName?: string;
  namePosition?: 'top' | 'bottom';
  rotateText?: boolean;
}) {
  const hex = COLOR_HEX[color as PlayerColor];

  // Strip centres (local yard coords): top strip spans y 0–0.7, bottom 5.3–6
  const labelX = 3;
  const labelY = namePosition === 'bottom' ? 5.65 : 0.35;

  // Truncate to keep text inside the strip
  const label = playerName
    ? (playerName.length > 9 ? playerName.slice(0, 8) + '…' : playerName)
    : undefined;

  return (
    <g transform={`translate(${x},${y})`}>
      <rect width="6" height="6" fill={hex} />
      <rect x="0.7" y="0.7" width="4.6" height="4.6" fill="#fff" rx="0.4" />
      <circle cx="2" cy="2" r="0.62" fill={hex} opacity="0.45" stroke={hex} strokeWidth="0.14" />
      <circle cx="4" cy="2" r="0.62" fill={hex} opacity="0.45" stroke={hex} strokeWidth="0.14" />
      <circle cx="2" cy="4" r="0.62" fill={hex} opacity="0.45" stroke={hex} strokeWidth="0.14" />
      <circle cx="4" cy="4" r="0.62" fill={hex} opacity="0.45" stroke={hex} strokeWidth="0.14" />

      {/* Player name label inside the colored border strip */}
      {label && (
        // Translate to label centre, then rotate around that point
        <g transform={`translate(${labelX},${labelY})`}>
          <motion.g
            animate={{ rotate: rotateText ? 180 : 0 }}
            transition={{ duration: 0.35, ease: 'easeInOut' }}
            style={{ transformOrigin: '0px 0px' }}
          >
            <text
              x={0} y={0}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="0.42"
              fontWeight="bold"
              fill="white"
              style={{ userSelect: 'none', pointerEvents: 'none', fontFamily: 'sans-serif' }}
            >
              {label}
            </text>
          </motion.g>
        </g>
      )}
    </g>
  );
}

// ─── 5-pointed star helper ────────────────────────────────────────────────────
function Star({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const angle  = (Math.PI * 2 / 10) * i - Math.PI / 2;
    const radius = i % 2 === 0 ? r : r * 0.42;
    pts.push(`${(cx + radius * Math.cos(angle)).toFixed(3)},${(cy + radius * Math.sin(angle)).toFixed(3)}`);
  }
  return (
    <polygon
      points={pts.join(' ')}
      fill="white"
      stroke="#444"
      strokeWidth="0.025"
      strokeLinejoin="round"
    />
  );
}
