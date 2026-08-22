import React from 'react';
import { Crown } from 'lucide-react';

interface LegendTitleProps {
  className?: string;
  crownSize?: number;
}

/**
 * "LUDO LEGEND" wordmark — "LEGEND" has the sliding gold shimmer (see
 * .legend-shimmer-text in index.css), and a bare crown glyph (no badge/
 * circle behind it) sits directly above the "D". The word is split so the
 * crown anchors to that exact letter regardless of font/rendering width,
 * rather than being eyeballed as a fixed offset from the whole word.
 */
export function LegendTitle({ className, crownSize = 22 }: LegendTitleProps) {
  return (
    <h1 className={`font-black tracking-tight leading-none text-white ${className ?? ''}`}>
      LUDO{' '}
      <span className="legend-shimmer-text" style={{ filter: 'drop-shadow(0 0 20px rgba(255,214,0,0.55))' }}>
        LEGEN
        <span className="relative inline-block">
          D
          <Crown
            size={crownSize}
            className="absolute left-1/2"
            style={{
              bottom: '92%',
              transform: 'translateX(-50%) rotate(0deg)',
              color: '#FFD600',
              fill: '#FFD600',
              filter: 'drop-shadow(0 0 8px rgba(255,214,0,0.85)) drop-shadow(0 2px 3px rgba(0,0,0,0.4))',
            }}
          />
        </span>
      </span>
    </h1>
  );
}
