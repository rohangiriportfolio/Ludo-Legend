import React, { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';

/** Renders Google's own "Sign in with Google" button. Renders nothing if no client ID is configured. */
export function GoogleSignInButton({ className }: { className?: string }) {
  const { renderGoogleButton, googleConfigured } = useAuth();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (googleConfigured) renderGoogleButton(ref.current);
  }, [googleConfigured, renderGoogleButton]);

  if (!googleConfigured) return null;
  return <div ref={ref} className={className} />;
}
