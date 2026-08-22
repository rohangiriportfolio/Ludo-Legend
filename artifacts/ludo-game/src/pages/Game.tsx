import React, { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useGameEngine } from '@/contexts/GameContext';
import { usePlayer } from '@/contexts/PlayerContext';
import { Board } from '@/components/Board';
import { PlayerDicePanel } from '@/components/Dice';
import { Button } from '@/components/ui/button';
import { LogOut, Ban, Volume2, VolumeX, Pause } from 'lucide-react';
import { sound } from '@/lib/sound';
import { useToast } from '@/hooks/use-toast';
import { type PlayerColor } from '@/utils/ludo';
import { useIsMobile } from '@/hooks/use-mobile';
import { motion, AnimatePresence } from 'framer-motion';
import { EndGameOverlay } from '@/components/EndGameOverlay';

// Fixed corner positions: top-left=red, top-right=green, bottom-left=blue, bottom-right=yellow
const CORNER_COLORS: PlayerColor[] = ['red', 'green', 'blue', 'yellow'];

export default function Game() {
  const [, setLocation] = useLocation();
  const {
    mode, status, players, currentTurnId,
    turnTimeRemaining, winnerId, rankings, leaveGame,
    diceValue, diceRolling, rollDice, teamMode,
    isHost, cancelMatch, matchCancelled, clearMatchCancelled, showGameStart,
  } = useGameEngine();
  const { player: localPlayer } = usePlayer();
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const [muted, setMuted] = useState(() => sound.isMuted());

  // Dice panel size: 68px desktop (−10%), 60px mobile
  const panelSize = isMobile ? 60 : 68;
  // Invisible spacer — same dimensions so absent players don't shift layout
  const spacer = <div key="spacer" style={{ width: panelSize, height: panelSize, flexShrink: 0 }} />;

  useEffect(() => {
    if (status === 'waiting' && mode === null) setLocation('/');
  }, [status, mode, setLocation]);

  useEffect(() => {
    if (!matchCancelled) return;
    toast({
      title: matchCancelled.reason === 'host_cancelled' ? 'Match cancelled' : 'Match ended',
      description: matchCancelled.reason === 'host_cancelled'
        ? 'The host cancelled this match.'
        : 'Everyone left the match, so it was closed.',
    });
    clearMatchCancelled();
    leaveGame();
    setLocation('/');
  }, [matchCancelled, clearMatchCancelled, leaveGame, setLocation, toast]);

  const handleQuit = () => {
    if (confirm('Are you sure you want to quit?')) {
      leaveGame();
      setLocation('/');
    }
  };

  const handlePause = () => {
    // Leaving mid-match (status isn't 'finished' yet) already keeps the
    // match snapshot resumable — same mechanism the "Resume Match" banner
    // on Home reads from. No confirmation needed since nothing is lost.
    leaveGame();
    setLocation('/');
  };

  const handleCancelMatch = () => {
    if (confirm('Cancel this match for everyone? This ends the game immediately for all players.')) {
      cancelMatch();
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const playerByColor = (color: PlayerColor) =>
    players.find(p => p.color === color);

  const isActiveTurn = (color: PlayerColor) =>
    playerByColor(color)?.id === currentTurnId;

  const canRollForColor = (color: PlayerColor) => {
    const p = playerByColor(color);
    if (!p) return false;
    return p.id === currentTurnId && p.id === localPlayer?.id &&
      diceValue === null && !diceRolling;
  };

  /**
   * Returns a PlayerDicePanel if this color has a player, otherwise a same-sized
   * invisible spacer — so absent slots never shift the positions of other panels.
   */
  const slot = (color: PlayerColor) => {
    const p = playerByColor(color);
    if (!p) return <div key={`spacer-${color}`} style={{ width: panelSize, height: panelSize, flexShrink: 0 }} />;
    return (
      <PlayerDicePanel
        key={color}
        color={color}
        panelSize={panelSize}
        isActive={isActiveTurn(color)}
        diceValue={isActiveTurn(color) ? diceValue : null}
        diceRolling={isActiveTurn(color) ? diceRolling : false}
        timerValue={isActiveTurn(color) ? turnTimeRemaining : 30}
        canRoll={canRollForColor(color)}
        onRoll={rollDice}
      />
    );
  };

  const [red, green, blue, yellow] = CORNER_COLORS;

  // ── Game screen ───────────────────────────────────────────────────────────
  return (
    <div className="h-[100dvh] overflow-hidden font-sans flex flex-col" style={{ background: 'linear-gradient(135deg, #080c18 0%, #0d1425 50%, #080c18 100%)' }}>

      {/* "Game Start!" banner — prominent, non-interactive, plays once as the match begins */}
      <AnimatePresence>
        {showGameStart && (
          <motion.div
            key="game-start-banner"
            className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.4 } }}
          >
            <motion.div
              className="absolute inset-0"
              style={{ background: 'radial-gradient(ellipse at center, rgba(255,214,0,0.22) 0%, rgba(8,12,24,0.72) 68%)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 1, 0.85] }}
              transition={{ duration: 2.2, times: [0, 0.15, 0.8, 1] }}
            />
            <div className="relative flex flex-col items-center gap-3">
              <motion.h1
                initial={{ scale: 0.25, opacity: 0, rotate: -8 }}
                animate={{
                  scale: [0.25, 1.25, 1, 1.05, 1],
                  opacity: 1,
                  rotate: 0,
                }}
                exit={{ scale: 1.35, opacity: 0 }}
                transition={{ duration: 1.4, times: [0, 0.4, 0.55, 0.78, 1], ease: 'easeOut' }}
                className="text-6xl sm:text-8xl font-black tracking-tight text-center px-6"
                style={{
                  color: '#FFD600',
                  textShadow: '0 0 50px #FFD600b0, 0 0 100px #FFD60060, 0 4px 0 rgba(0,0,0,0.4)',
                  WebkitTextStroke: '2px rgba(0,0,0,0.25)',
                }}
              >
                <motion.span
                  animate={{ opacity: [1, 0.75, 1] }}
                  transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut', delay: 1.4 }}
                  className="inline-block"
                >
                  GAME START!
                </motion.span>
              </motion.h1>

              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 220, opacity: 1 }}
                transition={{ delay: 0.55, duration: 0.5, ease: 'easeOut' }}
                className="h-1 rounded-full"
                style={{ background: 'linear-gradient(90deg, transparent, #FFD600, transparent)' }}
              />

              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7, duration: 0.4 }}
                className="text-lg sm:text-2xl font-bold tracking-[0.2em] uppercase"
                style={{ color: 'rgba(255,255,255,0.85)' }}
              >
                Good luck!
              </motion.p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* End-game podium overlay — sits on top of the (still-visible, dimmed)
          board instead of replacing the whole screen. */}
      <AnimatePresence>
        {status === 'finished' && (
          <EndGameOverlay
            players={players}
            rankings={rankings}
            winnerId={winnerId}
            teamMode={teamMode}
            onClose={() => { leaveGame(); setLocation('/'); }}
          />
        )}
      </AnimatePresence>

      {/* Minimal top bar */}
      <div className="flex justify-between items-center px-4 py-1.5 z-20 shrink-0" style={{ background: 'rgba(8,12,24,0.75)', borderBottom: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(8px)' }}>
        <h1 className="text-xl font-black tracking-tight">
          <span className="text-white">LUDO </span>
          <span style={{ color: '#FFD600', textShadow: '0 0 24px #FFD60060' }}>LEGEND</span>
        </h1>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="text-white/50 hover:text-yellow-300 hover:bg-yellow-400/10"
            onClick={() => {
              const next = sound.toggleMuted();
              setMuted(next);
              if (!next) sound.startBGM();
            }}
            title={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? <VolumeX /> : <Volume2 />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-white/50 hover:text-blue-300 hover:bg-blue-400/10"
            onClick={handlePause}
            title="Pause — resume later from Home"
          >
            <Pause />
          </Button>
          {mode === 'online' && isHost && (
            <Button
              variant="ghost"
              size="icon"
              className="text-white/50 hover:text-red-400 hover:bg-red-500/10"
              onClick={handleCancelMatch}
              title="Cancel match for everyone"
            >
              <Ban />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="text-white/50 hover:text-red-400 hover:bg-red-500/10"
            onClick={handleQuit}
          >
            <LogOut />
          </Button>
        </div>
      </div>

      {/* ── Layout area — fills remaining height exactly ──────────────────── */}
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-2 sm:p-4 gap-2 relative overflow-hidden">
        {/* Corner glow orbs matching landing page */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div style={{ position:'absolute', top:'-6%',  left:'-6%',  width:'40%', height:'40%', background:'#FF174422', borderRadius:'50%', filter:'blur(80px)' }} />
          <div style={{ position:'absolute', top:'-6%',  right:'-6%', width:'40%', height:'40%', background:'#00C85322', borderRadius:'50%', filter:'blur(80px)' }} />
          <div style={{ position:'absolute', bottom:'-6%', left:'-6%', width:'40%', height:'40%', background:'#2979FF22', borderRadius:'50%', filter:'blur(80px)' }} />
          <div style={{ position:'absolute', bottom:'-6%', right:'-6%',width:'40%', height:'40%', background:'#FFD60022', borderRadius:'50%', filter:'blur(80px)' }} />
        </div>
        {/* Dot grid */}
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.035) 1px, transparent 1px)', backgroundSize: '26px 26px' }} />

        {/* ── MOBILE layout (< md) ─────────────────────────────────────────
            Top row + board + bottom row, all centered.                      */}

        {/* Mobile top row: red (left) · green (right) */}
        <div className="flex w-full justify-between md:hidden relative z-10"
          style={{ maxWidth: `calc(100vw - 1rem)` }}>
          {slot(red)}
          {slot(green)}
        </div>

        {/* ── DESKTOP + MOBILE shared: center row with board ─────────────── */}
        <div className="flex items-stretch gap-2 sm:gap-3 md:gap-4 relative z-10 w-full justify-center min-h-0">

          {/* Desktop left column: red (top) · blue (bottom) */}
          <div className="hidden md:flex flex-col justify-between shrink-0">
            {slot(red)}
            {slot(blue)}
          </div>

          {/* Board container
              max-width caps the square board so it never overflows vertically.
              Mobile: subtract header + padding + top-dice-row + bottom-dice-row + gaps (~200px).
              Desktop: only subtract header + padding (~88px), dice are beside the board. */}
          <div
            className="flex items-center justify-center flex-1 min-w-0 min-h-0"
            style={{ maxWidth: isMobile
              ? 'min(100%, calc(100dvh - 200px))'
              : 'min(100%, calc(100dvh - 88px))' }}
          >
            <Board />
          </div>

          {/* Desktop right column: green (top) · yellow (bottom) */}
          <div className="hidden md:flex flex-col justify-between shrink-0">
            {slot(green)}
            {slot(yellow)}
          </div>

        </div>

        {/* Mobile bottom row: blue (left) · yellow (right) */}
        <div className="flex w-full justify-between md:hidden relative z-10"
          style={{ maxWidth: `calc(100vw - 1rem)` }}>
          {slot(blue)}
          {slot(yellow)}
        </div>

      </div>
    </div>
  );
}
