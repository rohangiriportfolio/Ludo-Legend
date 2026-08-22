import React, { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'wouter';
import { usePlayer } from '@/contexts/PlayerContext';
import { useAuth } from '@/contexts/AuthContext';
import { useGameEngine } from '@/contexts/GameContext';
import { useGetPlayerStats, useGetPlayer } from '@workspace/api-client-react';
import { motion } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { ChevronLeft, Save, RefreshCw, Swords, Trophy, Flame, Target, LogIn, LogOut, RotateCcw, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getGuestStats, type GuestStats } from '@/lib/matchStorage';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';

function fadeUp(delay = 0) {
  return {
    initial: { opacity: 0, y: 22 },
    animate: { opacity: 1, y: 0 },
    transition: { delay, duration: 0.52, ease: 'easeOut' as const },
  };
}

export default function Profile() {
  const [, setLocation] = useLocation();
  const { player, updateLocalPlayer, isGuest } = usePlayer();
  const { isAuthenticated, signOut } = useAuth();
  const { resumableMatch, resumeOfflineMatch, dismissResumableMatch } = useGameEngine();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: serverPlayer, refetch } = useGetPlayer(player?.id || '', { query: { enabled: !!player?.id && !isGuest } } as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: serverStats } = useGetPlayerStats(player?.id || '', { query: { enabled: !!player?.id && !isGuest } } as any);

  const [guestStats, setGuestStats] = useState<GuestStats | null>(null);
  useEffect(() => {
    if (isGuest) setGuestStats(getGuestStats());
  }, [isGuest, player?.id]);

  // Unified stats view — MongoDB-backed for signed-in players, localStorage for guests.
  const stats = isGuest ? guestStats : serverStats;

  const [name,  setName]  = useState(player?.name || '');
  const [color, setColor] = useState(player?.avatarColor || '#ccc');
  const [emoji, setEmoji] = useState(player?.avatarEmoji || '👤');
  const { toast } = useToast();

  useEffect(() => {
    if (serverPlayer) {
      if (
        serverPlayer.name !== player?.name ||
        serverPlayer.avatarColor !== player?.avatarColor ||
        serverPlayer.avatarEmoji !== player?.avatarEmoji
      ) {
        updateLocalPlayer({ name: serverPlayer.name, avatarColor: serverPlayer.avatarColor, avatarEmoji: serverPlayer.avatarEmoji || undefined });
        setName(serverPlayer.name);
        setColor(serverPlayer.avatarColor);
        setEmoji(serverPlayer.avatarEmoji || '👤');
      }
    }
  }, [serverPlayer]);

  const handleSave = async () => {
    await updateLocalPlayer({ name, avatarColor: color, avatarEmoji: emoji });
    toast({ title: 'Profile Updated', description: 'Your identity has been saved successfully.' });
  };

  const winRate = (stats?.gamesPlayed ?? 0) > 0 ? Math.round(((stats?.gamesWon ?? 0) / (stats?.gamesPlayed ?? 1)) * 100) : 0;

  return (
    <div
      className="min-h-screen w-full flex flex-col relative overflow-hidden"
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
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage:'radial-gradient(rgba(255,255,255,0.035) 1px, transparent 1px)', backgroundSize:'26px 26px' }} />

      {/* Inner content */}
      <div className="relative z-10 w-full max-w-5xl mx-auto px-6 py-8">

        {/* Header */}
        <motion.div {...fadeUp(0)} className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setLocation('/')}
              className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors"
              style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.09)' }}
            >
              <ChevronLeft size={20} className="text-white/70" />
            </button>
            <div>
              <h1 className="text-3xl font-black tracking-tight leading-none">
                <span className="text-white">Player </span>
                <span style={{ color:'#FFD600', textShadow:'0 0 36px #FFD60060' }}>Profile</span>
              </h1>
              <p className="text-xs font-semibold mt-0.5" style={{ color:'#4e6080' }}>Manage your identity & stats</p>
            </div>
          </div>
          <button
            onClick={() => { if (isGuest) setGuestStats(getGuestStats()); else refetch(); }}
            title="Sync with server"
            className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors"
            style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.09)' }}
          >
            <RefreshCw size={16} className="text-white/40" />
          </button>
        </motion.div>

        {/* Two-column desktop layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">

          {/* LEFT — Identity card */}
          <motion.div {...fadeUp(0.12)}>
            <div
              className="rounded-2xl p-8 flex flex-col items-center relative overflow-hidden"
              style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.09)', backdropFilter:'blur(14px)' }}
            >
              {/* Top accent line */}
              <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-2xl" style={{ background:'linear-gradient(90deg,transparent,#FFD600,transparent)' }} />

              {/* Avatar */}
              <div className="relative mb-6">
                <div
                  className="w-32 h-32 rounded-full flex items-center justify-center text-6xl border-4"
                  style={{ backgroundColor: color, borderColor:'rgba(255,255,255,0.18)', boxShadow:`0 12px 40px ${color}50` }}
                >
                  {emoji}
                </div>
                {/* Win rate ring label */}
                <div
                  className="absolute -bottom-2 -right-2 w-10 h-10 rounded-full flex items-center justify-center text-xs font-black border-2"
                  style={{ background:'#0d1425', borderColor:'#FFD600', color:'#FFD600' }}
                >
                  {winRate}%
                </div>
              </div>

              <p className="text-xs font-bold uppercase tracking-widest mb-6" style={{ color:'#4e6080' }}>
                {isGuest ? 'Guest Account' : `Google Account · ID: ${player?.id?.slice(0, 8)}…`}
              </p>

              <div className="w-full space-y-4">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block" style={{ color:'#4e6080' }}>Display Name</label>
                  <Input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="h-12 text-base font-bold border-0"
                    style={{ background:'rgba(255,255,255,0.07)', color:'#fff', caretColor:'#FFD600' }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block" style={{ color:'#4e6080' }}>Avatar Color</label>
                    <Input
                      type="color"
                      value={color}
                      onChange={e => setColor(e.target.value)}
                      className="h-12 w-full p-1 border-0 cursor-pointer rounded-xl"
                      style={{ background:'rgba(255,255,255,0.07)' }}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block" style={{ color:'#4e6080' }}>Emoji</label>
                    <Input
                      value={emoji}
                      onChange={e => setEmoji(e.target.value)}
                      maxLength={2}
                      className="h-12 text-2xl text-center border-0"
                      style={{ background:'rgba(255,255,255,0.07)', color:'#fff' }}
                    />
                  </div>
                </div>

                <button
                  onClick={handleSave}
                  className="w-full h-12 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all"
                  style={{ background:'linear-gradient(135deg,#FFD600,#FF9800)', color:'#080c18', boxShadow:'0 6px 24px #FFD60040' }}
                >
                  <Save size={17} /> Save Identity
                </button>
              </div>

              {/* Account linking */}
              <div className="w-full mt-5 pt-5" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                {isAuthenticated ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldCheck size={16} style={{ color: '#00C853' }} />
                      <span className="text-xs font-bold" style={{ color: '#00C853' }}>Signed in with Google</span>
                    </div>
                    <button
                      onClick={signOut}
                      className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full"
                      style={{ background: 'rgba(255,255,255,0.06)', color: '#4e6080' }}
                    >
                      <LogOut size={12} /> Sign out
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2.5">
                    <p className="text-xs font-semibold text-center" style={{ color: '#4e6080' }}>
                      Sign in to save your profile and stats to the cloud, unlock the leaderboard, and resume matches on any device.
                    </p>
                    <GoogleSignInButton />
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          {/* RIGHT — Stats */}
          <motion.div {...fadeUp(0.2)} className="space-y-4">

            {/* Win rate hero */}
            <div
              className="rounded-2xl p-6 flex items-center gap-5 relative overflow-hidden"
              style={{ background:'rgba(255,214,0,0.07)', border:'1px solid rgba(255,214,0,0.20)', backdropFilter:'blur(14px)' }}
            >
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0" style={{ background:'rgba(255,214,0,0.12)' }}>
                <Trophy size={28} style={{ color:'#FFD600', filter:'drop-shadow(0 0 10px #FFD60070)' }} />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-widest mb-0.5" style={{ color:'#FFD60099' }}>Win Rate</p>
                <p className="text-5xl font-black leading-none" style={{ color:'#FFD600', textShadow:'0 0 30px #FFD60050' }}>{winRate}%</p>
                <p className="text-xs font-semibold mt-1" style={{ color:'#4e6080' }}>{stats?.gamesWon ?? 0} wins out of {stats?.gamesPlayed ?? 0} games</p>
              </div>
            </div>

            {/* Stat grid */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon:<Swords size={20} />,  label:'Games Played',  value: stats?.gamesPlayed ?? 0,      color:'#2979FF' },
                { icon:<Trophy size={20} />,  label:'Games Won',     value: stats?.gamesWon ?? 0,         color:'#00C853' },
                { icon:<Target size={20} />,  label:'Tokens Cut',    value: stats?.totalTokensCut ?? 0,   color:'#FF1744' },
                { icon:<Flame size={20} />,   label:'Best Streak',   value: stats?.longestWinStreak ?? 0, color:'#FF9800' },
              ].map(stat => (
                <div
                  key={stat.label}
                  className="rounded-2xl p-5 flex flex-col gap-3"
                  style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', backdropFilter:'blur(14px)' }}
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background:`${stat.color}18`, color: stat.color }}>
                    {stat.icon}
                  </div>
                  <div>
                    <p className="text-3xl font-black text-white leading-none">{stat.value}</p>
                    <p className="text-[11px] font-bold uppercase tracking-wider mt-1" style={{ color:'#4e6080' }}>{stat.label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Current streak */}
            {(stats?.currentWinStreak ?? 0) > 0 && (
              <div
                className="rounded-2xl p-5 flex items-center gap-4"
                style={{ background:'rgba(255,152,0,0.08)', border:'1px solid rgba(255,152,0,0.20)', backdropFilter:'blur(14px)' }}
              >
                <div className="text-3xl">🔥</div>
                <div>
                  <p className="font-black text-white text-lg leading-none">{stats?.currentWinStreak} game win streak</p>
                  <p className="text-xs font-semibold mt-0.5" style={{ color:'#4e6080' }}>Keep it going!</p>
                </div>
              </div>
            )}

            {/* Resumable match */}
            {resumableMatch && (
              <div
                className="rounded-2xl p-5 flex items-center justify-between gap-4"
                style={{ background:'rgba(0,200,83,0.08)', border:'1px solid rgba(0,200,83,0.22)', backdropFilter:'blur(14px)' }}
              >
                <div className="flex items-center gap-3">
                  <RotateCcw size={22} style={{ color: '#00C853' }} />
                  <div>
                    <p className="font-black text-white text-sm leading-none">Unfinished match</p>
                    <p className="text-xs font-semibold mt-1" style={{ color:'#4e6080' }}>
                      {resumableMatch.mode === 'offline' ? 'Offline pass-and-play' : `Online room ${resumableMatch.roomCode}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => { if (resumableMatch.mode === 'offline') { if (resumeOfflineMatch()) setLocation('/game'); } else if (resumableMatch.roomCode) { setLocation(`/room/${resumableMatch.roomCode}`); } }}
                    className="text-xs font-bold px-3 py-1.5 rounded-full"
                    style={{ background:'#00C853', color:'#080c18' }}
                  >
                    Resume
                  </button>
                  <button
                    onClick={dismissResumableMatch}
                    className="text-xs font-bold px-2 py-1.5 rounded-full"
                    style={{ color:'#4e6080' }}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {/* Recent games (guest history) */}
            {isGuest && guestStats && guestStats.recentGames.length > 0 && (
              <div
                className="rounded-2xl p-5"
                style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', backdropFilter:'blur(14px)' }}
              >
                <p className="text-xs font-black uppercase tracking-widest mb-3" style={{ color:'#4e6080' }}>Recent Games</p>
                <div className="space-y-2">
                  {guestStats.recentGames.map(g => (
                    <div key={g.id} className="flex items-center justify-between text-sm">
                      <span className="font-semibold" style={{ color: g.result === 'win' ? '#00C853' : '#FF1744' }}>
                        {g.result === 'win' ? 'Won' : 'Lost'} {g.roomCode ? `· Room ${g.roomCode}` : '· Offline'}
                      </span>
                      <span className="text-xs" style={{ color:'#4e6080' }}>{new Date(g.playedAt).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </motion.div>
        </div>
      </div>
    </div>
  );
}
