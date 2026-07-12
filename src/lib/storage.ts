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

export interface PersonalRecord {
  roomCode: string;
  nickname: string;
  score: number;
  accuracy: number;
  playedAt: string;
}

const HISTORY_KEY = "history-speed-catch:history";

export function savePersonalRecord(record: PersonalRecord): void {
  const history = getPersonalHistory();
  if (history.some((r) => r.roomCode === record.roomCode && r.nickname === record.nickname)) return;
  history.push(record);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

export function getPersonalHistory(): PersonalRecord[] {
  const raw = localStorage.getItem(HISTORY_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as PersonalRecord[];
  } catch {
    return [];
  }
}
