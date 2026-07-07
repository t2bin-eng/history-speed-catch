import Papa from "papaparse";
import type { SymbolCsvRow } from "@/types";

const REQUIRED_COLUMNS = [
  "SymbolID",
  "Label",
  "Unit",
  "SubUnit",
  "Description",
  "Hint",
  "MemoryHook",
] as const;

export interface ParseSymbolCsvResult {
  rows: SymbolCsvRow[];
  errors: string[];
}

export function parseSymbolCsv(csvText: string): ParseSymbolCsvResult {
  const errors: string[] = [];
  const { data, meta, errors: parseErrors } = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  parseErrors.forEach((e) => errors.push(`CSV 파싱 오류 (${(e.row ?? 0) + 2}행): ${e.message}`));

  const missingColumns = REQUIRED_COLUMNS.filter((col) => !meta.fields?.includes(col));
  if (missingColumns.length > 0) {
    errors.push(`필수 컬럼 누락: ${missingColumns.join(", ")}`);
    return { rows: [], errors };
  }

  const rows: SymbolCsvRow[] = [];
  const seenIds = new Set<string>();
  const duplicateIds = new Set<string>();

  data.forEach((row, i) => {
    const rowNum = i + 2; // 헤더가 1행이므로 데이터는 2행부터
    const missing = REQUIRED_COLUMNS.filter((col) => !row[col]?.trim());
    if (missing.length > 0) {
      errors.push(`${rowNum}행: 필수 값 누락 (${missing.join(", ")})`);
      return;
    }

    const symbolId = row.SymbolID.trim();
    if (seenIds.has(symbolId)) duplicateIds.add(symbolId);
    seenIds.add(symbolId);

    rows.push({
      SymbolID: symbolId,
      Label: row.Label.trim(),
      Unit: row.Unit.trim(),
      SubUnit: row.SubUnit.trim(),
      ImageURL: row.ImageURL?.trim() || undefined,
      Description: row.Description.trim(),
      Hint: row.Hint.trim(),
      MemoryHook: row.MemoryHook.trim(),
    });
  });

  if (duplicateIds.size > 0) {
    errors.push(`SymbolID 중복: ${[...duplicateIds].join(", ")}`);
  }

  return { rows, errors };
}
