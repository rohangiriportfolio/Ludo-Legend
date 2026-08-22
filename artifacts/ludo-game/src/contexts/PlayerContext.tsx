import React, { createContext, useContext, useEffect, useState } from 'react';
import { useUpdatePlayer } from '@workspace/api-client-react';
import { useAuth } from '@/contexts/AuthContext';

export interface LocalPlayer {
  id: string;
  name: string;
  avatarColor: string;
  avatarEmoji?: string;
  avatarUrl?: string | null;
}

interface PlayerContextType {
  player: LocalPlayer | null;
  /** True once signed in with Google — false for guests. */
  isGuest: boolean;
  updateLocalPlayer: (data: Partial<LocalPlayer>) => Promise<void>;
  isLoading: boolean;
}

const PlayerContext = createContext<PlayerContextType | null>(null);

function loadOrCreateGuestProfile(): LocalPlayer {
  const stored = localStorage.getItem('ludo_player');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // fall through to creating a fresh one
    }
  }
  const newPlayer: LocalPlayer = {
    id: crypto.randomUUID(),
    name: `Guest_${Math.floor(Math.random() * 10000)}`,
    avatarColor: ['red', 'green', 'yellow', 'blue'][Math.floor(Math.random() * 4)],
    avatarEmoji: '🎲',
  };
  localStorage.setItem('ludo_player', JSON.stringify(newPlayer));
  return newPlayer;
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading: authLoading, setUser } = useAuth();
  const [guestPlayer, setGuestPlayer] = useState<LocalPlayer | null>(null);
  const updatePlayer = useUpdatePlayer();

  // Guests are purely client-side now — no Mongo row gets created for them.
  useEffect(() => {
    if (!user) setGuestPlayer(loadOrCreateGuestProfile());
  }, [user]);

  const player: LocalPlayer | null = user
    ? { id: user.id, name: user.name, avatarColor: user.avatarColor, avatarEmoji: user.avatarEmoji ?? undefined, avatarUrl: user.avatarUrl }
    : guestPlayer;

  const updateLocalPlayer = async (data: Partial<LocalPlayer>) => {
    if (!player) return;

    if (user) {
      // Authenticated — persist to MongoDB via the existing players API, then
      // update the cached session so the change shows immediately.
      const updated = { ...user, ...data, avatarEmoji: data.avatarEmoji ?? user.avatarEmoji };
      setUser(updated as typeof user);
      try {
        await updatePlayer.mutateAsync({
          playerId: user.id,
          data: { name: data.name, avatarColor: data.avatarColor, avatarEmoji: data.avatarEmoji },
        });
      } catch (e) {
        console.error('Failed to sync profile update', e);
      }
      return;
    }

    // Guest — localStorage only.
    const updated = { ...player, ...data };
    setGuestPlayer(updated);
    localStorage.setItem('ludo_player', JSON.stringify(updated));
  };

  return (
    <PlayerContext.Provider value={{ player, isGuest: !user, updateLocalPlayer, isLoading: authLoading }}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) throw new Error('usePlayer must be used within PlayerProvider');
  return context;
}
