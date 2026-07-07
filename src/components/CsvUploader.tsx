"use client";

import { useState } from "react";
import { parseSymbolCsv } from "@/lib/csv";
import { generateDobbleDeck } from "@/lib/dobbleDeck";
import type { SymbolCsvRow } from "@/types";
import SymbolTile from "./SymbolTile";

export default function CsvUploader() {
  const [rows, setRows] = useState<SymbolCsvRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [deck, setDeck] = useState<SymbolCsvRow[][] | null>(null);

  async function handleFile(file: File) {
    const text = await file.text();
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
  }

  return (
    <div className="flex flex-col gap-6">
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
        </div>
      )}
    </div>
  );
}
