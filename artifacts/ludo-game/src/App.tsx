import React, { useState, useCallback, useEffect } from 'react';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';

import Home from '@/pages/Home';
import OfflineSetup from '@/pages/OfflineSetup';
import OnlineHub from '@/pages/OnlineHub';
import RoomLobby from '@/pages/RoomLobby';
import Game from '@/pages/Game';
import Leaderboard from '@/pages/Leaderboard';
import Profile from '@/pages/Profile';

import { AuthProvider } from '@/contexts/AuthContext';
import { PlayerProvider } from '@/contexts/PlayerContext';
import { GameProvider } from '@/contexts/GameContext';
import { LoadingScreen } from '@/components/LoadingScreen';
import { sound } from '@/lib/sound';

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/offline" component={OfflineSetup} />
      <Route path="/online" component={OnlineHub} />
      <Route path="/room/:code" component={RoomLobby} />
      <Route path="/game" component={Game} />
      <Route path="/leaderboard" component={Leaderboard} />
      <Route path="/profile" component={Profile} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [showingLoader, setShowingLoader] = useState(true);
  const handleLoadComplete = useCallback(() => {
    setShowingLoader(false);
    // The moment loading finishes is the most likely point the BGM should
    // kick in. If the browser already allows audio on this origin (repeat
    // visits, or it already granted engagement), this starts it immediately
    // with no further action needed.
    sound.unlock();
    if (!sound.isMuted()) sound.startBGM();
  }, []);

  // Play a soft click for any button/link tap, anywhere in the app — and use
  // that same first user gesture to unlock the (autoplay-restricted) audio
  // context and kick off the background ambience.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      sound.unlock();
      const target = e.target as HTMLElement | null;
      if (target?.closest('button, a, [role="button"]')) {
        sound.playClick();
      }
      if (!sound.isMuted()) sound.startBGM();
    };
    // Unlock on the very first pointerdown/touch/keypress too — these fire
    // earlier than a full click (which waits for mouseup), so audio has the
    // best possible chance of being ready as soon as the user does anything
    // at all, rather than waiting specifically for a completed button click.
    const onFirstGesture = () => {
      sound.unlock();
      if (!sound.isMuted()) sound.startBGM();
    };
    document.addEventListener('click', onClick, true);
    document.addEventListener('pointerdown', onFirstGesture, { once: true, passive: true });
    document.addEventListener('touchstart', onFirstGesture, { once: true, passive: true });
    document.addEventListener('keydown', onFirstGesture, { once: true });
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('pointerdown', onFirstGesture);
      document.removeEventListener('touchstart', onFirstGesture);
      document.removeEventListener('keydown', onFirstGesture);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PlayerProvider>
          <GameProvider>
            <TooltipProvider>
              {showingLoader && <LoadingScreen onComplete={handleLoadComplete} />}
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
                <Router />
              </WouterRouter>
              <Toaster />
            </TooltipProvider>
          </GameProvider>
        </PlayerProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
