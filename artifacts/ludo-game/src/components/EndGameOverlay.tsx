import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Crown, X } from 'lucide-react';
import { COLOR_HEX, TEAM_KEY, type PlayerColor } from '@/utils/ludo';
import { sound } from '@/lib/sound';

interface RankingEntry {
  playerId: string;
  rank: number;
}

interface PlayerLike {
  id: string;
  name: string;
  color: PlayerColor;
}

interface EndGameOverlayProps {
  players: PlayerLike[];
  rankings: RankingEntry[];
  winnerId: string | null;
  teamMode: boolean;
  onClose: () => void;
}

const CONFETTI_COLORS = [COLOR_HEX.red, COLOR_HEX.green, COLOR_HEX.yellow, COLOR_HEX.blue, '#FFD600', '#ffffff'];
const FIREWORK_COLORS = [COLOR_HEX.red, COLOR_HEX.green, COLOR_HEX.yellow, COLOR_HEX.blue, '#FFD600'];

function FireworkBurst({ x, y, color }: { x: number; y: number; color: string }) {
  const particles = useMemo(() => {
    const count = 16 + Math.floor(Math.random() * 6);
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.35;
      const dist = 55 + Math.random() * 65;
      return { dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist };
    });
  }, []);

  return (
    <div className="absolute" style={{ left: `${x}%`, top: `${y}%` }}>
      {particles.map((p, i) => (
        <motion.div
          key={i}
          className="absolute w-2.5 h-2.5 rounded-full"
          style={{ background: color, boxShadow: `0 0 11px ${color}` }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{ x: p.dx, y: p.dy, opacity: 0, scale: 0.2 }}
          transition={{ duration: 1.0, ease: 'easeOut' }}
        />
      ))}
      {/* central flash */}
      <motion.div
        className="absolute rounded-full"
        style={{ width: 10, height: 10, marginLeft: -5, marginTop: -5, background: color, boxShadow: `0 0 32px 10px ${color}` }}
        initial={{ opacity: 1, scale: 0.5 }}
        animate={{ opacity: 0, scale: 3.2 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
      />
    </div>
  );
}

/** A single rocket: launches from the ground up to (x,y), then bursts. Two-phase so the "flying up into the sky" moment is actually visible, not just an instant explosion. */
function Firework({ x, y, color, onDone }: { x: number; y: number; color: string; onDone: () => void }) {
  const [phase, setPhase] = useState<'launch' | 'burst'>('launch');
  const launchMs = useMemo(() => 480 + Math.random() * 140, []);

  useEffect(() => {
    sound.playFireworkLaunch();
    const t = setTimeout(() => setPhase('burst'), launchMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== 'burst') return;
    sound.playFirework();
    const t = setTimeout(onDone, 950);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  return (
    <>
      {phase === 'launch' && (
        <motion.div
          className="absolute rounded-full"
          style={{ left: `${x}%`, width: 5, marginLeft: -2.5, height: 14, background: color, boxShadow: `0 0 11px ${color}` }}
          initial={{ top: '102%', opacity: 1 }}
          animate={{ top: `${y}%`, opacity: 1 }}
          transition={{ duration: launchMs / 1000, ease: [0.22, 0.7, 0.35, 1] }}
        >
          {/* small trailing spark */}
          <motion.div
            className="absolute left-1/2 rounded-full"
            style={{ width: 4, height: 18, marginLeft: -2, top: 5, background: `linear-gradient(180deg, ${color}00, ${color}90)` }}
          />
        </motion.div>
      )}
      {phase === 'burst' && <FireworkBurst x={x} y={y} color={color} />}
    </>
  );
}

function PodiumStep({
  names, height, rankLabel, accent, crown, delay,
}: {
  names: { name: string; color: PlayerColor }[];
  height: number;
  rankLabel: string;
  accent: string;
  crown?: boolean;
  delay: number;
}) {
  return (
    <div className="flex flex-col items-center">
      <div className="h-9 flex items-end justify-center mb-1">
        {crown && (
          <motion.div
            initial={{ y: -14, opacity: 0, rotate: -12 }}
            animate={{ y: [0, -6, 0], opacity: 1, rotate: 0 }}
            transition={{
              y: { duration: 1.6, repeat: Infinity, ease: 'easeInOut', delay: 0.9 },
              opacity: { duration: 0.4, delay: 0.7 },
              rotate: { duration: 0.4, delay: 0.7 },
            }}
          >
            <Crown size={32} style={{ color: '#FFD600', filter: 'drop-shadow(0 0 10px #FFD60090)' }} fill="#FFD600" />
          </motion.div>
        )}
      </div>

      <div className="flex flex-col items-center gap-1 mb-2">
        {names.map((p, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: delay + 0.1 + i * 0.08 }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
            style={{ background: 'rgba(255,255,255,0.09)', border: `1px solid ${COLOR_HEX[p.color]}70` }}
          >
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLOR_HEX[p.color] }} />
            <span className="text-xs sm:text-sm font-bold text-white truncate max-w-[90px]">{p.name}</span>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ height: 0 }}
        animate={{ height }}
        transition={{ delay: delay, duration: 0.55, ease: 'easeOut' }}
        className="w-20 sm:w-24 rounded-t-xl flex items-start justify-center pt-2 overflow-hidden"
        style={{
          background: `linear-gradient(180deg, ${accent}35, ${accent}12)`,
          border: `2px solid ${accent}80`,
          borderBottom: 'none',
        }}
      >
        <span className="text-xl sm:text-2xl font-black" style={{ color: accent }}>{rankLabel}</span>
      </motion.div>
    </div>
  );
}

export function EndGameOverlay({ players, rankings, winnerId, teamMode, onClose }: EndGameOverlayProps) {
  const confetti = useMemo(() => Array.from({ length: 55 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 3.5,
    duration: 3.2 + Math.random() * 2.4,
    size: 6 + Math.random() * 7,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    spinDir: Math.random() > 0.5 ? 1 : -1,
    sway: 18 + Math.random() * 34,
    round: Math.random() > 0.5,
  })), []);

  const [fireworks, setFireworks] = useState<{ id: number; x: number; y: number; color: string }[]>([]);
  const nextId = useRef(0);

  useEffect(() => {
    sound.playWin();
    let cancelled = false;
    const pendingTimers: ReturnType<typeof setTimeout>[] = [];

    const scheduleWave = () => {
      if (cancelled) return;

      // 1, 2, or 3 rockets together — weighted toward smaller waves so it
      // doesn't feel like a nonstop barrage; never more than 3 at once.
      const roll = Math.random();
      const waveSize = roll < 0.5 ? 1 : roll < 0.82 ? 2 : 3;

      for (let i = 0; i < waveSize; i++) {
        const t = setTimeout(() => {
          if (cancelled) return;
          const id = nextId.current++;
          const x = 12 + Math.random() * 76;
          const y = 12 + Math.random() * 40;
          const color = FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)];
          setFireworks(prev => [...prev, { id, x, y, color }]);
        }, i * (110 + Math.random() * 90));
        pendingTimers.push(t);
      }

      const nextWaveIn = 1500 + Math.random() * 1300;
      const waveTimer = setTimeout(scheduleWave, nextWaveIn);
      pendingTimers.push(waveTimer);
    };

    const first = setTimeout(scheduleWave, 500);
    pendingTimers.push(first);

    return () => { cancelled = true; pendingTimers.forEach(clearTimeout); };
  }, []);

  const removeFirework = (id: number) => setFireworks(prev => prev.filter(f => f.id !== id));

  const winner = players.find(p => p.id === winnerId);
  const winnerMate = teamMode && winner
    ? players.find(p => p.id !== winner.id && TEAM_KEY[p.color] === TEAM_KEY[winner.color])
    : undefined;

  // Group ranking entries by rank value (Team Up ties both winners at rank 1).
  const rankGroups = useMemo(() => {
    const groups = new Map<number, PlayerLike[]>();
    rankings.forEach(r => {
      const p = players.find(pp => pp.id === r.playerId);
      if (!p) return;
      if (!groups.has(r.rank)) groups.set(r.rank, []);
      groups.get(r.rank)!.push(p);
    });
    return [...groups.entries()].sort((a, b) => a[0] - b[0]);
  }, [rankings, players]);

  const podium = rankGroups.slice(0, 3);
  const extra = rankGroups.slice(3);
  const ordinal = (n: number) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.35 } }}
    >
      {/* Semi-transparent backdrop — board stays visible underneath, just dimmed */}
      <div className="absolute inset-0" style={{ background: 'rgba(5,8,17,0.74)', backdropFilter: 'blur(2.5px)' }} />

      {/* Confetti */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {confetti.map(c => (
          <motion.div
            key={c.id}
            className={c.round ? 'absolute top-0 rounded-full' : 'absolute top-0 rounded-sm'}
            style={{ left: `${c.left}%`, width: c.size, height: c.round ? c.size : c.size * 0.4, background: c.color }}
            initial={{ y: '-5vh', opacity: 0, rotate: 0 }}
            animate={{
              y: '110vh',
              x: [0, c.sway, -c.sway, 0],
              opacity: [0, 1, 1, 0.75],
              rotate: 360 * c.spinDir * 3,
            }}
            transition={{ duration: c.duration, delay: c.delay, repeat: Infinity, ease: 'linear' }}
          />
        ))}
      </div>

      {/* Fireworks — 1-3 launch together from the ground, climb, then burst */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <AnimatePresence>
          {fireworks.map(f => (
            <Firework key={f.id} x={f.x} y={f.y} color={f.color} onDone={() => removeFirework(f.id)} />
          ))}
        </AnimatePresence>
      </div>

      {/* Close — returns to menu, no other button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center z-20 transition-colors hover:bg-white/10"
        style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff' }}
        title="Return to menu"
      >
        <X size={20} />
      </button>

      <motion.div
        className="relative z-10 flex flex-col items-center gap-5 px-6 max-w-lg w-full"
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', bounce: 0.4, delay: 0.1 }}
      >
        <h1
          className="text-3xl sm:text-5xl font-black text-center leading-tight"
          style={{ color: '#FFD600', textShadow: '0 0 30px #FFD60080, 0 2px 0 rgba(0,0,0,0.4)' }}
        >
          {winnerMate ? `${winner?.name} & ${winnerMate.name} Win!` : `${winner?.name} Wins!`}
        </h1>

        {podium.length > 0 && (
          <div className="flex items-end justify-center gap-3 sm:gap-4">
            {podium[1] && (
              <PodiumStep
                names={podium[1][1].map(p => ({ name: p.name, color: p.color }))}
                height={92} rankLabel={ordinal(podium[1][0])} accent="#C0C0C0" delay={0.35}
              />
            )}
            {podium[0] && (
              <PodiumStep
                names={podium[0][1].map(p => ({ name: p.name, color: p.color }))}
                height={132} rankLabel={ordinal(podium[0][0])} accent="#FFD600" crown delay={0.2}
              />
            )}
            {podium[2] && (
              <PodiumStep
                names={podium[2][1].map(p => ({ name: p.name, color: p.color }))}
                height={64} rankLabel={ordinal(podium[2][0])} accent="#CD7F32" delay={0.5}
              />
            )}
          </div>
        )}

        {extra.length > 0 && (
          <div className="w-full max-w-xs space-y-1.5">
            {extra.map(([rank, group]) => group.map(p => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.7 }}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2"
                style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${COLOR_HEX[p.color]}40` }}
              >
                <div className="w-7 h-7 rounded-full flex items-center justify-center font-black text-xs shrink-0"
                  style={{ background: '#8a9bb0', color: '#20232b' }}>
                  {rank}
                </div>
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLOR_HEX[p.color] }} />
                <span className="flex-1 text-sm font-bold text-white truncate">{p.name}</span>
                <span className="text-[10px] font-black uppercase tracking-wider text-white/50">{ordinal(rank)}</span>
              </motion.div>
            )))}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
