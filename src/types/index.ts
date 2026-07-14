/**
 * 공통 타입 정의 (명세서 §7 Supabase 데이터 모델 기준)
 *
 * DB 컬럼명(snake_case)을 그대로 따른다 — supabase-js가 반환하는 row와
 * 1:1로 매핑되므로 변환 계층 없이 바로 사용할 수 있다.
 */

export type RoomStatus = "waiting" | "playing" | "finished";
export type RoundPhase = "matching" | "priority_answering" | "open_answering" | "resolved";
export type Choice = "a" | "b" | "c" | "d";
/** 'jackpot': 누가 맞히든 5배. 'chance': 1등이 아닌 사람이 맞히면 3배+1등 카드 스틸. */
export type RoundBonus = "none" | "jackpot" | "chance";

export interface Room {
  id: string;
  room_code: string;
  status: RoomStatus;
  current_card_pair_index: number;
  round_phase: RoundPhase;
  priority_player_id: string | null;
  priority_started_at: string | null;
  /** 지금 중앙에 공개된 카드(교사의 "카드 제시"로 바뀜). 첫 제시 전에는 null. */
  current_center_card_id: string | null;
  /** 우선권자가 매칭한 기호. 학생마다 개인 카드가 달라 라운드 공통 기호가 없으므로
   *  우선권 확정 시점에 이걸로 "이번 라운드의 문제"를 고정한다. */
  priority_symbol_id: string | null;
  round_bonus: RoundBonus;
  /** 찬스턴에서 카드를 빼앗긴 1등의 닉네임. 라운드 종료 화면에 잠깐 보여주고
   *  다음 카드 제시 때 비워진다. */
  last_steal_victim_nickname: string | null;
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
  /** 입장 시 배정받아 게임 내내 유지하는 개인 카드(진짜 도블처럼). */
  card_id: string | null;
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
