import React from 'react';

interface LudoLogoProps {
  size?: number;
  className?: string;
}

/**
 * The app's mark — the Ludo board artwork (public/brand/ludo-board.png).
 * This PNG has a genuinely transparent background (verified directly:
 * alpha = 0 across every sampled background pixel), so it's rendered as a
 * plain <img> with no wrapper background of any kind — only the board and
 * tokens show, against whatever's behind it. Shared by the landing page
 * and the loading screen so they always render identically.
 */
export function LudoLogo({ size = 220, className }: LudoLogoProps) {
  return (
    <div className={`relative mx-auto ${className ?? ''}`} style={{ width: size, maxWidth: '80vw' }}>
      <img
        src="/brand/ludo-board.png"
        alt="Ludo Legend"
        className="w-full h-auto block"
        style={{ filter: 'drop-shadow(0 10px 26px rgba(0,0,0,0.4))' }}
        draggable={false}
      />
    </div>
  );
}
