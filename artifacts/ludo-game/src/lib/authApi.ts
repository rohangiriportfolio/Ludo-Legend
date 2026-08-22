// Plain fetch wrappers for the auth endpoints — kept separate from the
// generated @workspace/api-client-react hooks so this works immediately
// without needing to re-run the OpenAPI codegen.
//
// Base URL: when the frontend and API server are on the same origin (Vite
// dev proxy, or the single-process "pnpm run start" mode) VITE_API_URL can
// be left empty and requests just use relative paths. When they're deployed
// separately (e.g. frontend on Vercel, backend on Railway/Render/Fly),
// set VITE_API_URL to the backend's full URL. `credentials: 'include'`
// makes the browser send/accept the session cookie either way.
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

export interface AuthPlayer {
  id: string;
  name: string;
  avatarColor: string;
  avatarEmoji: string | null;
  avatarUrl: string | null;
  authProvider: string;
  gamesPlayed: number;
  gamesWon: number;
  winRate: number;
  totalTokensHome: number;
  totalTokensCut: number;
  longestWinStreak: number;
  currentWinStreak: number;
  unfinishedMatchJson: string | null;
  createdAt: string;
}

async function parse<T>(res: Response): Promise<T | null> {
  if (res.status === 401 || res.status === 404) return null;
  if (res.status === 204) return null;

  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.toLowerCase().includes("application/json");

  if (!isJson) {
    const body = await res.text().catch(() => "");
    if (body.trimStart().startsWith("<!DOCTYPE") || body.trimStart().startsWith("<html")) {
      throw new Error(`API returned HTML instead of JSON (${res.status}). Check the Vercel API function deployment.`);
    }
    throw new Error(`Request failed (${res.status})`);
  }

  const body = await res.json();
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}

export async function fetchSession(): Promise<AuthPlayer | null> {
  const res = await fetch(`${API_BASE}/api/auth/me`, { credentials: 'include' });
  return parse<AuthPlayer>(res);
}

export async function signInWithGoogle(credential: string): Promise<AuthPlayer> {
  const res = await fetch(`${API_BASE}/api/auth/google`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential }),
  });
  const player = await parse<AuthPlayer>(res);
  if (!player) throw new Error('Sign-in failed');
  return player;
}

export async function signOut(): Promise<void> {
  await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' });
}

export async function saveUnfinishedMatch(matchJson: string | null): Promise<void> {
  await fetch(`${API_BASE}/api/auth/match`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ matchJson }),
  });
}

export async function clearUnfinishedMatch(): Promise<void> {
  await fetch(`${API_BASE}/api/auth/match`, { method: 'DELETE', credentials: 'include' });
}

export async function recordOfflineResult(won: boolean, tokensHome: number): Promise<void> {
  await fetch(`${API_BASE}/api/auth/record-offline-result`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ won, tokensHome }),
  });
}
