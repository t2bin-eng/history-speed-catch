/**
 * 공통 타입 정의 (명세서 §7 Supabase 데이터 모델 기준)
 *
 * DB 컬럼명(snake_case)을 그대로 따른다 — supabase-js가 반환하는 row와
 * 1:1로 매핑되므로 변환 계층 없이 바로 사용할 수 있다.
 */

export type RoomStatus = "waiting" | "playing" | "finished";
export type RoundPhase = "matching" | "priority_answering" | "open_answering" | "resolved";
export type Choice = "a" | "b" | "c" | "d";

export interface Room {
  id: string;
  room_code: string;
  status: RoomStatus;
  current_card_pair_index: number;
  round_phase: RoundPhase;
  priority_player_id: string | null;
  priority_started_at: string | null;
  created_at: string;
}

export interface Symbol {
  id: string;
  room_id: string;
  label: string;
  unit: string;
  sub_unit: string;
  image_url: string | null;
  description: string;
  hint: string;
  memory_hook: string;
  icon_name: string | null;
  question_text: string;
  choice_a: string;
  choice_b: string;
  choice_c: string;
  choice_d: string;
  correct_choice: Choice | null;
  difficulty: number;
}

export interface Card {
  id: string;
  room_id: string;
  card_index: number;
  symbol_ids: string[];
}

export interface Player {
  id: string;
  room_id: string;
  nickname: string;
  score: number;
  streak: number;
  joined_at: string;
}

export interface CardClaim {
  id: string;
  room_id: string;
  card_pair_index: number;
  player_id: string;
  symbol_id: string;
  is_correct: boolean;
  claimed_at: string;
}

/** 우선권 독점/개방 구간 모두에서 "문제 정답 시도"를 기록한다. */
export interface AnswerClaim {
  id: string;
  room_id: string;
  card_pair_index: number;
  player_id: string;
  symbol_id: string;
  chosen_choice: Choice;
  is_correct: boolean;
  claimed_at: string;
}

/**
 * 기호 CSV 업로드 원본 1행 (명세서 §3).
 * DB insert 전 단계의 raw row — id/room_id는 아직 없다.
 */
export interface SymbolCsvRow {
  SymbolID: string;
  Label: string;
  Unit: string;
  SubUnit: string;
  ImageURL?: string;
  Description: string;
  Hint: string;
  MemoryHook: string;
  Question: string;
  ChoiceA: string;
  ChoiceB: string;
  ChoiceC: string;
  ChoiceD: string;
  CorrectChoice: Choice;
  Difficulty: number;
}
