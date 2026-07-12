"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { getRoomByCode, startGame, nextCard, endGame } from "@/lib/rooms";
import { getCardCount } from "@/lib/game";
import type { Player, Room } from "@/types";

export default function ControlPage({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const { roomCode } = use(params);
  const [room, setRoom] = useState<Room | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [cardCount, setCardCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    getRoomByCode(roomCode).then((data) => {
      if (!active) return;
      if (!data) {
        setNotFound(true);
        return;
      }
      setRoom(data);
      getCardCount(data.id).then((count) => {
        if (active) setCardCount(count);
      });
    });

    const roomChannel = supabase
      .channel(`control-room-${roomCode}`)
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
      supabase.removeChannel(roomChannel);
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
      .channel(`control-players-${room.id}`)
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

  async function handleStart() {
    if (!room) return;
    setBusy(true);
    setError(null);
    try {
      await startGame(room.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "게임 시작 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function handleNext() {
    if (!room) return;
    setBusy(true);
    setError(null);
    try {
      await nextCard(room.id, room.current_card_pair_index + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "다음 카드 진행 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function handleEnd() {
    if (!room) return;
    setBusy(true);
    setError(null);
    try {
      await endGame(room.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "게임 종료 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  if (notFound) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-red-700">존재하지 않는 방입니다.</p>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-gray-500">불러오는 중...</p>
      </div>
    );
  }

  const isLastPair = cardCount !== null && room.current_card_pair_index >= cardCount - 2;

  return (
    <div className="mx-auto flex max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold">교사 관제 화면</h1>
        <p className="mt-1 text-gray-500">
          방 코드 <span className="font-semibold">{roomCode}</span> · 상태{" "}
          <span className="font-semibold">{room.status}</span>
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        {room.status === "waiting" && (
          <button
            type="button"
            onClick={handleStart}
            disabled={busy}
            className="flex h-11 items-center justify-center rounded-full bg-foreground px-6 text-background disabled:opacity-50"
          >
            게임 시작
          </button>
        )}
        {room.status === "playing" && (
          <>
            <button
              type="button"
              onClick={handleNext}
              disabled={busy || isLastPair}
              className="flex h-11 items-center justify-center rounded-full bg-foreground px-6 text-background disabled:opacity-50"
            >
              다음 카드 ({room.current_card_pair_index + 1}
              {cardCount !== null ? ` / ${cardCount - 1}` : ""})
            </button>
            <button
              type="button"
              onClick={handleEnd}
              disabled={busy}
              className="flex h-11 items-center justify-center rounded-full border border-black/[.15] px-6 disabled:opacity-50"
            >
              게임 종료
            </button>
          </>
        )}
        {room.status === "finished" && (
          <div className="flex items-center gap-3">
            <p className="text-lg font-semibold">게임이 종료되었습니다.</p>
            <Link
              href={`/result/${roomCode}`}
              className="flex h-10 items-center justify-center rounded-full bg-foreground px-5 text-sm text-background"
            >
              결과 보기
            </Link>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <div>
        <h2 className="mb-2 text-lg font-semibold">참여 학생 ({players.length}명)</h2>
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2">순위</th>
                <th className="px-3 py-2">닉네임</th>
                <th className="px-3 py-2">점수</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p, i) => (
                <tr key={p.id} className="border-t">
                  <td className="px-3 py-2">{i + 1}</td>
                  <td className="px-3 py-2">{p.nickname}</td>
                  <td className="px-3 py-2">{p.score}</td>
                </tr>
              ))}
              {players.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-4 text-center text-gray-400">
                    아직 참여한 학생이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
