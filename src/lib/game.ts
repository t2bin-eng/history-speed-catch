import { supabase } from "./supabaseClient";
import type { Symbol } from "@/types";

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

export interface ClaimResult {
  isCorrect: boolean;
}

/**
 * 판정 로직(§7): is_correct=true는 room_id+card_pair_index 조합당 하나만 존재할 수 있도록
 * DB에 partial unique index가 걸려 있다(schema.sql). 정답을 맞혔다고 판단되면 우선
 * is_correct=true로 insert를 시도하고, 이미 다른 학생이 먼저 맞혀 unique violation(23505)이
 * 나면 오답으로 재기록한다 — "최초 클릭자만 정답" 규칙을 DB 제약으로 안전하게 강제한다.
 */
export async function submitClaim(
  roomId: string,
  cardPairIndex: number,
  playerId: string,
  symbolId: string,
  isCorrectGuess: boolean
): Promise<ClaimResult> {
  if (isCorrectGuess) {
    const { error } = await supabase.from("card_claims").insert({
      room_id: roomId,
      card_pair_index: cardPairIndex,
      player_id: playerId,
      symbol_id: symbolId,
      is_correct: true,
    });
    if (!error) return { isCorrect: true };
    if (error.code !== "23505") throw new Error(error.message);
    // 이미 다른 학생이 먼저 정답 처리됨 → 오답으로 기록하고 아래로 진행
  }

  const { error: fallbackError } = await supabase.from("card_claims").insert({
    room_id: roomId,
    card_pair_index: cardPairIndex,
    player_id: playerId,
    symbol_id: symbolId,
    is_correct: false,
  });
  if (fallbackError) throw new Error(fallbackError.message);
  return { isCorrect: false };
}
