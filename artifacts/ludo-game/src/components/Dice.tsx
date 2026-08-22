import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useGameEngine } from '../contexts/GameContext';
import { Button } from './ui/button';
import { usePlayer } from '../contexts/PlayerContext';
import { COLOR_HEX, type PlayerColor } from '../utils/ludo';

// ── Dot layout per face ──────────────────────────────────────────────────────
const DOT_POSITIONS: Record<number, { x: number; y: number }[]> = {
  1: [{ x: 50, y: 50 }],
  2: [{ x: 28, y: 28 }, { x: 72, y: 72 }],
  3: [{ x: 28, y: 28 }, { x: 50, y: 50 }, { x: 72, y: 72 }],
  4: [{ x: 28, y: 28 }, { x: 72, y: 28 }, { x: 28, y: 72 }, { x: 72, y: 72 }],
  5: [{ x: 28, y: 28 }, { x: 72, y: 28 }, { x: 50, y: 50 }, { x: 28, y: 72 }, { x: 72, y: 72 }],
  6: [{ x: 28, y: 20 }, { x: 72, y: 20 }, { x: 28, y: 50 }, { x: 72, y: 50 }, { x: 28, y: 80 }, { x: 72, y: 80 }],
};

// ── Container rotation needed to face each value toward the camera ────────────
// Cube face layout: 1=front, 6=back, 2=right, 5=left, 3=top, 4=bottom
// Standard dice: opposite faces sum to 7 (1↔6, 2↔5, 3↔4)
const FACE_ROTATIONS: Record<number, { x: number; y: number }> = {
  1: { x: 0,    y: 0    },  // front face already faces viewer
  2: { x: 0,    y: -90  },  // rotate cube left to bring right face forward
  3: { x: 90,   y: 0    },  // tilt cube back to bring top face forward
  4: { x: -90,  y: 0    },  // tilt cube forward to bring bottom face forward
  5: { x: 0,    y: 90   },  // rotate cube right to bring left face forward
  6: { x: 0,    y: 180  },  // flip cube around to bring back face forward
};

// ── Single face SVG ──────────────────────────────────────────────────────────
// No SVG <defs> / gradient IDs here — multiple instances in the same document
// would share the same ID and corrupt each other, making faces transparent.
function DiceFace({
  value,
  size = 64,
  color = '#1a1a2e',
}: {
  value: number;
  size?: number;
  color?: string;
}) {
  const dots = DOT_POSITIONS[value] ?? [];
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <rect x="0" y="0" width="100" height="100" rx="16" ry="16" fill="#f8f8f8" />
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r="9" fill={color} />
      ))}
    </svg>
  );
}

// ── 3-D cube dice ────────────────────────────────────────────────────────────
// The 6 face definitions: each face is placed by rotating then translating Z
const FACES = [
  { value: 1, rotateY:   0, rotateX:   0 },  // front
  { value: 6, rotateY: 180, rotateX:   0 },  // back
  { value: 2, rotateY:  90, rotateX:   0 },  // right
  { value: 5, rotateY: -90, rotateX:   0 },  // left
  { value: 3, rotateY:   0, rotateX: -90 },  // top
  { value: 4, rotateY:   0, rotateX:  90 },  // bottom
];

function faceTransform(ry: number, rx: number, half: number) {
  return `rotateY(${ry}deg) rotateX(${rx}deg) translateZ(${half}px)`;
}

function Cube3D({
  value,
  rolling,
  color,
  size = 64,
}: {
  value: number | null;
  rolling: boolean;
  color: string;
  size?: number;
}) {
  const half = size / 2;
  // Track the INTENDED (target) rotation to avoid ever animating backward.
  const rotRef = useRef({ x: 0, y: 0 });
  const [rot, setRot] = useState({ x: 0, y: 0 });
  const wasRolling = useRef(false);

  useEffect(() => {
    const justStarted = rolling && !wasRolling.current;
    const justEnded   = !rolling && wasRolling.current;

    if (justStarted) {
      // Spin the cube wildly — 2 full rotations + slight random tilt so it
      // never looks like it's just spinning on one axis.
      const jitter = Math.random() * 120;
      const next = {
        x: rotRef.current.x + 720 + jitter,
        y: rotRef.current.y + 720 + jitter * 0.7,
      };
      rotRef.current = next;
      setRot(next);
    } else if (justEnded && value !== null) {
      // Land on the correct face.
      // Round the current accumulated rotation to the nearest full turn,
      // then add the face-specific offset so we always approach from the
      // same rotational direction (never snap backward).
      const { x: fx, y: fy } = FACE_ROTATIONS[value] ?? { x: 0, y: 0 };
      const baseX = Math.round(rotRef.current.x / 360) * 360;
      const baseY = Math.round(rotRef.current.y / 360) * 360;
      const next  = { x: baseX + fx, y: baseY + fy };
      rotRef.current = next;
      setRot(next);
    }

    wasRolling.current = rolling;
  }, [rolling, value]);

  return (
    // perspective container — does NOT rotate; only the inner div does
    <div
      style={{
        perspective: size * 4,
        width: size,
        height: size,
      }}
    >
      <motion.div
        style={{
          width: size,
          height: size,
          position: 'relative',
          transformStyle: 'preserve-3d',
        }}
        animate={{ rotateX: rot.x, rotateY: rot.y }}
        transition={
          rolling
            ? { duration: 0.85, ease: [0.4, 0, 0.2, 1] }
            : { duration: 0.55, ease: [0.25, 0.46, 0.45, 0.94] }
        }
      >
        {FACES.map(({ value: fv, rotateY, rotateX }) => (
          <div
            key={fv}
            style={{
              position:              'absolute',
              width:                 size,
              height:                size,
              backfaceVisibility:    'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform:             faceTransform(rotateY, rotateX, half),
              borderRadius:          Math.round(size * 0.15),
              overflow:              'hidden',
              // Subtle coloured rim so the cube edge is visible in 3-D
              boxShadow:             `0 0 0 2px ${color}55`,
            }}
          >
            <DiceFace value={fv} size={size} color={color} />
          </div>
        ))}
      </motion.div>
    </div>
  );
}

// ── Mini dice for inline player-row display ──────────────────────────────────
// Kept as a flat 2-D widget since it's small (42 px) and the 3-D cube would
// be illegible at that size.
export function MiniDice({
  value,
  rolling,
  color,
}: {
  value: number | null;
  rolling: boolean;
  color: string;
}) {
  return (
    <motion.div
      animate={
        rolling
          ? {
              rotate: [0, -18, 18, -12, 12, -6, 6, 0],
              scale:  [1, 1.2, 0.9, 1.15, 0.95, 1.08, 0.97, 1],
            }
          : { rotate: 0, scale: 1 }
      }
      transition={{ duration: 0.75, ease: 'easeInOut' }}
      style={{ display: 'inline-flex' }}
    >
      {/* Reuse DiceFace at 42 px; show '1' when value is null */}
      <DiceFace value={value ?? 1} size={42} color={color} />
    </motion.div>
  );
}

// ── Per-player dice panel (positioned around the board) ─────────────────────
/**
 * A square panel for one player's dice.
 * - Active player: shows the animated 3-D cube + coloured glow.
 * - Inactive player: shows a flat, dimmed face.
 * - Timer badge sits in the top-right corner (shown only for the active player).
 * - Clicking the panel rolls the dice when canRoll is true.
 */
export function PlayerDicePanel({
  color,
  isActive,
  diceValue,
  diceRolling,
  timerValue,
  canRoll,
  onRoll,
  panelSize = 76,
}: {
  color: PlayerColor;
  isActive: boolean;
  diceValue: number | null;
  diceRolling: boolean;
  timerValue: number;
  canRoll: boolean;
  onRoll: () => void;
  panelSize?: number;
}) {
  const hex = COLOR_HEX[color];
  // Inner usable area (subtract border width on each side)
  const inner = panelSize - 4;
  // True pixel size of the 3-D cube — no CSS scaling needed or used.
  // Desktop panels (76px) → ~90 % of inner; mobile panels (60px) → ~70 % of inner.
  const cubeSize = panelSize >= 70
    ? Math.round(inner * 0.90)   // desktop: ≈ 64 px for a 76 px panel
    : Math.round(inner * 0.70);  // mobile:  ≈ 39 px for a 60 px panel
  // Flat face for inactive panels
  const faceSize = Math.round(inner * 0.72);
  // Badge dimensions scale with panel
  const badgeSize = Math.max(18, Math.round(panelSize * 0.28));
  const badgeOffset = Math.round(badgeSize * 0.4);
  const badgeFontSize = Math.max(8, Math.round(badgeSize * 0.48));

  return (
    <div className="relative" style={{ width: panelSize, height: panelSize, flexShrink: 0 }}>
      {/* Timer badge — top-right corner */}
      <div
        className="absolute z-10 rounded-full flex items-center justify-center text-white font-black shadow-md"
        style={{
          top: -badgeOffset,
          right: -badgeOffset,
          width: badgeSize,
          height: badgeSize,
          fontSize: badgeFontSize,
          backgroundColor: hex,
        }}
      >
        {timerValue}
      </div>

      {/* Dice panel — no overflow:hidden so the 3-D rotation never gets clipped */}
      <div
        onClick={canRoll ? onRoll : undefined}
        className={`w-full h-full rounded-2xl border-2 flex items-center justify-center transition-all duration-300 select-none ${
          canRoll
            ? 'cursor-pointer hover:scale-105 active:scale-95'
            : 'cursor-default'
        }`}
        style={{
          borderColor: hex,
          backgroundColor: isActive ? `${hex}18` : '#ffffff',
          boxShadow: isActive
            ? `0 4px 20px ${hex}44, 0 0 0 1px ${hex}22`
            : `0 2px 8px rgba(0,0,0,0.10)`,
        }}
      >
        {isActive ? (
          <Cube3D value={diceValue} rolling={diceRolling} color={hex} size={cubeSize} />
        ) : (
          <DiceFace value={1} size={faceSize} color={hex} />
        )}
      </div>
    </div>
  );
}

// ── Main Dice panel ──────────────────────────────────────────────────────────
export function Dice() {
  const { currentTurnId, diceValue, diceRolling, rollDice, players } = useGameEngine();
  const { player: localPlayer } = usePlayer();

  const isMyTurn  = currentTurnId === localPlayer?.id;
  const isBotTurn = players.find(p => p.id === currentTurnId)?.isBot;
  const canRoll   = (isMyTurn || isBotTurn) && diceValue === null && !diceRolling;
  const showRollButton = isMyTurn && canRoll;

  const currentColor = players.find(p => p.id === currentTurnId)?.color ?? 'blue';
  const dotColor     = COLOR_HEX[currentColor as PlayerColor];

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="h-24 flex items-center justify-center">
        {/* Coloured halo ring around the cube */}
        <div
          style={{
            padding: 6,
            borderRadius: 16,
            border: `3px solid ${dotColor}`,
            boxShadow: `0 4px 28px ${dotColor}55, 0 0 0 1px ${dotColor}22`,
            background: `${dotColor}0a`,
            display: 'inline-flex',
          }}
        >
          <Cube3D value={diceValue} rolling={diceRolling} color={dotColor} />
        </div>
      </div>

      <Button
        size="lg"
        onClick={rollDice}
        disabled={!canRoll}
        className="w-full text-lg shadow-md font-bold h-14 rounded-xl"
        variant={showRollButton ? 'default' : 'secondary'}
        style={showRollButton ? { backgroundColor: dotColor, borderColor: dotColor } : {}}
      >
        {diceRolling ? 'Rolling…' : showRollButton ? 'Roll Dice' : 'Wait…'}
      </Button>
    </div>
  );
}
