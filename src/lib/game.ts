import { supabase } from "./supabaseClient";
import type { AnswerClaim, Choice, Room, Symbol } from "@/types";

export interface CardWithSymbols {
  cardId: string;
  symbols: Symbol[];
}

/** 카드 하나를 심볼까지 조인해서 가져온다. 중앙 카드/개인 카드 조회에 공통으로 쓴다. */
export async function getCardWithSymbols(cardId: string): Promise<CardWithSymbols | null> {
  const { data: card, error } = await supabase
    .from("cards")
    .select("symbol_ids")
    .eq("id", cardId)
    .maybeSingle();
  if (error || !card) return null;

  const symbolIds = card.symbol_ids as string[];
  const { data: symbols, error: symbolsError } = await supabase
    .from("symbols")
    .select("*")
    .in("id", symbolIds);
  if (symbolsError || !symbols) return null;

  const symbolMap = new Map((symbols as Symbol[]).map((s) => [s.id, s]));
  return {
    cardId,
    symbols: symbolIds.map((id) => symbolMap.get(id)).filter((s): s is Symbol => Boolean(s)),
  };
}

/** 지금 중앙에 공개된 카드. 첫 "카드 제시" 전이면 null. */
export async function getCenterCard(room: Room): Promise<CardWithSymbols | null> {
  if (!room.current_center_card_id) return null;
  return getCardWithSymbols(room.current_center_card_id);
}

/** 학생의 개인 카드(입장 시 배정, 게임 내내 고정). */
export async function getPlayerCard(playerId: string): Promise<CardWithSymbols | null> {
  const { data: player, error } = await supabase
    .from("players")
    .select("card_id")
    .eq("id", playerId)
    .maybeSingle();
  if (error || !player?.card_id) return null;
  return getCardWithSymbols(player.card_id);
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
 * 매칭 단계에서 자기 카드와 중앙 카드의 공통 기호를 클릭한 학생을 "우선권자"로
 * 지정한다. 학생마다 개인 카드가 달라 정답 기호도 사람마다 다르므로, 클릭한 기호
 * ID를 함께 받아 `priority_symbol_id`로 저장해 이후 문제 단계의 기준으로 삼는다.
 * rooms.round_phase='matching' 조건부 UPDATE라서, 여러 명이 동시에 맞혀도 그 순간
 * 딱 한 요청만 실제로 행을 갱신하고 나머지는 영향받은 행이 0개가 되어 자연히 걸러진다.
 * 반환값이 false면 이미 다른 학생이 우선권을 가져간 것이다.
 */
export async function attemptMatch(
  roomId: string,
  cardPairIndex: number,
  playerId: string,
  symbolId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("rooms")
    .update({
      round_phase: "priority_answering",
      priority_player_id: playerId,
      priority_symbol_id: symbolId,
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
    // 실제 도블의 "탑 쌓기" 방식: 라운드를 맞힌 학생은 방금 나온 중앙 카드를 획득해
    // 그 카드가 자신의 새 기준 카드가 된다(다음 라운드부터 이 카드로 매칭 시도).
    await supabase
      .from("players")
      .update({
        score: player.score + points,
        streak: player.streak + 1,
        card_id: room.current_center_card_id,
      })
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
 * 오답→즉시 전원 개방으로 전환). phase='open'이면 우선권을 이미 써버린 학생은
 * 제외하고(이 라운드에서 한 번 더 시도하는 걸 막음), race-safe 패턴(정답 insert
 * 시도 → unique violation(23505)이면 이미 다른 학생이 먼저 맞힌 것이므로 오답으로
 * 재기록)으로 첫 정답자만 카드를 가져간다.
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

  if (playerId === room.priority_player_id) {
    throw new Error("우선권 구간에서 이미 답변을 시도했습니다. 이 라운드는 다른 학생에게 공개됩니다.");
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
