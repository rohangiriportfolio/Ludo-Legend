// Plain fetch wrappers for the room/game endpoints — the HTTP-polling
// replacement for the old Socket.IO client. Same base-URL/credentials
// pattern as authApi.ts: works same-origin (dev proxy, single-process
// prod) or against a separately-configured VITE_API_URL.
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}/api${path}`, {
    credentials: 'include',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // ignore — keep default message
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface RoomApiPlayer {
  id: string;
  name: string;
  avatarColor?: string;
  avatarEmoji?: string;
}

export function joinRoom(code: string, players: RoomApiPlayer[]) {
  return request<{ room: any; lobby: any[] | null; game: any | null }>(`/rooms/${code}/join`, {
    method: 'POST',
    body: JSON.stringify({ players }),
  });
}

export function leaveSeat(code: string, playerId: string) {
  return request<{ lobby: any[] }>(`/rooms/${code}/leave-seat`, {
    method: 'POST',
    body: JSON.stringify({ playerId }),
  });
}

export function selectRoomColor(code: string, playerId: string, color: string) {
  return request<{ lobby: any[] }>(`/rooms/${code}/select-color`, {
    method: 'POST',
    body: JSON.stringify({ playerId, color }),
  });
}

export function renameRoomSeat(code: string, playerId: string, name: string) {
  return request<{ lobby: any[] }>(`/rooms/${code}/rename`, {
    method: 'POST',
    body: JSON.stringify({ playerId, name }),
  });
}

export function addRoomBot(code: string, difficulty?: string) {
  return request<{ lobby: any[] }>(`/rooms/${code}/add-bot`, {
    method: 'POST',
    body: JSON.stringify({ difficulty }),
  });
}

export function startRoomGame(code: string, teamMode: boolean) {
  return request<{ game: any }>(`/rooms/${code}/start`, {
    method: 'POST',
    body: JSON.stringify({ teamMode }),
  });
}

export function leaveRoom(code: string, playerId: string) {
  return request<void>(`/rooms/${code}/leave`, {
    method: 'POST',
    body: JSON.stringify({ playerId }),
  });
}

export function cancelRoomMatch(code: string, playerId: string) {
  return request<void>(`/rooms/${code}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ playerId }),
  });
}

export function rollRoomDice(code: string, playerId: string) {
  return request<{ game: any }>(`/rooms/${code}/roll`, {
    method: 'POST',
    body: JSON.stringify({ playerId }),
  });
}

export function moveRoomToken(code: string, playerId: string, tokenIndex: number) {
  return request<{ game: any }>(`/rooms/${code}/move`, {
    method: 'POST',
    body: JSON.stringify({ playerId, tokenIndex }),
  });
}

export function getRoomState(code: string, since: number) {
  return request<{ room: any; lobby: any[] | null; game: any | null; newEvents: any[] }>(
    `/rooms/${code}/state?since=${since}`,
  );
}
