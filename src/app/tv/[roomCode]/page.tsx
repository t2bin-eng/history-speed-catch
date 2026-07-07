"use client";

import { use, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getRoomByCode } from "@/lib/rooms";
import { getCurrentCardPair, type CardWithSymbols } from "@/lib/game";
import type { Room } from "@/types";
import DobbleCard from "@/components/DobbleCard";

export default function TvPage({ params }: { params: Promise<{ roomCode: string }> }) {
  const { roomCode } = use(params);
  const [room, setRoom] = useState<Room | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [pair, setPair] = useState<[CardWithSymbols, CardWithSymbols] | null>(null);

  useEffect(() => {
    let active = true;

    getRoomByCode(roomCode).then((data) => {
      if (!active) return;
      if (!data) setNotFound(true);
      else setRoom(data);
    });

    const channel = supabase
      .channel(`tv-room-${roomCode}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rooms", filter: `room_code=eq.${roomCode}` },
        (payload) => {
          if (active) setRoom(payload.new as Room);
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [roomCode]);

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

  if (notFound) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-red-700">존재하지 않는 방입니다.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-10 bg-zinc-50 px-6 py-10">
      <p className="text-lg text-gray-500">방 코드 {roomCode}</p>
      {room?.status === "playing" && pair ? (
        <div className="flex flex-wrap items-center justify-center gap-12">
          <DobbleCard symbols={pair[0].symbols} />
          <DobbleCard symbols={pair[1].symbols} />
        </div>
      ) : (
        <p className="text-2xl font-bold">게임 시작을 기다리는 중...</p>
      )}
    </div>
  );
}
