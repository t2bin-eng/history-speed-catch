import Papa from "papaparse";
import type { Choice, SymbolCsvRow } from "@/types";

const REQUIRED_COLUMNS = [
  "SymbolID",
  "Label",
  "Unit",
  "SubUnit",
  "Description",
  "Hint",
  "MemoryHook",
  "Question",
  "ChoiceA",
  "ChoiceB",
  "ChoiceC",
  "ChoiceD",
  "CorrectChoice",
  "Difficulty",
] as const;

const VALID_CHOICES: Choice[] = ["a", "b", "c", "d"];

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

    const correctChoice = row.CorrectChoice.trim().toLowerCase();
    if (!VALID_CHOICES.includes(correctChoice as Choice)) {
      errors.push(`${rowNum}행: CorrectChoice는 a/b/c/d 중 하나여야 합니다 (입력값: ${row.CorrectChoice})`);
      return;
    }

    const difficulty = Number(row.Difficulty.trim());
    if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 3) {
      errors.push(`${rowNum}행: Difficulty는 1~3 사이 정수여야 합니다 (입력값: ${row.Difficulty})`);
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
      Question: row.Question.trim(),
      ChoiceA: row.ChoiceA.trim(),
      ChoiceB: row.ChoiceB.trim(),
      ChoiceC: row.ChoiceC.trim(),
      ChoiceD: row.ChoiceD.trim(),
      CorrectChoice: correctChoice as Choice,
      Difficulty: difficulty,
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
    Question: "세종대왕이 훈민정음을 창제한 주된 목적은 무엇인가?",
    ChoiceA: "한자를 대체해 중국과의 교류를 끊기 위해",
    ChoiceB: "글을 모르는 백성이 쉽게 문자를 익히도록 하기 위해",
    ChoiceC: "양반 계층의 학문 수준을 높이기 위해",
    ChoiceD: "불교 경전을 번역하기 위해",
    CorrectChoice: "b",
    Difficulty: 1,
  },
  {
    SymbolID: "2",
    Label: "임진왜란",
    Unit: "조선",
    SubUnit: "사건",
    Description: "조선을 뒤흔든 7년의 전쟁",
    Hint: "1592년",
    MemoryHook: "임진=1592",
    Question: "임진왜란 당시 조선 수군이 연승을 거둘 수 있었던 핵심 요인은?",
    ChoiceA: "명나라 육군의 지원",
    ChoiceB: "거북선과 화포를 활용한 전술",
    ChoiceC: "일본 수군의 자진 철수",
    ChoiceD: "의병의 육상 봉쇄",
    CorrectChoice: "b",
    Difficulty: 2,
  },
  {
    SymbolID: "3",
    Label: "훈민정음",
    Unit: "조선",
    SubUnit: "유물",
    Description: "백성을 가르치는 바른 소리",
    Hint: "28자모",
    MemoryHook: "훈민=백성가르침",
    Question: "훈민정음 해례본에서 설명하는 글자 창제 원리와 관련이 깊은 것은?",
    ChoiceA: "발음 기관의 모양을 본뜬 상형 원리",
    ChoiceB: "한자의 뜻을 빌린 형성 원리",
    ChoiceC: "그림문자에서 발전한 표의 원리",
    ChoiceD: "외국 문자를 그대로 차용한 원리",
    CorrectChoice: "a",
    Difficulty: 3,
  },
];

/**
 * 예시 3행이 포함된 빈 템플릿 CSV. 이대로 업로드하면 카드 세트가 만들어질 수 없는
 * 개수(3개)라 에러가 나는 게 정상 — 참고용 형식이지 완성된 덱이 아니다.
 * 지원 개수(7, 13, 31, 57 등)까지 행을 채우거나 지운 뒤 업로드해야 한다.
 * IconURL 같은 컬럼은 없다 — 아이콘은 방 생성 시 서버가 자동으로 중복 없이 배정한다.
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
      Question: row.Question,
      ChoiceA: row.ChoiceA,
      ChoiceB: row.ChoiceB,
      ChoiceC: row.ChoiceC,
      ChoiceD: row.ChoiceD,
      CorrectChoice: row.CorrectChoice,
      Difficulty: row.Difficulty,
    }))
  );
}
