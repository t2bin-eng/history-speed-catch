"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import Papa from "papaparse";
import { getRoomByCode } from "@/lib/rooms";
import { getRoomResults, type PlayerResult } from "@/lib/results";
import { getPlayerSession, savePersonalRecord } from "@/lib/storage";
import type { Room } from "@/types";

export default function ResultPage({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const { roomCode } = use(params);
  const [room, setRoom] = useState<Room | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [results, setResults] = useState<PlayerResult[] | null>(null);
  const [myPlayerId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : getPlayerSession(roomCode)?.playerId ?? null
  );

  useEffect(() => {
    let active = true;
    getRoomByCode(roomCode).then((data) => {
      if (!active) return;
      if (!data) {
        setNotFound(true);
        return;
      }
      setRoom(data);
      getRoomResults(data.id).then((r) => {
        if (active) setResults(r);
      });
    });
    return () => {
      active = false;
    };
  }, [roomCode]);

  useEffect(() => {
    if (!results || !myPlayerId) return;
    const mine = results.find((r) => r.playerId === myPlayerId);
    if (!mine) return;
    savePersonalRecord({
      roomCode,
      nickname: mine.nickname,
      score: mine.score,
      accuracy: mine.accuracy,
      playedAt: new Date().toISOString(),
    });
  }, [results, myPlayerId, roomCode]);

  function handleDownloadCsv() {
    if (!results) return;
    const csv = Papa.unparse(
      results.map((r, i) => ({
        순위: i + 1,
        닉네임: r.nickname,
        점수: r.score,
        시도횟수: r.attempts,
        정답수: r.correctCount,
        정답률: `${Math.round(r.accuracy * 100)}%`,
        평균반응시간초: r.avgReactionMs !== null ? (r.avgReactionMs / 1000).toFixed(1) : "-",
      }))
    );
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `history-speed-catch-${roomCode}-결과.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (notFound) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-red-700">존재하지 않는 방입니다.</p>
      </div>
    );
  }

  if (!room || !results) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-gray-500">불러오는 중...</p>
      </div>
    );
  }

  const mine = results.find((r) => r.playerId === myPlayerId);

  return (
    <div className="mx-auto flex max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <h1 className="text-2xl font-bold">결과 — 방 코드 {roomCode}</h1>

      {mine && (
        <div className="rounded-md border bg-gray-50 p-4">
          <h2 className="mb-3 text-lg font-semibold">{mine.nickname}님의 결과</h2>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold">{mine.score}</p>
              <p className="text-sm text-gray-500">점수</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{Math.round(mine.accuracy * 100)}%</p>
              <p className="text-sm text-gray-500">정답률</p>
            </div>
            <div>
              <p className="text-2xl font-bold">
                {mine.avgReactionMs !== null ? `${(mine.avgReactionMs / 1000).toFixed(1)}초` : "-"}
              </p>
              <p className="text-sm text-gray-500">평균 반응 속도</p>
            </div>
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-2 text-lg font-semibold">전체 랭킹</h2>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2">순위</th>
                <th className="px-3 py-2">닉네임</th>
                <th className="px-3 py-2">점수</th>
                <th className="px-3 py-2">정답률</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr
                  key={r.playerId}
                  className={`border-t ${r.playerId === myPlayerId ? "bg-yellow-50" : ""}`}
                >
                  <td className="px-3 py-2">{i + 1}</td>
                  <td className="px-3 py-2">{r.nickname}</td>
                  <td className="px-3 py-2">{r.score}</td>
                  <td className="px-3 py-2">{Math.round(r.accuracy * 100)}%</td>
                </tr>
              ))}
              {results.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-gray-400">
                    참여한 학생이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/student"
          className="flex h-11 items-center justify-center rounded-full bg-foreground px-6 text-background"
        >
          다시 참여
        </Link>
        <button
          type="button"
          onClick={handleDownloadCsv}
          className="flex h-11 items-center justify-center rounded-full border border-black/[.15] px-6"
        >
          결과 CSV 다운로드 (교사용)
        </button>
      </div>
    </div>
  );
}
