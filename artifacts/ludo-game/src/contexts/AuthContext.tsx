import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { fetchSession, signInWithGoogle, signOut as apiSignOut, type AuthPlayer } from '@/lib/authApi';

declare global {
  interface Window {
    google?: any;
  }
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

interface AuthContextType {
  /** The signed-in player's Mongo-backed profile, or null if playing as a guest. */
  user: AuthPlayer | null;
  isAuthenticated: boolean;
  /** True while the initial session check is in flight. */
  isLoading: boolean;
  /** Whether a Google client ID is configured at all (lets the UI hide the button if not set up). */
  googleConfigured: boolean;
  /** Renders the official Google "Sign in with Google" button into the given element. */
  renderGoogleButton: (el: HTMLElement | null) => void;
  signOut: () => Promise<void>;
  /** Re-fetch /auth/me — call after actions that might change the profile server-side. */
  refreshSession: () => Promise<void>;
  /** Locally patch the cached user (e.g. right after an optimistic profile edit). */
  setUser: (user: AuthPlayer | null) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

let gisScriptPromise: Promise<void> | null = null;
function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gisScriptPromise) return gisScriptPromise;
  gisScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GIS_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      return;
    }
    const script = document.createElement('script');
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
  return gisScriptPromise;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthPlayer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const initializedRef = useRef(false);
  const userRef = useRef<AuthPlayer | null>(null);
  useEffect(() => { userRef.current = user; }, [user]);

  const refreshSession = useCallback(async () => {
    try {
      const player = await fetchSession();
      setUser(player);
    } catch (e) {
      console.error('Failed to check session', e);
    }
  }, []);

  // Initial session check
  useEffect(() => {
    (async () => {
      await refreshSession();
      setIsLoading(false);
    })();
  }, [refreshSession]);

  // Deliberately NOT initialized eagerly on every page load for every
  // visitor — some Chrome versions will proactively show their own native
  // "Sign in as ..." chip (covering whatever's underneath it) just from a
  // page calling initialize() with a valid client ID, if that browser is
  // already signed into a Google account — no explicit prompt() call on our
  // end needed to trigger it. Initializing lazily, only once someone
  // actually opens the sign-in UI, means guests who never touch it never
  // give Chrome the chance to show that chip unprompted.
  const ensureInitialized = useCallback((): Promise<void> => {
    if (!GOOGLE_CLIENT_ID) return Promise.resolve();
    return loadGoogleScript().then(() => {
      if (initializedRef.current) return;
      initializedRef.current = true;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response: { credential: string }) => {
          try {
            const player = await signInWithGoogle(response.credential);
            setUser(player);
          } catch (e) {
            console.error('Google sign-in failed', e);
          }
        },
        auto_select: false,
        cancel_on_tap_outside: true,
      });
    });
  }, []);

  const renderGoogleButton = useCallback((el: HTMLElement | null) => {
    if (!el || !GOOGLE_CLIENT_ID) return;
    ensureInitialized()
      .then(() => {
        if (!window.google?.accounts?.id) return;
        el.innerHTML = '';
        window.google.accounts.id.renderButton(el, {
          theme: 'filled_black',
          size: 'large',
          shape: 'pill',
          text: 'signin_with',
        });
      })
      .catch((e) => console.error(e));
  }, [ensureInitialized]);

  const signOut = useCallback(async () => {
    await apiSignOut();
    setUser(null);
    if (window.google?.accounts?.id) {
      window.google.accounts.id.disableAutoSelect();
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        googleConfigured: !!GOOGLE_CLIENT_ID,
        renderGoogleButton,
        signOut,
        refreshSession,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
