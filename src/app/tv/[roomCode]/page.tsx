"use client";

import { use, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getRoomByCode } from "@/lib/rooms";
import { getCurrentCardPair, type CardWithSymbols } from "@/lib/game";
import type { Player, Room } from "@/types";
import DobbleCard from "@/components/DobbleCard";
import RoomQrCode from "@/components/RoomQrCode";

export default function TvPage({ params }: { params: Promise<{ roomCode: string }> }) {
  const { roomCode } = use(params);
  const [room, setRoom] = useState<Room | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [pair, setPair] = useState<[CardWithSymbols, CardWithSymbols] | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);

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
    if (!room) return;
    let active = true;

    async function loadPlayers() {
      const { data } = await supabase
        .from("players")
        .select("*")
        .eq("room_id", room!.id)
        .order("score", { ascending: false })
        .order("nickname", { ascending: true });
      if (active && data) setPlayers(data as Player[]);
    }
    loadPlayers();

    const playersChannel = supabase
      .channel(`tv-players-${room.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players", filter: `room_id=eq.${room.id}` },
        () => loadPlayers()
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(playersChannel);
    };
  }, [room]);

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
        <p className="text-2xl text-red-700">존재하지 않는 방입니다.</p>
      </div>
    );
  }

  const topPlayers = players.slice(0, 5);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 px-10 py-8">
      <header className="flex items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <RoomQrCode roomCode={roomCode} size={100} />
          <p className="text-3xl font-bold tracking-wide">
            방 코드 <span className="tracking-widest">{roomCode}</span>
          </p>
        </div>
        <p className="text-2xl text-gray-600">참여 인원 {players.length}명</p>
      </header>

      <div className="flex flex-1 flex-wrap items-center justify-center gap-16 py-10">
        <div className="flex flex-1 flex-wrap items-center justify-center gap-16">
          {room?.status === "playing" && pair ? (
            <>
              <DobbleCard symbols={pair[0].symbols} size={420} />
              <DobbleCard symbols={pair[1].symbols} size={420} />
            </>
          ) : (
            <p className="text-4xl font-bold">게임 시작을 기다리는 중...</p>
          )}
        </div>

        {topPlayers.length > 0 && (
          <aside className="w-80 flex-none rounded-xl border bg-white p-6">
            <h2 className="mb-4 text-xl font-bold">실시간 순위</h2>
            <ol className="flex flex-col gap-3">
              {topPlayers.map((p, i) => (
                <li key={p.id} className="flex items-center justify-between text-lg">
                  <span className="font-medium">
                    {i + 1}. {p.nickname}
                  </span>
                  <span className="font-bold">{p.score}</span>
                </li>
              ))}
            </ol>
          </aside>
        )}
      </div>
    </div>
  );
}
