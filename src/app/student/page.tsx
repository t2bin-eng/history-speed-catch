"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { joinRoom } from "@/lib/rooms";
import { savePlayerSession } from "@/lib/storage";

export default function StudentPage() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setJoining(true);
    setError(null);
    try {
      const { roomId, playerId } = await joinRoom(roomCode.trim(), nickname.trim());
      savePlayerSession(roomCode.trim(), { playerId, roomId, nickname: nickname.trim() });
      router.push(`/play/${roomCode.trim()}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "입장 중 오류가 발생했습니다.");
    } finally {
      setJoining(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
      <h1 className="text-2xl font-bold">학생으로 참여</h1>
      <form onSubmit={handleSubmit} className="flex w-full max-w-xs flex-col gap-4">
        <input
          value={roomCode}
          onChange={(e) => setRoomCode(e.target.value)}
          placeholder="방 코드"
          required
          className="h-12 rounded-md border border-black/[.15] px-4 text-center text-lg tracking-widest"
        />
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="닉네임"
          required
          maxLength={20}
          className="h-12 rounded-md border border-black/[.15] px-4 text-center"
        />
        <button
          type="submit"
          disabled={joining}
          className="h-12 rounded-full bg-foreground text-background disabled:opacity-50"
        >
          {joining ? "입장 중..." : "입장하기"}
        </button>
        {error && <p className="text-sm text-red-700">{error}</p>}
      </form>
    </div>
  );
}
