import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LudoLogo } from './LudoLogo';
import { LegendTitle } from './LegendTitle';
import { sound } from '../lib/sound';

interface Props {
  onComplete: () => void;
}

export function LoadingScreen({ onComplete }: Props) {
  const [progress, setProgress] = useState(0);
  const [exiting, setExiting] = useState(false);
  const calledRef = useRef(false);

  useEffect(() => {
    const TOTAL = 3400;
    const TICK  = 40;
    const start = Date.now();

    const id = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min((elapsed / TOTAL) * 100, 100);
      setProgress(pct);
      if (pct >= 100 && !calledRef.current) {
        calledRef.current = true;
        clearInterval(id);
        setExiting(true);
        setTimeout(onComplete, 480);
      }
    }, TICK);

    return () => clearInterval(id);
  }, [onComplete]);

  return (
    <AnimatePresence>
      {!exiting && (
        <motion.div
          key="splash"
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden select-none"
          style={{ background: 'linear-gradient(135deg, #080c18 0%, #0d1425 50%, #080c18 100%)' }}
          exit={{ opacity: 0, scale: 1.06 }}
          transition={{ duration: 0.48, ease: 'easeInOut' }}
          onClick={() => { sound.unlock(); if (!sound.isMuted()) sound.startBGM(); }}
          onTouchStart={() => { sound.unlock(); if (!sound.isMuted()) sound.startBGM(); }}
        >
          {/* Corner glow orbs — match board colors */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div style={{ position:'absolute', top:'-8%',  left:'-8%',  width:'42%', height:'42%', background:'#FF174428', borderRadius:'50%', filter:'blur(90px)' }} />
            <div style={{ position:'absolute', top:'-8%',  right:'-8%', width:'42%', height:'42%', background:'#00C85328', borderRadius:'50%', filter:'blur(90px)' }} />
            <div style={{ position:'absolute', bottom:'-8%', left:'-8%', width:'42%', height:'42%', background:'#2979FF28', borderRadius:'50%', filter:'blur(90px)' }} />
            <div style={{ position:'absolute', bottom:'-8%', right:'-8%',width:'42%', height:'42%', background:'#FFD60028', borderRadius:'50%', filter:'blur(90px)' }} />
          </div>

          {/* Dot-grid overlay */}
          <div className="absolute inset-0 pointer-events-none" style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.035) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }} />

          {/* Logo — identical to the landing page */}
          <motion.div
            className="mb-10 relative z-10"
            initial={{ scale: 0, rotate: -14, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 170, damping: 15 }}
          >
            <LudoLogo size={200} />
          </motion.div>

          {/* Title */}
          <motion.div
            className="text-center relative z-10 mb-12"
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y:  0 }}
            transition={{ delay: 0.55, duration: 0.6, ease: 'easeOut' }}
          >
            <LegendTitle className="text-4xl sm:text-6xl" crownSize={26} />
            <p className="mt-3 text-lg font-medium" style={{ color: '#4e6080' }}>
              The Ultimate Board Experience
            </p>
          </motion.div>

          {/* Progress bar */}
          <motion.div
            className="relative z-10 flex flex-col items-center gap-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.85 }}
          >
            <div
              className="rounded-full overflow-hidden"
              style={{ width: 260, height: 5, background: 'rgba(255,255,255,0.07)' }}
            >
              <div
                className="h-full rounded-full transition-none"
                style={{
                  width: `${progress}%`,
                  background: 'linear-gradient(90deg, #FF1744 0%, #FFD600 40%, #00C853 70%, #2979FF 100%)',
                  transition: 'width 0.04s linear',
                  boxShadow: '0 0 10px rgba(255,255,255,0.3)',
                }}
              />
            </div>
            <p className="text-sm font-semibold tracking-widest uppercase" style={{ color: '#2d3d55' }}>
              Loading…
            </p>
            <motion.p
              className="text-xs font-medium tracking-wide"
              style={{ color: '#3a5070' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.1, duration: 0.6 }}
            >
              🔊 Tap anywhere for sound
            </motion.p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
