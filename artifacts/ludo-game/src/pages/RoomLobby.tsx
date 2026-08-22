import React, { useEffect, useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { useGetRoom, useGetRoomState } from '@workspace/api-client-react';
import { useGameEngine } from '@/contexts/GameContext';
import { usePlayer } from '@/contexts/PlayerContext';
import { COLORS, COLOR_HEX, TEAM_KEY, type PlayerColor } from '@/utils/ludo';
import {
  ChevronLeft, Copy, Play, Users, CheckCircle2, RotateCcw,
  UserPlus, Bot, X, Crown, Wifi, WifiOff, Users2, Pencil, Check,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { motion, AnimatePresence } from 'framer-motion';

const GUEST_EMOJIS = ['🎲', '🚀', '🐉', '🦊', '🐼', '🎯', '⚡', '🔥'];
// Diagonal-corner partner for each color (Red+Yellow / Green+Blue sit opposite).
const OPPOSITE_COLOR: Record<PlayerColor, PlayerColor> = {
  red: 'yellow', yellow: 'red', green: 'blue', blue: 'green',
};
const BOT_DIFFICULTIES: { value: 'easy' | 'medium' | 'hard'; label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
];

function fadeUp(delay = 0) {
  return {
    initial: { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: { delay, duration: 0.45, ease: 'easeOut' as const },
  };
}

export default function RoomLobby() {
  const { code } = useParams();
  const [, setLocation] = useLocation();
  const { player } = usePlayer();
  const {
    status, mode, roomCode, leaveGame, connectToRoom,
    lobbyPlayers, myPlayerIds, roomError,
    addLocalPlayer, removeLocalPlayer, addBotToRoom, startOnlineGame, selectColor, renameSeat,
  } = useGameEngine();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: room } = useGetRoom(code!, { query: { enabled: !!code } } as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: roomState } = useGetRoomState(code!, { query: { enabled: !!code } } as any);
  const [copied, setCopied] = useState(false);
  const [addingGuest, setAddingGuest] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestEmoji, setGuestEmoji] = useState(GUEST_EMOJIS[0]);
  const [addingBot, setAddingBot] = useState(false);
  const [teamMode, setTeamMode] = useState(false);
  const [editingSeatId, setEditingSeatId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  useEffect(() => {
    if (lobbyPlayers.length !== 4) setTeamMode(false);
  }, [lobbyPlayers.length]);

  // Hydrate the connection if this page was opened directly (e.g. refresh)
  // rather than navigated to right after connectToRoom() was already called.
  useEffect(() => {
    if (code && player && (mode !== 'online' || roomCode !== code)) {
      connectToRoom(code, player);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, player?.id]);

  useEffect(() => {
    if (status === 'playing') {
      setLocation('/game');
    }
  }, [status, setLocation]);

  const copyCode = () => {
    navigator.clipboard.writeText(code!);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLeave = () => {
    leaveGame();
    setLocation('/online');
  };

  const handleReconnect = () => {
    connectToRoom(code!, player);
  };

  const isHost = room?.hostPlayerId === player?.id;
  const isGameInProgress = roomState?.status === 'playing' || roomState?.status === 'paused';
  const maxPlayers = room?.maxPlayers ?? 4;
  const seatsLeft = Math.max(0, maxPlayers - lobbyPlayers.length);
  const canAddSeat = seatsLeft > 0 && !isGameInProgress;

  const submitGuest = () => {
    if (!guestName.trim() || !canAddSeat) return;
    addLocalPlayer(guestName.trim(), guestEmoji);
    setGuestName('');
    setAddingGuest(false);
  };

  const startEditingName = (seatId: string, currentName: string) => {
    setEditingSeatId(seatId);
    setEditingName(currentName);
  };

  const submitRename = () => {
    if (editingSeatId && editingName.trim()) {
      renameSeat(editingSeatId, editingName.trim());
    }
    setEditingSeatId(null);
  };

  return (
    <div
      className="min-h-screen flex flex-col relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #080c18 0%, #0d1425 50%, #080c18 100%)' }}
    >
      {/* Corner glows — matches landing page theme */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div style={{ position: 'absolute', top: '-8%', left: '-8%', width: '38%', height: '38%', background: '#2979FF18', borderRadius: '50%', filter: 'blur(80px)' }} />
        <div style={{ position: 'absolute', bottom: '-8%', right: '-8%', width: '38%', height: '38%', background: '#00C85318', borderRadius: '50%', filter: 'blur(80px)' }} />
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
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.06)', color: '#8baac8' }}
          onClick={handleLeave}
        >
          <ChevronLeft size={18} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-black text-white leading-none">Room Lobby</h1>
          <p className="text-xs mt-0.5" style={{ color: '#3a5070' }}>Waiting to start the match</p>
        </div>
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto p-5 pb-32 max-w-md w-full mx-auto space-y-6">

        {/* ── Share code ── */}
        <motion.div {...fadeUp(0.02)} className="flex flex-col items-center py-2">
          <p className="text-xs uppercase tracking-widest font-bold mb-3" style={{ color: '#3a5070' }}>Share Code</p>
          <div
            className="flex items-center gap-4 px-7 py-4 rounded-2xl"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1.5px solid rgba(255,255,255,0.10)',
              backdropFilter: 'blur(14px)',
            }}
          >
            <span className="text-4xl font-mono font-black tracking-[0.15em]" style={{ color: '#FFD600', textShadow: '0 0 30px #FFD60050' }}>
              {code}
            </span>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={copyCode}
              className="h-11 w-11 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.06)' }}
            >
              {copied ? <CheckCircle2 size={18} color="#00C853" /> : <Copy size={18} color="#8baac8" />}
            </motion.button>
          </div>
        </motion.div>

        {roomError && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex items-center justify-between gap-3 text-sm font-semibold py-2 px-4 rounded-xl"
            style={{ background: 'rgba(255,23,68,0.1)', border: '1px solid rgba(255,23,68,0.3)', color: '#FF1744' }}
          >
            <span>{roomError}</span>
            <button
              onClick={() => player && connectToRoom(code!, player)}
              className="shrink-0 text-xs font-bold px-2.5 py-1 rounded-full"
              style={{ background: 'rgba(255,23,68,0.18)' }}
            >
              Retry
            </button>
          </motion.div>
        )}

        {/* ── Players ── */}
        <motion.div {...fadeUp(0.08)}>
          <h2 className="font-black text-white text-base flex items-center gap-2 mb-3">
            <Users size={17} style={{ color: '#2979FF' }} /> Players
            <span style={{ color: '#3a5070' }}>({lobbyPlayers.length}/{maxPlayers})</span>
          </h2>

          <div className="space-y-2.5">
            <AnimatePresence initial={false}>
              {lobbyPlayers.map((p) => {
                const hex = COLOR_HEX[p.color as PlayerColor] ?? '#2979FF';
                const isMine = myPlayerIds.includes(p.id);
                const canRemove = isMine && !p.isHost && !isGameInProgress;
                return (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    className="rounded-2xl p-3.5"
                    style={{
                      background: 'rgba(255,255,255,0.045)',
                      border: `1.5px solid ${hex}45`,
                      boxShadow: `0 4px 20px ${hex}18`,
                    }}
                  >
                    <div className="flex items-center gap-3.5">
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-xl shrink-0"
                      style={{ backgroundColor: hex, boxShadow: `0 4px 14px ${hex}55` }}
                    >
                      {p.isBot ? <Bot size={19} color="white" /> : (p.avatarEmoji || '👤')}
                    </div>
                    <div className="flex-1 min-w-0">
                      {isMine && !isGameInProgress && editingSeatId === p.id ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            autoFocus
                            value={editingName}
                            onChange={e => setEditingName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && submitRename()}
                            onBlur={submitRename}
                            maxLength={20}
                            className="h-8 w-32 rounded-lg px-2.5 text-sm font-bold text-white outline-none"
                            style={{ background: 'rgba(255,255,255,0.08)', border: `1.5px solid ${hex}88` }}
                          />
                          <button
                            onMouseDown={e => e.preventDefault()}
                            onClick={submitRename}
                            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                            style={{ background: `${hex}22`, color: hex }}
                          >
                            <Check size={13} />
                          </button>
                        </div>
                      ) : (
                        <button
                          className="font-bold text-white leading-tight truncate flex items-center gap-1.5 max-w-full"
                          onClick={() => isMine && !isGameInProgress && startEditingName(p.id, p.name)}
                          disabled={!isMine || isGameInProgress}
                        >
                          <span className="truncate">{p.name}</span>
                          {p.isHost && <Crown size={12} color="#FFD600" fill="#FFD600" className="shrink-0" />}
                          {isMine && !isGameInProgress && <Pencil size={10} style={{ color: '#3a5070' }} className="shrink-0" />}
                        </button>
                      )}
                      <p className="text-xs font-bold uppercase tracking-wider mt-0.5" style={{ color: hex }}>
                        {p.color}{p.isBot && p.botDifficulty ? ` · ${p.botDifficulty}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isMine && (
                        <span
                          className="text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full"
                          style={{ background: 'rgba(41,121,255,0.18)', color: '#2979FF' }}
                        >
                          You
                        </span>
                      )}
                      {!p.isBot && (
                        p.isConnected
                          ? <Wifi size={13} color="#00C853" />
                          : <WifiOff size={13} color="#4e6080" />
                      )}
                      {canRemove && (
                        <button
                          onClick={() => removeLocalPlayer(p.id)}
                          className="w-6 h-6 rounded-full flex items-center justify-center"
                          style={{ background: 'rgba(255,23,68,0.12)', color: '#FF1744' }}
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>
                    </div>

                    {/* Color/corner picker — only for my own seat(s), pre-game.
                        2-player rooms are locked to diagonal-opposite corners. */}
                    {isMine && !isGameInProgress && (
                      <div className="flex items-center gap-2.5 mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        <span className="text-xs font-medium" style={{ color: '#2d3d55' }}>Corner:</span>
                        <div className="flex gap-2 flex-1">
                          {COLORS.map(c => {
                            const isSelected = p.color === c;
                            const takenByOther = lobbyPlayers.some(q => q.id !== p.id && q.color === c);
                            const otherSeat = maxPlayers === 2 ? lobbyPlayers.find(q => q.id !== p.id) : undefined;
                            const lockedOut = maxPlayers === 2 && !!otherSeat && c !== OPPOSITE_COLOR[otherSeat.color] && !isSelected;
                            const disabled = takenByOther || lockedOut;
                            return (
                              <button
                                key={c}
                                onClick={() => !disabled && selectColor(p.id, c)}
                                disabled={disabled}
                                aria-label={`Pick ${c}`}
                                title={disabled ? `${c} (unavailable)` : c}
                                className="w-8 h-8 rounded-full transition-all duration-150 flex items-center justify-center"
                                style={{
                                  backgroundColor: COLOR_HEX[c],
                                  boxShadow: isSelected
                                    ? `0 0 0 2px #0d1425, 0 0 0 4px ${COLOR_HEX[c]}, 0 4px 14px ${COLOR_HEX[c]}80`
                                    : 'none',
                                  opacity: disabled ? 0.35 : 1,
                                  transform: isSelected ? 'scale(1.15)' : 'scale(1)',
                                  cursor: disabled ? 'not-allowed' : 'pointer',
                                }}
                              >
                                {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-white/70" />}
                              </button>
                            );
                          })}
                        </div>
                        {maxPlayers === 2 && (
                          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#3a5070' }}>
                            Opposite corners
                          </span>
                        )}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {lobbyPlayers.length === 0 && !isGameInProgress && (
              <p className="text-center py-10 font-medium text-sm" style={{ color: '#3a5070' }}>
                Waiting for players to join…
              </p>
            )}
          </div>

          {/* Empty seat placeholders */}
          {seatsLeft > 0 && !isGameInProgress && (
            <div className="grid gap-2 mt-2.5" style={{ gridTemplateColumns: `repeat(${Math.min(seatsLeft, 4)}, 1fr)` }}>
              {Array.from({ length: seatsLeft }).map((_, i) => (
                <div
                  key={i}
                  className="h-11 rounded-xl flex items-center justify-center text-xs font-bold"
                  style={{ border: '1.5px dashed rgba(255,255,255,0.1)', color: '#2d3d55' }}
                >
                  Open
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* ── Host: Team Up (pairing) toggle — needs exactly 4 seats ── */}
        {isHost && lobbyPlayers.length === 4 && !isGameInProgress && (
          <motion.div {...fadeUp(0.16)}
            className="rounded-2xl p-4"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1.5px solid rgba(255,255,255,0.08)' }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-white text-sm flex items-center gap-2">
                  <Users2 size={15} style={{ color: '#FFD600' }} /> Team Up
                </p>
                <p className="text-xs mt-1" style={{ color: '#3a5070' }}>
                  2v2 by diagonal corner — Red &amp; Yellow vs Green &amp; Blue.
                </p>
              </div>
              <Switch id="online-team-mode" checked={teamMode} onCheckedChange={setTeamMode} />
            </div>
            {teamMode && (
              <div className="flex gap-2 mt-3">
                {lobbyPlayers.map(p => {
                  const hex = COLOR_HEX[p.color as PlayerColor] ?? '#2979FF';
                  return (
                    <div key={p.id}
                      className="flex-1 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold uppercase tracking-wide"
                      style={{ background: `${hex}18`, color: hex, border: `1px solid ${hex}40` }}>
                      {TEAM_KEY[p.color as PlayerColor] === 'RY' ? 'Team R+Y' : 'Team G+B'}
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

        {/* ── Add a local (this-device) player ── */}
        {canAddSeat && (
          <motion.div {...fadeUp(0.14)}>
            <AnimatePresence mode="wait">
              {addingGuest ? (
                <motion.div
                  key="form"
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="rounded-2xl p-4 space-y-3"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1.5px solid rgba(255,255,255,0.09)' }}
                >
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#3a5070' }}>
                    Add a player from this device
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {GUEST_EMOJIS.map(e => (
                      <button
                        key={e}
                        onClick={() => setGuestEmoji(e)}
                        className="w-9 h-9 rounded-full flex items-center justify-center text-lg"
                        style={{
                          background: guestEmoji === e ? 'rgba(41,121,255,0.22)' : 'rgba(255,255,255,0.05)',
                          border: guestEmoji === e ? '1.5px solid #2979FF' : '1.5px solid transparent',
                        }}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                  <input
                    autoFocus
                    value={guestName}
                    onChange={e => setGuestName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submitGuest()}
                    placeholder="Player name"
                    maxLength={20}
                    className="w-full h-11 rounded-xl px-4 text-white font-semibold outline-none"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.1)' }}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setAddingGuest(false)}
                      className="flex-1 h-11 rounded-xl font-bold text-sm"
                      style={{ background: 'rgba(255,255,255,0.05)', color: '#8baac8' }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={submitGuest}
                      disabled={!guestName.trim()}
                      className="flex-1 h-11 rounded-xl font-bold text-sm text-white"
                      style={{ background: guestName.trim() ? 'linear-gradient(135deg,#2979FF,#00B4D8)' : 'rgba(255,255,255,0.06)' }}
                    >
                      Add Player
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.button
                  key="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setAddingGuest(true)}
                  className="w-full h-12 rounded-xl flex items-center justify-center gap-2 font-bold text-sm"
                  style={{ background: 'rgba(41,121,255,0.1)', border: '1.5px dashed rgba(41,121,255,0.35)', color: '#2979FF' }}
                >
                  <UserPlus size={16} /> Add Player from This Device
                </motion.button>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* ── Host: fill an empty seat with a bot ── */}
        {isHost && room?.allowBots && canAddSeat && (
          <motion.div {...fadeUp(0.18)}>
            <AnimatePresence mode="wait">
              {addingBot ? (
                <motion.div
                  key="bot-form"
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="rounded-2xl p-4 space-y-3"
                  style={{ background: 'rgba(0,200,83,0.05)', border: '1.5px solid rgba(0,200,83,0.25)' }}
                >
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#3a5070' }}>
                    Bot difficulty
                  </p>
                  <div className="flex gap-2">
                    {BOT_DIFFICULTIES.map(d => (
                      <button
                        key={d.value}
                        onClick={() => { addBotToRoom(d.value); setAddingBot(false); }}
                        className="flex-1 h-11 rounded-xl font-bold text-sm"
                        style={{ background: 'rgba(0,200,83,0.14)', border: '1.5px solid rgba(0,200,83,0.4)', color: '#00C853' }}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setAddingBot(false)}
                    className="w-full h-9 rounded-xl font-bold text-xs"
                    style={{ color: '#3a5070' }}
                  >
                    Cancel
                  </button>
                </motion.div>
              ) : (
                <motion.button
                  key="bot-button"
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setAddingBot(true)}
                  className="w-full h-12 rounded-xl flex items-center justify-center gap-2 font-bold text-sm"
                  style={{ background: 'rgba(0,200,83,0.08)', border: '1.5px dashed rgba(0,200,83,0.3)', color: '#00C853' }}
                >
                  <Bot size={16} /> Fill Seat with Bot
                </motion.button>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      {/* ── Fixed bottom CTA ── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-20 p-4 flex justify-center"
        style={{ background: 'linear-gradient(to top, #080c18 65%, transparent)' }}
      >
        <div className="w-full max-w-md">
          {isGameInProgress ? (
            <motion.button
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
              className="w-full h-16 rounded-2xl flex items-center justify-center gap-2 text-lg font-black text-white"
              style={{ background: 'linear-gradient(135deg, #2979FF 0%, #00B4D8 100%)', boxShadow: '0 8px 32px #2979FF45' }}
              onClick={handleReconnect}
            >
              <RotateCcw size={20} /> Reconnect to Game
            </motion.button>
          ) : isHost ? (
            <motion.button
              whileHover={lobbyPlayers.length >= 2 ? { scale: 1.02 } : {}}
              whileTap={lobbyPlayers.length >= 2 ? { scale: 0.97 } : {}}
              disabled={lobbyPlayers.length < 2}
              className="w-full h-16 rounded-2xl flex items-center justify-center gap-2 text-lg font-black text-white"
              style={{
                background: lobbyPlayers.length >= 2
                  ? 'linear-gradient(135deg, #FF1744 0%, #FF6B35 100%)'
                  : 'rgba(255,255,255,0.06)',
                boxShadow: lobbyPlayers.length >= 2 ? '0 8px 32px #FF174445' : 'none',
                color: lobbyPlayers.length >= 2 ? 'white' : '#3a5070',
              }}
              onClick={() => startOnlineGame(teamMode)}
            >
              <Play fill="currentColor" size={19} />
              {lobbyPlayers.length >= 2 ? 'Start Game' : 'Need 2+ Players'}
            </motion.button>
          ) : (
            <div
              className="text-center p-5 rounded-2xl flex flex-col items-center gap-3"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <div
                className="w-7 h-7 rounded-full animate-spin"
                style={{ border: '3px solid rgba(41,121,255,0.25)', borderTopColor: '#2979FF' }}
              />
              <span className="font-semibold text-sm" style={{ color: '#8baac8' }}>Waiting for host to start…</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
