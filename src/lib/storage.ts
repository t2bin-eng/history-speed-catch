export interface PlayerSession {
  playerId: string;
  roomId: string;
  nickname: string;
}

function key(roomCode: string): string {
  return `history-speed-catch:player:${roomCode}`;
}

export function savePlayerSession(roomCode: string, session: PlayerSession): void {
  localStorage.setItem(key(roomCode), JSON.stringify(session));
}

export function getPlayerSession(roomCode: string): PlayerSession | null {
  const raw = localStorage.getItem(key(roomCode));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PlayerSession;
  } catch {
    return null;
  }
}
