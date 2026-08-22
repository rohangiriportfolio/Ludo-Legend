import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { Input } from '@/components/ui/input';
import { useCreateRoom } from '@workspace/api-client-react';
import { usePlayer } from '@/contexts/PlayerContext';
import { useGameEngine } from '@/contexts/GameContext';
import { ChevronLeft, Plus, LogIn, Loader2, Wifi, Bot } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import { motion } from 'framer-motion';

function fadeUp(delay = 0) {
  return {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { delay, duration: 0.5, ease: 'easeOut' as const },
  };
}

export default function OnlineHub() {
  const [, setLocation] = useLocation();
  const { player } = usePlayer();
  const { connectToRoom } = useGameEngine();
  const createRoom = useCreateRoom();
  const { toast } = useToast();
  const [joinCode, setJoinCode] = useState('');
  const [allowBots, setAllowBots] = useState(true);

  const handleCreateRoom = async () => {
    try {
      const room = await createRoom.mutateAsync({
        data: {
          hostPlayerId: player!.id,
          maxPlayers: 4,
          isPrivate: true,
          allowBots,
        },
      });
      connectToRoom(room.code, player);
      setLocation(`/room/${room.code}`);
    } catch {
      toast({ title: 'Error', description: 'Failed to create room', variant: 'destructive' });
    }
  };

  const handleJoinRoom = () => {
    if (joinCode.length !== 6) {
      toast({ title: 'Invalid Code', description: 'Room code must be 6 characters', variant: 'destructive' });
      return;
    }
    connectToRoom(joinCode.toUpperCase(), player);
    setLocation(`/room/${joinCode.toUpperCase()}`);
  };

  return (
    <div
      className="min-h-screen flex flex-col relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #080c18 0%, #0d1425 50%, #080c18 100%)' }}
    >
      {/* Corner glows */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div style={{ position:'absolute', top:'-8%',  left:'-8%',  width:'38%', height:'38%', background:'#2979FF18', borderRadius:'50%', filter:'blur(80px)' }} />
        <div style={{ position:'absolute', bottom:'-8%', right:'-8%', width:'38%', height:'38%', background:'#00C85318', borderRadius:'50%', filter:'blur(80px)' }} />
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
          onClick={() => setLocation('/')}
        >
          <ChevronLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-black text-white leading-none">Online Multiplayer</h1>
          <p className="text-xs mt-0.5" style={{ color: '#3a5070' }}>Play with friends anywhere</p>
        </div>
      </div>

      <div className="relative z-10 flex-1 p-5 max-w-md w-full mx-auto space-y-4 flex flex-col justify-center">

        {/* ── Create Room card ── */}
        <motion.div
          {...fadeUp(0.05)}
          className="rounded-2xl overflow-hidden"
          style={{
            background: 'rgba(41,121,255,0.07)',
            border: '1.5px solid rgba(41,121,255,0.30)',
            boxShadow: '0 8px 40px rgba(41,121,255,0.12)',
          }}
        >
          {/* Top accent */}
          <div className="h-1" style={{ background: 'linear-gradient(90deg, #2979FF, #00B4D8)' }} />

          <div className="p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(41,121,255,0.18)', boxShadow: '0 4px 16px rgba(41,121,255,0.25)' }}
              >
                <Plus size={20} color="#2979FF" />
              </div>
              <div>
                <h2 className="font-black text-white text-lg leading-none">Create Room</h2>
                <p className="text-xs mt-0.5" style={{ color: '#3a5070' }}>Host a private match</p>
              </div>
            </div>

            <p className="text-sm leading-relaxed" style={{ color: '#4e6080' }}>
              Host a private game and share the unique 6-letter code with your friends to join.
            </p>

            <div
              className="flex items-center justify-between rounded-xl px-3.5 py-3"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#8baac8' }}>
                <Bot size={15} style={{ color: '#00C853' }} /> Allow filling empty seats with bots
              </span>
              <Switch id="allow-bots" checked={allowBots} onCheckedChange={setAllowBots} />
            </div>

            <motion.button
              className="w-full h-13 rounded-xl flex items-center justify-center gap-2 font-bold text-base text-white py-3.5"
              style={{
                background: createRoom.isPending
                  ? 'rgba(41,121,255,0.4)'
                  : 'linear-gradient(135deg, #2979FF 0%, #00B4D8 100%)',
                boxShadow: '0 6px 24px rgba(41,121,255,0.35)',
              }}
              whileHover={!createRoom.isPending ? { scale: 1.02 } : {}}
              whileTap={!createRoom.isPending ? { scale: 0.97 } : {}}
              onClick={handleCreateRoom}
              disabled={createRoom.isPending}
            >
              {createRoom.isPending ? (
                <><Loader2 size={17} className="animate-spin" /> Creating…</>
              ) : (
                <><Wifi size={17} /> Create Private Room</>
              )}
            </motion.button>
          </div>
        </motion.div>

        {/* ── OR divider ── */}
        <motion.div {...fadeUp(0.15)} className="flex items-center gap-4 px-2">
          <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
          <span className="text-xs font-black uppercase tracking-widest" style={{ color: '#2d3d55' }}>or</span>
          <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
        </motion.div>

        {/* ── Join Room card ── */}
        <motion.div
          {...fadeUp(0.2)}
          className="rounded-2xl overflow-hidden"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1.5px solid rgba(255,255,255,0.08)',
          }}
        >
          <div className="h-1" style={{ background: 'linear-gradient(90deg, #00C853, #FFD600)' }} />

          <div className="p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(0,200,83,0.12)' }}
              >
                <LogIn size={20} color="#00C853" />
              </div>
              <div>
                <h2 className="font-black text-white text-lg leading-none">Join Room</h2>
                <p className="text-xs mt-0.5" style={{ color: '#3a5070' }}>Enter a room code</p>
              </div>
            </div>

            {/* Code input */}
            <Input
              placeholder="A B C D E F"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
              className="text-center text-3xl tracking-[0.5em] font-black h-16 uppercase border-0 rounded-xl"
              style={{
                background: 'rgba(255,255,255,0.05)',
                color: '#fff',
                caretColor: '#00C853',
                boxShadow: joinCode.length === 6
                  ? '0 0 0 2px #00C853, 0 4px 20px rgba(0,200,83,0.25)'
                  : '0 0 0 1.5px rgba(255,255,255,0.10)',
              }}
              onKeyDown={e => e.key === 'Enter' && handleJoinRoom()}
            />

            <motion.button
              className="w-full h-13 rounded-xl flex items-center justify-center gap-2 font-bold text-base py-3.5"
              style={{
                background: joinCode.length === 6
                  ? 'rgba(0,200,83,0.18)'
                  : 'rgba(255,255,255,0.05)',
                border: joinCode.length === 6
                  ? '1.5px solid rgba(0,200,83,0.45)'
                  : '1.5px solid rgba(255,255,255,0.08)',
                color: joinCode.length === 6 ? '#00C853' : '#2d3d55',
                boxShadow: joinCode.length === 6 ? '0 4px 20px rgba(0,200,83,0.2)' : 'none',
              }}
              whileHover={joinCode.length === 6 ? { scale: 1.02 } : {}}
              whileTap={joinCode.length === 6 ? { scale: 0.97 } : {}}
              onClick={handleJoinRoom}
            >
              <LogIn size={17} />
              Join Game
            </motion.button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
