import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { usePlayer } from '@/contexts/PlayerContext';
import { useGameEngine, GamePlayerState } from '@/contexts/GameContext';
import { COLORS, COLOR_HEX, type PlayerColor, type BotDifficulty } from '@/utils/ludo';
import { ChevronLeft, Play, User, Cpu, Users2, Pencil, Check } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { motion } from 'framer-motion';

// Opposite color pairs for 2-player default (diagonal corners on board)
const OPPOSITE: Record<PlayerColor, PlayerColor> = {
  red: 'yellow', yellow: 'red', green: 'blue', blue: 'green',
};

// Default color assignments per player count
const DEFAULT_COLORS: Record<number, PlayerColor[]> = {
  2: ['red', 'yellow'],
  3: ['red', 'green', 'yellow'],
  4: ['red', 'green', 'yellow', 'blue'],
};

// Color accent for each Ludo color
const COLOR_GLOW: Record<PlayerColor, string> = {
  red:    '#FF174455',
  green:  '#00C85355',
  yellow: '#FFD60055',
  blue:   '#2979FF55',
};

const BOT_DIFFICULTIES: { value: BotDifficulty; label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#3a5070' }}>
      {children}
    </p>
  );
}

export default function OfflineSetup() {
  const [, setLocation] = useLocation();
  const { player } = usePlayer();
  const { setOfflineGame } = useGameEngine();

  const [playerCount, setPlayerCount] = useState<2 | 3 | 4>(2);
  const [selectedColors, setSelectedColors] = useState<PlayerColor[]>(DEFAULT_COLORS[2]);
  const [bots, setBots] = useState<boolean[]>([false, true, true, true]);
  const [botDifficulties, setBotDifficulties] = useState<BotDifficulty[]>(['medium', 'medium', 'medium', 'medium']);
  const [teamMode, setTeamMode] = useState(false);
  const [names, setNames] = useState<string[]>(['', '', '', '']);
  const [editingSlot, setEditingSlot] = useState<number | null>(null);

  useEffect(() => {
    setSelectedColors(DEFAULT_COLORS[playerCount]);
    if (playerCount !== 4) setTeamMode(false);
  }, [playerCount]);

  const usedColors = new Set(selectedColors.slice(0, playerCount));

  const pickColor = (slotIndex: number, color: PlayerColor) => {
    setSelectedColors(prev => {
      const next = [...prev];
      const conflictIdx = next.findIndex((c, i) => i !== slotIndex && i < playerCount && c === color);
      if (conflictIdx !== -1) next[conflictIdx] = next[slotIndex];
      next[slotIndex] = color;
      return next;
    });
  };

  const toggleBot = (index: number) => {
    if (index === 0) return;
    setBots(prev => { const next = [...prev]; next[index] = !next[index]; return next; });
  };

  const setBotDifficulty = (index: number, difficulty: BotDifficulty) => {
    setBotDifficulties(prev => { const next = [...prev]; next[index] = difficulty; return next; });
  };

  const defaultName = (slotIdx: number) => {
    if (slotIdx === 0) return player?.name || 'Player 1';
    return bots[slotIdx] ? `Bot ${slotIdx}` : `Player ${slotIdx + 1}`;
  };

  const displayName = (slotIdx: number) => names[slotIdx]?.trim() || defaultName(slotIdx);

  const setSlotName = (slotIdx: number, value: string) => {
    setNames(prev => { const next = [...prev]; next[slotIdx] = value.slice(0, 20); return next; });
  };

  const startGame = () => {
    const gamePlayers: GamePlayerState[] = [];
    for (let i = 0; i < playerCount; i++) {
      const color = selectedColors[i] ?? COLORS[i];
      gamePlayers.push({
        id: i === 0 ? player!.id : `bot_${i}_${color}`,
        name: displayName(i),
        color,
        isBot: i === 0 ? false : bots[i],
        botDifficulty: (i !== 0 && bots[i]) ? botDifficulties[i] : undefined,
        isConnected: true,
        tokens: [{ progress: 0 }, { progress: 0 }, { progress: 0 }, { progress: 0 }],
      });
    }
    setOfflineGame(gamePlayers, playerCount === 4 && teamMode);
    setLocation('/game');
  };

  return (
    <div
      className="min-h-screen flex flex-col relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #080c18 0%, #0d1425 50%, #080c18 100%)' }}
    >
      {/* Corner glows */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div style={{ position:'absolute', top:'-8%',  left:'-8%',  width:'38%', height:'38%', background:'#FF174418', borderRadius:'50%', filter:'blur(80px)' }} />
        <div style={{ position:'absolute', bottom:'-8%', right:'-8%', width:'38%', height:'38%', background:'#2979FF18', borderRadius:'50%', filter:'blur(80px)' }} />
      </div>
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: 'radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)',
        backgroundSize: '26px 26px',
      }} />

      {/* Header */}
      <div
        className="relative z-10 flex items-center gap-3 px-4 py-4"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <button
          className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
          style={{ background: 'rgba(255,255,255,0.06)', color: '#8baac8' }}
          onClick={() => setLocation('/')}
        >
          <ChevronLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-black text-white leading-none">Offline Setup</h1>
          <p className="text-xs mt-0.5" style={{ color: '#3a5070' }}>Configure your match</p>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="relative z-10 flex-1 overflow-y-auto p-5 pb-28 max-w-md w-full mx-auto space-y-7">

        {/* ── Player count ── */}
        <div>
          <SectionLabel>Number of Players</SectionLabel>
          <div className="flex gap-3">
            {([2, 3, 4] as const).map(num => {
              const active = playerCount === num;
              return (
                <motion.button
                  key={num}
                  className="flex-1 h-14 rounded-2xl flex flex-col items-center justify-center gap-0.5 font-bold transition-all"
                  style={{
                    background: active ? 'rgba(41,121,255,0.18)' : 'rgba(255,255,255,0.04)',
                    border: active ? '1.5px solid #2979FF' : '1.5px solid rgba(255,255,255,0.07)',
                    color: active ? '#2979FF' : '#3a5070',
                    boxShadow: active ? '0 0 20px #2979FF25' : 'none',
                  }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setPlayerCount(num)}
                >
                  <Users2 size={16} />
                  <span className="text-xl font-black">{num}</span>
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* ── Player slots ── */}
        <div>
          <SectionLabel>Player Setup</SectionLabel>
          <div className="space-y-3">
            {Array.from({ length: playerCount }).map((_, slotIdx) => {
              const color     = selectedColors[slotIdx] ?? COLORS[slotIdx];
              const hex       = COLOR_HEX[color];
              const isHuman   = slotIdx === 0;
              const isBot     = !isHuman && bots[slotIdx];
              const isEditing = editingSlot === slotIdx;

              return (
                <motion.div
                  key={slotIdx}
                  className="rounded-2xl overflow-hidden"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: `1.5px solid ${hex}55`,
                    boxShadow: `0 4px 24px ${COLOR_GLOW[color]}`,
                  }}
                  layout
                >
                  {/* Top accent strip */}
                  <div className="h-1" style={{ background: `linear-gradient(90deg, ${hex}, ${hex}88)` }} />

                  <div className="p-4 space-y-3">
                    {/* Avatar + name row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-11 h-11 rounded-full flex items-center justify-center text-white shadow-lg shrink-0"
                          style={{ backgroundColor: hex, boxShadow: `0 4px 14px ${hex}60` }}
                        >
                          {isHuman ? <User size={17} /> : (isBot ? <Cpu size={17} /> : <User size={17} />)}
                        </div>
                        <div>
                          {isEditing ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                autoFocus
                                value={names[slotIdx]}
                                onChange={e => setSlotName(slotIdx, e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && setEditingSlot(null)}
                                onBlur={() => setEditingSlot(null)}
                                placeholder={defaultName(slotIdx)}
                                maxLength={20}
                                className="h-8 w-32 rounded-lg px-2.5 text-sm font-bold text-white outline-none"
                                style={{ background: 'rgba(255,255,255,0.08)', border: `1.5px solid ${hex}88` }}
                              />
                              <button
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => setEditingSlot(null)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                                style={{ background: `${hex}22`, color: hex }}
                              >
                                <Check size={13} />
                              </button>
                            </div>
                          ) : (
                            <button
                              className="flex items-center gap-1.5 group"
                              onClick={() => setEditingSlot(slotIdx)}
                              title="Click to rename"
                            >
                              <p className="font-bold text-white leading-tight">{displayName(slotIdx)}</p>
                              <Pencil size={11} style={{ color: '#3a5070' }} />
                            </button>
                          )}
                          <p
                            className="text-xs font-bold uppercase tracking-wider mt-0.5"
                            style={{ color: hex }}
                          >
                            {color}
                          </p>
                        </div>
                      </div>

                      {/* Bot toggle */}
                      {!isHuman && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#3a5070' }}>
                            {isBot ? 'Bot' : 'Human'}
                          </span>
                          <Switch
                            id={`bot-${slotIdx}`}
                            checked={bots[slotIdx]}
                            onCheckedChange={() => toggleBot(slotIdx)}
                          />
                        </div>
                      )}
                    </div>

                    {/* Color picker */}
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs font-medium" style={{ color: '#2d3d55' }}>Color:</span>
                      <div className="flex gap-2 flex-1">
                        {COLORS.map(c => {
                          const isSelected       = color === c;
                          const isUsedElsewhere  = usedColors.has(c) && !isSelected;
                          return (
                            <button
                              key={c}
                              onClick={() => pickColor(slotIdx, c)}
                              aria-label={`Pick ${c}`}
                              title={isUsedElsewhere ? `${c} (swap)` : c}
                              className="w-8 h-8 rounded-full transition-all duration-150 flex items-center justify-center"
                              style={{
                                backgroundColor: COLOR_HEX[c],
                                boxShadow: isSelected
                                  ? `0 0 0 2px #0d1425, 0 0 0 4px ${COLOR_HEX[c]}, 0 4px 14px ${COLOR_HEX[c]}80`
                                  : 'none',
                                opacity: isUsedElsewhere ? 0.4 : 1,
                                transform: isSelected ? 'scale(1.15)' : 'scale(1)',
                              }}
                            >
                              {isSelected && (
                                <div className="w-2.5 h-2.5 rounded-full bg-white/70" />
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* Swap suggestion for 2-player */}
                      {playerCount === 2 && slotIdx === 1 && (
                        <button
                          className="text-xs font-bold ml-auto shrink-0 transition-colors"
                          style={{ color: '#2979FF' }}
                          onClick={() => pickColor(1, OPPOSITE[selectedColors[0]])}
                        >
                          Opposite
                        </button>
                      )}
                    </div>

                    {/* Bot difficulty — only relevant for bot-controlled slots */}
                    {isBot && (
                      <div className="flex items-center gap-2.5">
                        <span className="text-xs font-medium" style={{ color: '#2d3d55' }}>Difficulty:</span>
                        <div className="flex gap-2 flex-1">
                          {BOT_DIFFICULTIES.map(d => {
                            const isSelected = botDifficulties[slotIdx] === d.value;
                            return (
                              <button
                                key={d.value}
                                onClick={() => setBotDifficulty(slotIdx, d.value)}
                                className="flex-1 h-8 rounded-lg text-xs font-bold transition-all duration-150"
                                style={{
                                  background: isSelected ? 'rgba(0,200,83,0.18)' : 'rgba(255,255,255,0.04)',
                                  border: `1.5px solid ${isSelected ? 'rgba(0,200,83,0.5)' : 'rgba(255,255,255,0.08)'}`,
                                  color: isSelected ? '#00C853' : '#4e6080',
                                }}
                              >
                                {d.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>

          {playerCount === 2 && (
            <p className="text-xs text-center mt-3 px-4" style={{ color: '#2d3d55' }}>
              Tip: Opposite colors (red &amp; yellow / green &amp; blue) give a fair diagonal start.
            </p>
          )}
        </div>

        {/* ── Team Up (pairing) — only meaningful with all 4 seats filled ── */}
        {playerCount === 4 && (
          <motion.div
            className="rounded-2xl p-4"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1.5px solid rgba(255,255,255,0.08)' }}
            layout
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-white text-sm flex items-center gap-2">
                  <Users2 size={15} style={{ color: '#FFD600' }} /> Team Up
                </p>
                <p className="text-xs mt-1" style={{ color: '#3a5070' }}>
                  Play 2v2 in diagonal-corner pairs — Red &amp; Yellow vs Green &amp; Blue.
                </p>
              </div>
              <Switch id="team-mode" checked={teamMode} onCheckedChange={setTeamMode} />
            </div>
            {teamMode && (
              <div className="flex gap-2 mt-3">
                <div className="flex-1 h-9 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold"
                  style={{ background: `${COLOR_HEX.red}18`, color: COLOR_HEX.red, border: `1px solid ${COLOR_HEX.red}40` }}>
                  Red + Yellow
                </div>
                <div className="flex-1 h-9 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold"
                  style={{ background: `${COLOR_HEX.green}18`, color: COLOR_HEX.green, border: `1px solid ${COLOR_HEX.green}40` }}>
                  Green + Blue
                </div>
              </div>
            )}
          </motion.div>
        )}
      </div>

      {/* ── Fixed bottom CTA ── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-20 p-4 flex justify-center"
        style={{ background: 'linear-gradient(to top, #080c18 60%, transparent)' }}
      >
        <motion.button
          className="w-full max-w-md h-16 rounded-2xl flex items-center justify-center gap-3 text-xl font-black text-white"
          style={{
            background: 'linear-gradient(135deg, #FF1744 0%, #FF6B35 100%)',
            boxShadow: '0 8px 32px #FF174445',
          }}
          whileHover={{ scale: 1.02, boxShadow: '0 12px 40px #FF174460' }}
          whileTap={{ scale: 0.97 }}
          onClick={startGame}
        >
          <Play fill="white" size={20} />
          Launch Match
        </motion.button>
      </div>
    </div>
  );
}
