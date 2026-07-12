"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { getRoomByCode, startGame, revealNextCenterCard, endGame } from "@/lib/rooms";
import { getRoomAnswerClaims, type AnswerClaimWithDetails } from "@/lib/game";
import type { Player, Room } from "@/types";

const PHASE_LABEL: Record<Room["round_phase"], string> = {
  matching: "매칭 중",
  priority_answering: "우선권 답변 중",
  open_answering: "전체 공개",
  resolved: "라운드 종료",
};

export default function ControlPage({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const { roomCode } = use(params);
  const [room, setRoom] = useState<Room | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answerClaims, setAnswerClaims] = useState<AnswerClaimWithDetails[]>([]);

  useEffect(() => {
    let active = true;

    getRoomByCode(roomCode).then((data) => {
      if (!active) return;
      if (!data) {
        setNotFound(true);
        return;
      }
      setRoom(data);
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

  // 획득 로그: 교사가 진행 중 누가 무엇을 맞혔는지 바로 확인할 수 있도록 실시간으로 쌓는다.
  useEffect(() => {
    if (!room) return;
    let active = true;

    async function loadClaims() {
      const claims = await getRoomAnswerClaims(room!.id);
      if (active) setAnswerClaims(claims);
    }
    loadClaims();

    const channel = supabase
      .channel(`control-answer-claims-${room.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "answer_claims", filter: `room_id=eq.${room.id}` },
        () => loadClaims()
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
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

  async function handleRevealNext() {
    if (!room) return;
    setBusy(true);
    setError(null);
    try {
      await revealNextCenterCard(room.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "카드 제시 중 오류가 발생했습니다.");
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

  return (
    <div className="mx-auto flex max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold">교사 관제 화면</h1>
        <p className="mt-1 text-gray-500">
          방 코드 <span className="font-semibold">{roomCode}</span> · 상태{" "}
          <span className="font-semibold">{room.status}</span>
          {room.status === "playing" && (
            <>
              {" "}
              · <span className="font-semibold">{PHASE_LABEL[room.round_phase]}</span>
            </>
          )}
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        {room.status === "waiting" && (
          <button
            type="button"
            onClick={handleStart}
            disabled={busy}
            className="flex h-11 items-center justify-center rounded-full border-2 border-gray-900 bg-foreground px-6 text-background shadow-sm disabled:opacity-50"
          >
            게임 시작
          </button>
        )}
        {room.status === "playing" && (
          <>
            <button
              type="button"
              onClick={handleRevealNext}
              disabled={busy}
              className="flex h-11 items-center justify-center rounded-full border-2 border-gray-900 bg-foreground px-6 text-background shadow-sm disabled:opacity-50"
            >
              카드 제시 ({room.current_center_card_id ? room.current_card_pair_index + 1 : "첫 장"})
            </button>
            <button
              type="button"
              onClick={handleEnd}
              disabled={busy}
              className="flex h-11 items-center justify-center rounded-full border-2 border-gray-400 px-6 shadow-sm disabled:opacity-50"
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
              className="flex h-10 items-center justify-center rounded-full border-2 border-gray-900 bg-foreground px-5 text-sm text-background shadow-sm"
            >
              결과 보기
            </Link>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <div>
        <h2 className="mb-2 text-lg font-semibold">참여 학생 ({players.length}명)</h2>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[320px] text-left text-sm">
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

      <div>
        <h2 className="mb-2 text-lg font-semibold">획득 로그</h2>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2">라운드</th>
                <th className="px-3 py-2">획득자</th>
                <th className="px-3 py-2">기호</th>
                <th className="px-3 py-2">시각</th>
              </tr>
            </thead>
            <tbody>
              {answerClaims.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="px-3 py-2">{c.card_pair_index + 1}</td>
                  <td className="px-3 py-2">{c.player_nickname}</td>
                  <td className="px-3 py-2">{c.symbol.label}</td>
                  <td className="px-3 py-2 text-gray-400">
                    {new Date(c.claimed_at).toLocaleTimeString("ko-KR")}
                  </td>
                </tr>
              ))}
              {answerClaims.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-gray-400">
                    아직 획득한 카드가 없습니다.
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
