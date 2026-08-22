import React from 'react';
import { useLocation } from 'wouter';
import { useGetLeaderboard, useGetLeaderboardSummary } from '@workspace/api-client-react';
import { useAuth } from '@/contexts/AuthContext';
import { motion } from 'framer-motion';
import { ChevronLeft, Trophy, Users, Gamepad2, Medal, Lock } from 'lucide-react';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';

function fadeUp(delay = 0) {
  return {
    initial: { opacity: 0, y: 22 },
    animate: { opacity: 1, y: 0 },
    transition: { delay, duration: 0.52, ease: 'easeOut' as const },
  };
}

const medalColor = (i: number) =>
  i === 0 ? '#FFD600' : i === 1 ? '#9CA3AF' : i === 2 ? '#CD7C2F' : 'rgba(255,255,255,0.18)';

const medalLabel = (i: number) =>
  i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;

export default function Leaderboard() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: leaderboard } = useGetLeaderboard({ limit: 50 }, { query: { enabled: isAuthenticated } } as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: summary } = useGetLeaderboardSummary({ query: { enabled: isAuthenticated } } as any);

  const top3 = leaderboard?.slice(0, 3) ?? [];
  const rest  = leaderboard?.slice(3)  ?? [];

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
      <div className="relative z-10 w-full max-w-5xl mx-auto px-6 py-8 flex flex-col flex-1">

        {/* Header */}
        <motion.div {...fadeUp(0)} className="flex items-center gap-3 mb-10">
          <button
            onClick={() => setLocation('/')}
            className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors"
            style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.09)' }}
          >
            <ChevronLeft size={20} className="text-white/70" />
          </button>
          <div>
            <h1 className="text-3xl font-black tracking-tight leading-none">
              <span className="text-white">Global </span>
              <span style={{ color:'#FFD600', textShadow:'0 0 36px #FFD60060' }}>Rankings</span>
            </h1>
            <p className="text-xs font-semibold mt-0.5" style={{ color:'#4e6080' }}>Top players this season</p>
          </div>
        </motion.div>

        {/* Summary stats */}
        {!isAuthenticated ? (
          !authLoading && (
            <motion.div {...fadeUp(0.15)} className="flex-1 flex flex-col items-center justify-center gap-5 text-center px-6">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(255,214,0,0.1)' }}>
                <Lock size={28} style={{ color: '#FFD600' }} />
              </div>
              <div>
                <p className="font-black text-white text-lg">Leaderboard Locked</p>
                <p className="text-sm font-semibold mt-1 max-w-xs" style={{ color: '#4e6080' }}>
                  Login with Google to access Leaderboard
                </p>
              </div>
              <GoogleSignInButton />
            </motion.div>
          )
        ) : (
        <>
        <motion.div {...fadeUp(0.1)} className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-10">
          {[
            { icon: <Gamepad2 size={18} />, label:'Total Games', value: summary?.totalGamesPlayed ?? 0, color:'#2979FF' },
            { icon: <Users size={18} />,    label:'Active Players', value: summary?.activePlayers ?? 0, color:'#00C853' },
            { icon: <Trophy size={18} />,   label:'On Leaderboard', value: leaderboard?.length ?? 0,  color:'#FFD600' },
          ].map(stat => (
            <div
              key={stat.label}
              className="rounded-2xl p-5 flex items-center gap-4"
              style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.09)', backdropFilter:'blur(14px)' }}
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background:`${stat.color}18`, color: stat.color }}>
                {stat.icon}
              </div>
              <div>
                <p className="text-2xl font-black text-white">{stat.value}</p>
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color:'#4e6080' }}>{stat.label}</p>
              </div>
            </div>
          ))}
        </motion.div>

        {/* Podium — top 3 */}
        {top3.length > 0 && (
          <motion.div {...fadeUp(0.18)} className="grid grid-cols-3 gap-3 mb-8">
            {top3.map((entry, i) => (
              <div
                key={entry.playerId}
                className="rounded-2xl p-5 flex flex-col items-center text-center relative overflow-hidden"
                style={{
                  background: i === 0 ? 'rgba(255,214,0,0.07)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${i === 0 ? 'rgba(255,214,0,0.25)' : 'rgba(255,255,255,0.08)'}`,
                  backdropFilter:'blur(14px)',
                }}
              >
                {i === 0 && (
                  <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-2xl" style={{ background:'linear-gradient(90deg,transparent,#FFD600,transparent)' }} />
                )}
                <div className="text-2xl mb-2">{medalLabel(i)}</div>
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center text-2xl border-2 mb-3"
                  style={{ backgroundColor: entry.avatarColor || '#1e2d40', borderColor: medalColor(i) }}
                >
                  {entry.avatarEmoji || '👤'}
                </div>
                <p className="font-black text-white text-sm leading-tight truncate w-full">{entry.playerName}</p>
                <p className="font-black text-xl mt-1" style={{ color: medalColor(i) }}>{Math.round(entry.winRate * 100)}%</p>
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color:'#4e6080' }}>{entry.gamesWon} wins</p>
              </div>
            ))}
          </motion.div>
        )}

        {/* Rankings table */}
        <motion.div {...fadeUp(0.26)} className="flex-1 rounded-2xl overflow-hidden" style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', backdropFilter:'blur(12px)' }}>
          {/* Table header */}
          {rest.length > 0 && (
            <div className="grid grid-cols-12 gap-3 px-5 py-3 text-[10px] font-black uppercase tracking-widest" style={{ color:'#4e6080', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
              <span className="col-span-1 text-center">#</span>
              <span className="col-span-5">Player</span>
              <span className="col-span-2 text-center hidden md:block">Games</span>
              <span className="col-span-2 text-center hidden md:block">Wins</span>
              <span className="col-span-2 text-center md:col-span-2 col-span-6">Win Rate</span>
            </div>
          )}

          {rest.map((entry, idx) => {
            const i = idx + 3;
            return (
              <div
                key={entry.playerId}
                className="grid grid-cols-12 gap-3 items-center px-5 py-4 transition-colors hover:bg-white/[0.03]"
                style={{ borderBottom: idx < rest.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
              >
                <span className="col-span-1 font-black text-center text-sm" style={{ color:'rgba(255,255,255,0.25)' }}>#{i + 1}</span>
                <div className="col-span-5 flex items-center gap-3 min-w-0">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-lg border shrink-0"
                    style={{ backgroundColor: entry.avatarColor || '#1e2d40', borderColor:'rgba(255,255,255,0.12)' }}
                  >
                    {entry.avatarEmoji || '👤'}
                  </div>
                  <p className="font-bold text-white text-sm truncate">{entry.playerName}</p>
                </div>
                <span className="col-span-2 text-center font-bold text-sm text-white/60 hidden md:block">{entry.gamesWon + (entry.gamesPlayed ?? 0)}</span>
                <span className="col-span-2 text-center font-bold text-sm text-white/60 hidden md:block">{entry.gamesWon}</span>
                <span className="col-span-6 md:col-span-2 text-center font-black text-base" style={{ color:'#FFD600' }}>{Math.round(entry.winRate * 100)}%</span>
              </div>
            );
          })}

          {!leaderboard?.length && (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Medal size={40} style={{ color:'#2d3d55' }} />
              <p className="font-semibold" style={{ color:'#4e6080' }}>No rankings available yet.</p>
              <p className="text-sm" style={{ color:'#2d3d55' }}>Play a game to appear on the leaderboard.</p>
            </div>
          )}
        </motion.div>
        </>
        )}

      </div>
    </div>
  );
}
