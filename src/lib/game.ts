import { supabase } from "./supabaseClient";
import type { AnswerClaim, Choice, Room, Symbol } from "@/types";

export interface CardWithSymbols {
  cardIndex: number;
  symbols: Symbol[];
}

/**
 * 카드 쌍 인덱스 i는 card_index=i와 card_index=i+1을 비교한다.
 * 덱의 어떤 두 카드를 골라도 공통 기호가 정확히 1개이므로(유한 사영평면 성질),
 * 순서대로 인접한 카드끼리 짝지어도 게임 규칙이 항상 성립한다.
 */
export async function getCurrentCardPair(
  roomId: string,
  cardPairIndex: number
): Promise<[CardWithSymbols, CardWithSymbols] | null> {
  const { data: cards, error } = await supabase
    .from("cards")
    .select("card_index, symbol_ids")
    .eq("room_id", roomId)
    .in("card_index", [cardPairIndex, cardPairIndex + 1]);
  if (error || !cards || cards.length < 2) return null;

  const allSymbolIds = [...new Set(cards.flatMap((c) => c.symbol_ids as string[]))];
  const { data: symbols, error: symbolsError } = await supabase
    .from("symbols")
    .select("*")
    .in("id", allSymbolIds);
  if (symbolsError || !symbols) return null;

  const symbolMap = new Map((symbols as Symbol[]).map((s) => [s.id, s]));
  const sorted = [...cards].sort((a, b) => a.card_index - b.card_index);
  const pair = sorted.map((c) => ({
    cardIndex: c.card_index,
    symbols: (c.symbol_ids as string[])
      .map((id) => symbolMap.get(id))
      .filter((s): s is Symbol => Boolean(s)),
  }));

  return [pair[0], pair[1]];
}

export async function getCardCount(roomId: string): Promise<number> {
  const { count } = await supabase
    .from("cards")
    .select("id", { count: "exact", head: true })
    .eq("room_id", roomId);
  return count ?? 0;
}

export function findCommonSymbolId(pair: [CardWithSymbols, CardWithSymbols]): string {
  const idsA = new Set(pair[0].symbols.map((s) => s.id));
  const common = pair[1].symbols.find((s) => idsA.has(s.id));
  if (!common) throw new Error("카드 쌍에 공통 기호가 없습니다.");
  return common.id;
}

export const PRIORITY_WINDOW_MS = 50_000;
export const HINT_REVEAL_MS = 25_000;
const GOLDEN_ROUND_INTERVAL = 5;
const MAX_STREAK_BONUS = 3;

export function isGoldenRound(cardPairIndex: number): boolean {
  return (cardPairIndex + 1) % GOLDEN_ROUND_INTERVAL === 0;
}

/**
 * 매칭 단계에서 정답(공통 기호)을 클릭한 학생을 "우선권자"로 지정한다.
 * rooms.round_phase='matching' 조건부 UPDATE라서, 여러 명이 동시에 맞혀도
 * 그 순간 딱 한 요청만 실제로 행을 갱신하고 나머지는 영향받은 행이 0개가 되어
 * 자연히 걸러진다(card_claims의 partial unique index와 같은 목적의 다른 구현).
 * 반환값이 false면 이미 다른 학생이 우선권을 가져간 것이다.
 */
export async function attemptMatch(
  roomId: string,
  cardPairIndex: number,
  playerId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("rooms")
    .update({
      round_phase: "priority_answering",
      priority_player_id: playerId,
      priority_started_at: new Date().toISOString(),
    })
    .eq("id", roomId)
    .eq("current_card_pair_index", cardPairIndex)
    .eq("round_phase", "matching")
    .select("id");
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

/**
 * 우선권 독점 구간이 50초를 넘겼는데 아직 그대로면 전원 개방으로 전환한다.
 * 조건부 UPDATE라 여러 클라이언트(TV/학생 화면)가 동시에 호출해도 안전(idempotent) —
 * 이미 전환된 뒤라면 WHERE 조건이 더 이상 맞지 않아 그냥 아무 일도 안 일어난다.
 */
export async function expirePriorityIfNeeded(roomId: string, cardPairIndex: number): Promise<void> {
  const cutoff = new Date(Date.now() - PRIORITY_WINDOW_MS).toISOString();
  await supabase
    .from("rooms")
    .update({ round_phase: "open_answering" })
    .eq("id", roomId)
    .eq("current_card_pair_index", cardPairIndex)
    .eq("round_phase", "priority_answering")
    .lt("priority_started_at", cutoff);
}

export interface AnswerResult {
  isCorrect: boolean;
  symbol: Symbol;
  pointsAwarded: number;
}

async function awardPointsAndResolve(
  room: Room,
  cardPairIndex: number,
  playerId: string,
  symbol: Symbol
): Promise<number> {
  const { data: player } = await supabase
    .from("players")
    .select("score, streak")
    .eq("id", playerId)
    .single();
  const golden = isGoldenRound(cardPairIndex) ? 2 : 1;
  const streakBonus = player ? Math.min(player.streak, MAX_STREAK_BONUS) : 0;
  const points = symbol.difficulty * golden + streakBonus;
  if (player) {
    await supabase
      .from("players")
      .update({ score: player.score + points, streak: player.streak + 1 })
      .eq("id", playerId);
  }
  await supabase
    .from("rooms")
    .update({ round_phase: "resolved" })
    .eq("id", room.id)
    .eq("current_card_pair_index", cardPairIndex);
  return points;
}

/**
 * 문제 정답 제출. phase='priority'면 우선권자 독점 구간(정답→즉시 확정,
 * 오답→즉시 전원 개방으로 전환). phase='open'이면 기존 submitClaim과 동일한
 * race-safe 패턴(정답 insert 시도 → unique violation(23505)이면 이미 다른
 * 학생이 먼저 맞힌 것이므로 오답으로 재기록).
 */
export async function submitAnswer(
  room: Room,
  cardPairIndex: number,
  playerId: string,
  symbol: Symbol,
  chosenChoice: Choice,
  phase: "priority" | "open"
): Promise<AnswerResult> {
  const isCorrectGuess = chosenChoice === symbol.correct_choice;

  if (phase === "priority") {
    const { error } = await supabase.from("answer_claims").insert({
      room_id: room.id,
      card_pair_index: cardPairIndex,
      player_id: playerId,
      symbol_id: symbol.id,
      chosen_choice: chosenChoice,
      is_correct: isCorrectGuess,
    });
    if (error) throw new Error(error.message);

    if (isCorrectGuess) {
      const points = await awardPointsAndResolve(room, cardPairIndex, playerId, symbol);
      return { isCorrect: true, symbol, pointsAwarded: points };
    }

    await supabase.from("players").update({ streak: 0 }).eq("id", playerId);
    await supabase
      .from("rooms")
      .update({ round_phase: "open_answering" })
      .eq("id", room.id)
      .eq("current_card_pair_index", cardPairIndex)
      .eq("round_phase", "priority_answering");
    return { isCorrect: false, symbol, pointsAwarded: 0 };
  }

  if (isCorrectGuess) {
    const { error } = await supabase.from("answer_claims").insert({
      room_id: room.id,
      card_pair_index: cardPairIndex,
      player_id: playerId,
      symbol_id: symbol.id,
      chosen_choice: chosenChoice,
      is_correct: true,
    });
    if (!error) {
      const points = await awardPointsAndResolve(room, cardPairIndex, playerId, symbol);
      return { isCorrect: true, symbol, pointsAwarded: points };
    }
    if (error.code !== "23505") throw new Error(error.message);
    // 이미 다른 학생이 먼저 맞음 → 오답으로 기록하고 아래로 진행
  }

  const { error: fallbackError } = await supabase.from("answer_claims").insert({
    room_id: room.id,
    card_pair_index: cardPairIndex,
    player_id: playerId,
    symbol_id: symbol.id,
    chosen_choice: chosenChoice,
    is_correct: false,
  });
  if (fallbackError) throw new Error(fallbackError.message);
  return { isCorrect: false, symbol, pointsAwarded: 0 };
}

export interface AnswerClaimWithDetails extends AnswerClaim {
  symbol: Symbol;
  player_nickname: string;
}

interface AnswerClaimJoinRow extends AnswerClaim {
  symbols: Symbol;
  players: { nickname: string } | null;
}

/** "누가 어떤 카드를 획득했는지" 전체 기록(정답 처리분만). 카드 획득 시각화에 쓴다. */
export async function getRoomAnswerClaims(roomId: string): Promise<AnswerClaimWithDetails[]> {
  const { data, error } = await supabase
    .from("answer_claims")
    .select("*, symbols(*), players(nickname)")
    .eq("room_id", roomId)
    .eq("is_correct", true)
    .order("claimed_at", { ascending: false });
  if (error || !data) return [];
  return (data as unknown as AnswerClaimJoinRow[]).map((row) => ({
    ...row,
    symbol: row.symbols,
    player_nickname: row.players?.nickname ?? "?",
  }));
}
