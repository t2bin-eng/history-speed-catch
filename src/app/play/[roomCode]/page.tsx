"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getPlayerSession, type PlayerSession } from "@/lib/storage";
import { getCurrentCardPair, findCommonSymbolId, submitClaim, type CardWithSymbols } from "@/lib/game";
import type { Room } from "@/types";
import DobbleCard from "@/components/DobbleCard";

export default function PlayPage({
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
  const [room, setRoom] = useState<Room | null>(null);
  const [pair, setPair] = useState<[CardWithSymbols, CardWithSymbols] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ cardPairIndex: number; isCorrect: boolean } | null>(null);

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

    const playersChannel = supabase
      .channel(`room-players-${session.roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players", filter: `room_id=eq.${session.roomId}` },
        () => loadCount()
      )
      .subscribe();

    async function loadRoom() {
      const { data } = await supabase.from("rooms").select("*").eq("id", session!.roomId).maybeSingle();
      if (active && data) setRoom(data as Room);
    }
    loadRoom();

    const roomChannel = supabase
      .channel(`room-status-${session.roomId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${session.roomId}` },
        (payload) => {
          if (active) setRoom(payload.new as Room);
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(playersChannel);
      supabase.removeChannel(roomChannel);
    };
  }, [session]);

  useEffect(() => {
    if (!room || room.status !== "playing") return;
    let active = true;
    getCurrentCardPair(room.id, room.current_card_pair_index).then((result) => {
      if (active) setPair(result);
    });
    return () => {
      active = false;
    };
  }, [room]);

  async function handleSymbolClick(symbolId: string) {
    if (!session || !room || !pair || submitting) return;
    setSubmitting(true);
    try {
      const correctSymbolId = findCommonSymbolId(pair);
      const isCorrectGuess = symbolId === correctSymbolId;
      const result = await submitClaim(
        room.id,
        room.current_card_pair_index,
        session.playerId,
        symbolId,
        isCorrectGuess
      );
      setFeedback({ cardPairIndex: room.current_card_pair_index, isCorrect: result.isCorrect });
    } finally {
      setSubmitting(false);
    }
  }

  if (room?.status === "playing" && pair) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-8">
        <div className="flex flex-col items-center gap-6">
          <DobbleCard symbols={pair[0].symbols} size={280} onSymbolClick={handleSymbolClick} />
          <DobbleCard symbols={pair[1].symbols} size={280} onSymbolClick={handleSymbolClick} />
        </div>
        {feedback && feedback.cardPairIndex === room.current_card_pair_index && (
          <p className={feedback.isCorrect ? "text-lg font-bold text-green-700" : "text-lg font-bold text-red-700"}>
            {feedback.isCorrect ? "정답입니다!" : "오답입니다. 다시 시도해보세요."}
          </p>
        )}
      </div>
    );
  }

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
