"use client";

import { useEffect, useState } from "react";
import { parseSymbolCsv, buildSymbolCsvTemplate } from "@/lib/csv";
import { generateDobbleDeck } from "@/lib/dobbleDeck";
import { createRoom } from "@/lib/rooms";
import { getSavedQuestionSet, saveQuestionSet } from "@/lib/savedQuestionSet";
import type { SymbolCsvRow } from "@/types";
import SymbolTile from "./SymbolTile";
import RoomQrCode from "./RoomQrCode";

function handleDownloadTemplate() {
  const csv = buildSymbolCsvTemplate();
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "기호_CSV_템플릿.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function CsvUploader() {
  const [rows, setRows] = useState<SymbolCsvRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [deck, setDeck] = useState<SymbolCsvRow[][] | null>(null);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [savedFileName, setSavedFileName] = useState<string | null>(null);
  const [savingNotice, setSavingNotice] = useState<string | null>(null);

  // 마지막으로 업로드해서 저장해 둔 CSV가 있으면 자동으로 불러온다.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = await getSavedQuestionSet();
        if (cancelled || !saved) return;
        applyParsedCsv(saved.csvText);
        setSavedFileName(saved.fileName);
      } catch (e) {
        // 저장된 세트를 못 불러와도 업로드 자체는 가능해야 하므로 조용히 무시하고
        // 콘솔에만 남긴다.
        console.error("저장된 CSV 불러오기 실패:", e);
      } finally {
        if (!cancelled) setLoadingSaved(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyParsedCsv(text: string) {
    const result = parseSymbolCsv(text);
    const errs = [...result.errors];
    let generated: SymbolCsvRow[][] | null = null;

    if (result.rows.length > 0) {
      try {
        generated = generateDobbleDeck(result.rows);
      } catch (e) {
        errs.push(e instanceof Error ? e.message : "카드 세트 생성 중 오류가 발생했습니다.");
      }
    }

    setRows(result.rows);
    setDeck(generated);
    setErrors(errs);
    return errs.length === 0 && result.rows.length > 0;
  }

  async function handleCreateRoom() {
    setCreatingRoom(true);
    setRoomError(null);
    try {
      const { roomCode } = await createRoom(rows);
      setRoomCode(roomCode);
    } catch (e) {
      setRoomError(e instanceof Error ? e.message : "방 생성 중 오류가 발생했습니다.");
    } finally {
      setCreatingRoom(false);
    }
  }

  async function handleFile(file: File) {
    const text = await file.text();
    const ok = applyParsedCsv(text);
    setSavedFileName(null);
    setRoomCode(null);

    if (ok) {
      try {
        await saveQuestionSet(text, file.name);
        setSavedFileName(file.name);
        setSavingNotice(`"${file.name}" 저장 완료 — 다음에 다시 업로드하지 않아도 자동으로 불러옵니다.`);
      } catch (e) {
        setSavingNotice(null);
        console.error("CSV 저장 실패:", e);
      }
      window.setTimeout(() => setSavingNotice(null), 4000);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <button
          type="button"
          onClick={handleDownloadTemplate}
          className="flex h-10 items-center justify-center rounded-full border border-black/[.15] px-5 text-sm"
        >
          기호 CSV 템플릿 다운로드
        </button>
        <p className="mt-2 text-xs text-gray-500">
          예시 3개 행이 들어있는 빈 양식입니다. 형식을 참고해 내용을 채우거나 지운 뒤,
          전체 기호 개수가 7 · 13(권장) · 31 · 57개가 되도록 맞춰서 업로드하세요.
        </p>
      </div>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium">기호 CSV 업로드</span>
        <input
          type="file"
          accept=".csv"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </label>

      {loadingSaved && (
        <p className="text-xs text-gray-500">저장된 CSV를 불러오는 중...</p>
      )}

      {!loadingSaved && savedFileName && (
        <p className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
          마지막으로 업로드한 &quot;{savedFileName}&quot;를 자동으로 불러왔습니다. 새 파일을 올리면 이 파일을 대체합니다.
        </p>
      )}

      {savingNotice && (
        <p className="rounded-md border border-green-200 bg-green-50 p-3 text-xs text-green-800">
          {savingNotice}
        </p>
      )}

      {errors.length > 0 && (
        <ul className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-700">
          {errors.map((err, i) => (
            <li key={i}>{err}</li>
          ))}
        </ul>
      )}

      {rows.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium">미리보기 ({rows.length}개 기호)</h3>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2">SymbolID</th>
                  <th className="px-3 py-2">Label</th>
                  <th className="px-3 py-2">Unit</th>
                  <th className="px-3 py-2">SubUnit</th>
                  <th className="px-3 py-2">Description</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.SymbolID} className="border-t">
                    <td className="px-3 py-2">{row.SymbolID}</td>
                    <td className="px-3 py-2">{row.Label}</td>
                    <td className="px-3 py-2">{row.Unit}</td>
                    <td className="px-3 py-2">{row.SubUnit}</td>
                    <td className="px-3 py-2 text-gray-500">{row.Description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {deck && (
        <div>
          <h3 className="mb-2 text-sm font-medium">
            카드 자동 생성 미리보기 (전체 {deck.length}장 중 2장 예시, 카드당 기호 {deck[0]?.length}개)
          </h3>
          <div className="flex flex-col gap-6">
            {deck.slice(0, 2).map((card, cardIndex) => (
              <div key={cardIndex}>
                <p className="mb-2 text-xs text-gray-500">카드 {cardIndex + 1}</p>
                <div className="flex flex-wrap gap-4">
                  {card.map((symbol) => (
                    <SymbolTile
                      key={symbol.SymbolID}
                      symbol={{
                        label: symbol.Label,
                        unit: symbol.Unit,
                        sub_unit: symbol.SubUnit,
                        image_url: symbol.ImageURL ?? null,
                        description: symbol.Description,
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {roomCode ? (
            <div className="mt-6 rounded-md border border-green-300 bg-green-50 p-4">
              <p className="text-sm text-green-800">방이 생성되었습니다. 학생들에게 아래 방 코드를 알려주세요.</p>
              <p className="mt-1 text-3xl font-bold tracking-widest text-green-900">{roomCode}</p>
              <div className="mt-4 flex items-center gap-4">
                <RoomQrCode roomCode={roomCode} size={120} />
                <p className="text-sm text-green-800">
                  QR코드를 스캔하면 방 코드 입력 없이 바로 닉네임만 쓰고 입장할 수 있습니다.
                </p>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <a
                  href={`/tv/${roomCode}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 items-center justify-center rounded-full border border-black/[.15] px-5 text-sm"
                >
                  TV 화면 열기
                </a>
                <a
                  href={`/control/${roomCode}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 items-center justify-center rounded-full bg-foreground px-5 text-sm text-background"
                >
                  관제 화면 열기
                </a>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleCreateRoom}
              disabled={creatingRoom}
              className="mt-6 flex h-11 items-center justify-center rounded-full bg-foreground px-6 text-background disabled:opacity-50"
            >
              {creatingRoom ? "방 생성 중..." : "방 생성"}
            </button>
          )}

          {roomError && <p className="mt-2 text-sm text-red-700">{roomError}</p>}
        </div>
      )}
    </div>
  );
}
