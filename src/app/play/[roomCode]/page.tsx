"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getPlayerSession, type PlayerSession } from "@/lib/storage";

export default function PlayWaitingRoomPage({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const { roomCode } = use(params);
  const router = useRouter();
  const [session] = useState<PlayerSession | null>(() =>
    typeof window === "undefined" ? null : getPlayerSession(roomCode)
  );
  const [playerCount, setPlayerCount] = useState<number | null>(null);

  useEffect(() => {
    if (!session) router.replace("/student");
  }, [session, router]);

  useEffect(() => {
    if (!session) return;
    let active = true;

    async function loadCount() {
      const { count } = await supabase
        .from("players")
        .select("id", { count: "exact", head: true })
        .eq("room_id", session!.roomId);
      if (active) setPlayerCount(count ?? 0);
    }
    loadCount();

    const channel = supabase
      .channel(`room-players-${session.roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players", filter: `room_id=eq.${session.roomId}` },
        () => loadCount()
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [session]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm text-gray-500">방 코드 {roomCode}</p>
      <h1 className="text-2xl font-bold">
        {session ? `${session.nickname}님, 대기 중입니다` : "대기 중..."}
      </h1>
      <p className="text-gray-600">
        {playerCount === null ? "참여자 수 확인 중..." : `현재 ${playerCount}명 참여 중`}
      </p>
      <p className="text-sm text-gray-400">선생님이 게임을 시작하면 자동으로 화면이 전환됩니다.</p>
    </div>
  );
}
