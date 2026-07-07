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
