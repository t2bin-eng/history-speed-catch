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

const TEMPLATE_EXAMPLE_ROWS: SymbolCsvRow[] = [
  {
    SymbolID: "1",
    Label: "세종대왕",
    Unit: "조선",
    SubUnit: "인물",
    Description: "훈민정음을 창제한 조선의 성군",
    Hint: "4대 왕",
    MemoryHook: "세종=한글",
  },
  {
    SymbolID: "2",
    Label: "임진왜란",
    Unit: "조선",
    SubUnit: "사건",
    Description: "조선을 뒤흔든 7년의 전쟁",
    Hint: "1592년",
    MemoryHook: "임진=1592",
  },
  {
    SymbolID: "3",
    Label: "훈민정음",
    Unit: "조선",
    SubUnit: "유물",
    Description: "백성을 가르치는 바른 소리",
    Hint: "28자모",
    MemoryHook: "훈민=백성가르침",
  },
];

/**
 * 예시 3행이 포함된 빈 템플릿 CSV. 이대로 업로드하면 카드 세트가 만들어질 수 없는
 * 개수(3개)라 에러가 나는 게 정상 — 참고용 형식이지 완성된 덱이 아니다.
 * 지원 개수(7, 13, 31, 57 등)까지 행을 채우거나 지운 뒤 업로드해야 한다.
 */
export function buildSymbolCsvTemplate(): string {
  return Papa.unparse(
    TEMPLATE_EXAMPLE_ROWS.map((row) => ({
      SymbolID: row.SymbolID,
      Label: row.Label,
      Unit: row.Unit,
      SubUnit: row.SubUnit,
      ImageURL: row.ImageURL ?? "",
      Description: row.Description,
      Hint: row.Hint,
      MemoryHook: row.MemoryHook,
    }))
  );
}
