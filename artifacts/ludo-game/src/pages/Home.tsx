import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { usePlayer } from '@/contexts/PlayerContext';
import { useAuth } from '@/contexts/AuthContext';
import { useGameEngine } from '@/contexts/GameContext';
import { useHealthCheck } from '@workspace/api-client-react';
import { motion } from 'framer-motion';
import { Play, Users, Trophy, Settings, ChevronRight, Wifi, WifiOff, Volume2, VolumeX, LogIn, LogOut, RotateCcw } from 'lucide-react';
import { sound } from '@/lib/sound';
import { LudoLogo } from '@/components/LudoLogo';
import { LegendTitle } from '@/components/LegendTitle';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';


function fadeUp(delay = 0) {
  return {
    initial: { opacity: 0, y: 22 },
    animate: { opacity: 1, y: 0 },
    transition: { delay, duration: 0.52, ease: 'easeOut' as const },
  };
}

export default function Home() {
  const { player, isLoading } = usePlayer();
  const { isAuthenticated, isLoading: authLoading, signOut } = useAuth();
  const { resumableMatch, resumeOfflineMatch, dismissResumableMatch } = useGameEngine();
  const { data: health } = useHealthCheck();
  const isOnline = health?.status === 'ok';
  const [muted, setMuted] = useState(() => sound.isMuted());
  const [, navigate] = useLocation();
  const [showSignIn, setShowSignIn] = useState(false);

  const toggleSound = () => {
    const next = sound.toggleMuted();
    setMuted(next);
    if (!next) sound.startBGM();
  };

  const handleResume = () => {
    if (!resumableMatch) return;
    if (resumableMatch.mode === 'offline') {
      if (resumeOfflineMatch()) navigate('/game');
    } else if (resumableMatch.roomCode) {
      navigate(`/room/${resumableMatch.roomCode}`);
    }
  };

  if (isLoading || authLoading) return null;

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #080c18 0%, #0d1425 50%, #080c18 100%)' }}
    >
      {/* Corner glow orbs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div style={{ position:'absolute', top:'-6%',  left:'-6%',  width:'40%', height:'40%', background:'#FF174422', borderRadius:'50%', filter:'blur(80px)' }} />
        <div style={{ position:'absolute', top:'-6%',  right:'-6%', width:'40%', height:'40%', background:'#00C85322', borderRadius:'50%', filter:'blur(80px)' }} />
        <div style={{ position:'absolute', bottom:'-6%', left:'-6%', width:'40%', height:'40%', background:'#2979FF22', borderRadius:'50%', filter:'blur(80px)' }} />
        <div style={{ position:'absolute', bottom:'-6%', right:'-6%',width:'40%', height:'40%', background:'#FFD60022', borderRadius:'50%', filter:'blur(80px)' }} />
      </div>

      {/* Dot grid */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: 'radial-gradient(rgba(255,255,255,0.035) 1px, transparent 1px)',
        backgroundSize: '26px 26px',
      }} />

      {/* Sound toggle */}
      <motion.button
        {...fadeUp(0.05)}
        onClick={toggleSound}
        className="absolute top-4 right-32 flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full z-20"
        style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.09)',
          backdropFilter: 'blur(10px)',
          color: muted ? '#4e6080' : '#FFD600',
        }}
      >
        {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
      </motion.button>

      {/* Account status / sign-in */}
      <motion.div {...fadeUp(0.05)} className="absolute top-4 left-4 z-20">
        {isAuthenticated ? (
          <button
            onClick={signOut}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.09)',
              backdropFilter: 'blur(10px)',
              color: '#00C853',
            }}
          >
            <LogOut size={11} />
            Sign out
          </button>
        ) : (
          <div className="relative">
            <button
              onClick={() => setShowSignIn(v => !v)}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.09)',
                backdropFilter: 'blur(10px)',
                color: '#4e6080',
              }}
            >
              <LogIn size={11} />
              Guest
            </button>
            {showSignIn && (
              <div
                className="absolute top-full left-0 mt-2 p-3 rounded-2xl"
                style={{ background: 'rgba(10,14,26,0.97)', border: '1px solid rgba(255,255,255,0.09)', backdropFilter: 'blur(14px)' }}
              >
                <GoogleSignInButton />
              </div>
            )}
          </div>
        )}
      </motion.div>

      {/* Server status */}
      <motion.div
        {...fadeUp(0.05)}
        className="absolute top-4 right-4 flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full z-20"
        style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.09)',
          backdropFilter: 'blur(10px)',
          color: isOnline ? '#00C853' : '#FF1744',
        }}
      >
        {isOnline
          ? <><Wifi size={11} /><span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />Online</>
          : <><WifiOff size={11} />Offline</>
        }
      </motion.div>

      <div className="relative z-10 w-full max-w-sm space-y-5">

        {/* ── Logo ── */}
        <motion.div {...fadeUp(0)} className="flex flex-col items-center gap-4">
          <LudoLogo size={230} />

          <div className="text-center">
            <LegendTitle className="text-4xl sm:text-5xl" crownSize={20} />
            <p className="mt-2 font-medium" style={{ color: '#4e6080', fontSize: '0.95rem' }}>
              The Ultimate Board Experience
            </p>
          </div>
        </motion.div>

        {/* ── Player card ── */}
        <motion.div {...fadeUp(0.15)}>
          <Link href="/profile">
            <motion.div
              className="flex items-center justify-between p-4 rounded-2xl cursor-pointer"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.09)',
                backdropFilter: 'blur(14px)',
              }}
              whileHover={{ scale: 1.015, background: 'rgba(255,255,255,0.08)' }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="flex items-center gap-3.5">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-2xl border-2 shrink-0"
                  style={{ backgroundColor: player?.avatarColor ?? '#1e2d40', borderColor: 'rgba(255,255,255,0.18)' }}
                >
                  {player?.avatarEmoji ?? '👤'}
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#3a5070' }}>
                    Welcome back
                  </p>
                  <p className="font-bold text-lg text-white leading-tight">{player?.name}</p>
                </div>
              </div>
              <Settings size={17} style={{ color: '#2d3d55' }} />
            </motion.div>
          </Link>
        </motion.div>

        {/* ── Resume unfinished match ── */}
        {resumableMatch && (
          <motion.div {...fadeUp(0.2)}>
            <motion.div
              className="flex items-center justify-between p-3.5 rounded-2xl cursor-pointer"
              style={{
                background: 'rgba(0,200,83,0.08)',
                border: '1px solid rgba(0,200,83,0.28)',
                backdropFilter: 'blur(14px)',
              }}
              onClick={handleResume}
              whileHover={{ scale: 1.015 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(0,200,83,0.15)' }}>
                  <RotateCcw size={15} style={{ color: '#00C853' }} />
                </span>
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#00C853' }}>Unfinished match</p>
                  <p className="font-bold text-sm text-white leading-tight">Tap to resume</p>
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); dismissResumableMatch(); }}
                className="text-xs font-bold px-2.5 py-1 rounded-full"
                style={{ color: '#4e6080' }}
              >
                Dismiss
              </button>
            </motion.div>
          </motion.div>
        )}

        {/* ── Action buttons ── */}
        <motion.div {...fadeUp(0.25)} className="space-y-3">

          {/* Play Offline */}
          <Link href="/offline" className="block">
            <motion.div
              className="w-full h-16 rounded-2xl flex items-center justify-between px-5 cursor-pointer font-bold text-lg text-white"
              style={{
                background: 'linear-gradient(135deg, #FF1744 0%, #FF6B35 100%)',
                boxShadow: '0 8px 28px #FF174435',
              }}
              whileHover={{ scale: 1.02, boxShadow: '0 12px 38px #FF174458' }}
              whileTap={{ scale: 0.98 }}
            >
              <span className="flex items-center gap-3">
                <span
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.18)' }}
                >
                  <Play fill="white" size={15} />
                </span>
                Play Offline
              </span>
              <ChevronRight size={20} style={{ opacity: 0.65 }} />
            </motion.div>
          </Link>

          {/* Play Online */}
          <Link href="/online" className="block">
            <motion.div
              className="w-full h-16 rounded-2xl flex items-center justify-between px-5 cursor-pointer font-bold text-lg text-white"
              style={{
                background: 'linear-gradient(135deg, #2979FF 0%, #00B4D8 100%)',
                boxShadow: '0 8px 28px #2979FF35',
              }}
              whileHover={{ scale: 1.02, boxShadow: '0 12px 38px #2979FF58' }}
              whileTap={{ scale: 0.98 }}
            >
              <span className="flex items-center gap-3">
                <span
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.18)' }}
                >
                  <Users size={15} />
                </span>
                Play Online
              </span>
              <ChevronRight size={20} style={{ opacity: 0.65 }} />
            </motion.div>
          </Link>

          {/* Leaderboard */}
          <Link href="/leaderboard" className="block">
            <motion.div
              className="w-full h-14 rounded-2xl flex items-center justify-between px-5 cursor-pointer font-bold tracking-wide"
              style={{
                background: 'rgba(255,214,0,0.08)',
                border: '1px solid rgba(255,214,0,0.22)',
                color: '#FFD600',
              }}
              whileHover={{ scale: 1.02, background: 'rgba(255,214,0,0.13)' }}
              whileTap={{ scale: 0.98 }}
            >
              <span className="flex items-center gap-3">
                <span
                  className="w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(255,214,0,0.15)' }}
                >
                  <Trophy fill="#FFD600" size={14} />
                </span>
                LEADERBOARD
              </span>
              <ChevronRight size={18} style={{ opacity: 0.55 }} />
            </motion.div>
          </Link>

        </motion.div>
      </div>
    </div>
  );
}
