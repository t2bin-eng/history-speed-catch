import { supabase } from "./supabaseClient";
import { generateDobbleDeck } from "./dobbleDeck";
import { ICON_NAMES } from "./icons";
import type { Room, RoundBonus, SymbolCsvRow } from "@/types";

// 상위권 독식 완화용 보너스 라운드 확률. 잭팟이 우선 판정되고(모두에게 5배),
// 안 걸리면 6라운드(인덱스 5)부터 찬스턴(1등이 아니면 3배+카드 스틸)을 굴린다.
const JACKPOT_PROBABILITY = 0.125;
const CHANCE_ROUND_MIN_INDEX = 5;
const CHANCE_ROUND_PROBABILITY = 0.3;

function generateRoomCode(): string {
  return String(Math.floor(10000 + Math.random() * 90000)); // 5자리
}

function shuffled<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export async function createRoom(
  symbolRows: SymbolCsvRow[]
): Promise<{ roomId: string; roomCode: string }> {
  if (symbolRows.length > ICON_NAMES.length) {
    throw new Error(
      `기호가 ${symbolRows.length}개인데 아이콘 풀은 ${ICON_NAMES.length}개뿐이라 중복 없이 배정할 수 없습니다.`
    );
  }

  let roomCode = generateRoomCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: existing } = await supabase
      .from("rooms")
      .select("id")
      .eq("room_code", roomCode)
      .maybeSingle();
    if (!existing) break;
    roomCode = generateRoomCode();
  }

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .insert({
      room_code: roomCode,
      status: "waiting",
      current_card_pair_index: 0,
      round_phase: "matching",
    })
    .select()
    .single();
  if (roomError || !room) throw new Error(roomError?.message ?? "방 생성에 실패했습니다.");

  // 아이콘은 매칭의 유일한 시각적 단서라 같은 방 안에서 절대 중복되면 안 된다 —
  // 풀을 셔플해서 앞에서부터 하나씩 나눠준다(색상과 달리 중복 허용 불가).
  const icons = shuffled(ICON_NAMES).slice(0, symbolRows.length);

  const { data: insertedSymbols, error: symbolsError } = await supabase
    .from("symbols")
    .insert(
      symbolRows.map((row, i) => ({
        room_id: room.id,
        label: row.Label,
        unit: row.Unit,
        sub_unit: row.SubUnit,
        image_url: row.ImageURL ?? null,
        description: row.Description,
        hint: row.Hint,
        memory_hook: row.MemoryHook,
        icon_name: icons[i],
        question_text: row.Question,
        choice_a: row.ChoiceA,
        choice_b: row.ChoiceB,
        choice_c: row.ChoiceC,
        choice_d: row.ChoiceD,
        correct_choice: row.CorrectChoice,
        difficulty: row.Difficulty,
      }))
    )
    .select();
  if (symbolsError || !insertedSymbols) {
    throw new Error(symbolsError?.message ?? "기호 저장에 실패했습니다.");
  }

  // insert 응답은 요청한 배열과 같은 순서로 반환된다(단일 다중 행 INSERT ... VALUES 기준).
  const csvToSymbolId = new Map(symbolRows.map((row, i) => [row, insertedSymbols[i].id as string]));
  const deck = generateDobbleDeck(symbolRows);

  const { error: cardsError } = await supabase.from("cards").insert(
    deck.map((card, cardIndex) => ({
      room_id: room.id,
      card_index: cardIndex,
      symbol_ids: card.map((row) => csvToSymbolId.get(row)!),
    }))
  );
  if (cardsError) throw new Error(cardsError.message);

  return { roomId: room.id, roomCode: room.room_code };
}

export async function getRoomByCode(roomCode: string): Promise<Room | null> {
  const { data, error } = await supabase
    .from("rooms")
    .select("*")
    .eq("room_code", roomCode)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Room | null;
}

async function recordRoundStart(roomId: string, cardPairIndex: number): Promise<void> {
  await supabase
    .from("round_starts")
    .upsert(
      { room_id: roomId, card_pair_index: cardPairIndex, started_at: new Date().toISOString() },
      { onConflict: "room_id,card_pair_index" }
    );
}

export async function startGame(roomId: string): Promise<void> {
  // 카드는 아직 안 나온 상태로 시작한다 — 첫 장도 교사가 "카드 제시"를 눌러야 나온다
  // (실제 도블처럼 스택에서 카드를 하나씩 꺼내는 연출을 살리기 위함).
  const { error } = await supabase.from("rooms").update({ status: "playing" }).eq("id", roomId);
  if (error) throw new Error(error.message);
}

/**
 * 학생마다 개인 카드를 갖고 있는 새 매칭 방식에서, 교사가 "카드 제시"를 누를 때마다
 * 중앙에 공개할 카드를 하나 무작위로 고른다. 문제(정답 기호)는 그냥 랜덤으로 나오면
 * 되고, 라운드를 맞힌 학생은 그 카드를 획득해 자신의 새 기준 카드로 삼는다(실제 도블의
 * "탑 쌓기" 방식 — `awardPointsAndResolve`에서 승자의 `players.card_id`를 갱신).
 *
 * 후보는 (1) 아직 한 번도 중앙에 나온 적 없고, (2) 지금 누구의 개인 카드도 아닌 카드로
 * 제한한다 — 개인 카드와 중앙 카드가 같아지면 두 카드가 100% 일치해 "공통 기호 정확히
 * 1개" 규칙이 깨진다. 후보가 소진되면(카드를 다 보여줌) 개인 카드만 제외하고 반복을
 * 허용하는 폴백으로 넘어간다 — 교사가 계속 진행할 수 있어야 하므로 하드 스톱은 두지 않는다.
 */
export async function revealNextCenterCard(roomId: string): Promise<{ done: boolean }> {
  const [{ data: allCards }, { data: reveals }, { data: players }] = await Promise.all([
    supabase.from("cards").select("id").eq("room_id", roomId),
    supabase.from("center_reveals").select("round_index, card_id").eq("room_id", roomId),
    supabase.from("players").select("card_id").eq("room_id", roomId),
  ]);
  if (!allCards || allCards.length === 0) return { done: true };

  const revealedIds = new Set((reveals ?? []).map((r) => r.card_id as string));
  const personalCardIds = new Set(
    (players ?? []).map((p) => p.card_id).filter((id): id is string => Boolean(id))
  );

  let candidates = allCards.filter((c) => !revealedIds.has(c.id) && !personalCardIds.has(c.id));
  if (candidates.length === 0) {
    candidates = allCards.filter((c) => !personalCardIds.has(c.id)); // 반복 허용 폴백
  }
  if (candidates.length === 0) {
    candidates = allCards; // 극단적 예외(카드보다 학생이 훨씬 많음) 최종 폴백
  }

  const chosen = candidates[Math.floor(Math.random() * candidates.length)];

  const roundIndex = reveals?.length ?? 0;
  const { error: revealError } = await supabase
    .from("center_reveals")
    .insert({ room_id: roomId, round_index: roundIndex, card_id: chosen.id });
  if (revealError) throw new Error(revealError.message);

  let roundBonus: RoundBonus = "none";
  if (Math.random() < JACKPOT_PROBABILITY) {
    roundBonus = "jackpot";
  } else if (roundIndex >= CHANCE_ROUND_MIN_INDEX && Math.random() < CHANCE_ROUND_PROBABILITY) {
    roundBonus = "chance";
  }

  const { error: roomError } = await supabase
    .from("rooms")
    .update({
      current_center_card_id: chosen.id,
      current_card_pair_index: roundIndex,
      round_phase: "matching",
      round_bonus: roundBonus,
      last_steal_victim_nickname: null,
      priority_player_id: null,
      priority_symbol_id: null,
      priority_started_at: null,
    })
    .eq("id", roomId);
  if (roomError) throw new Error(roomError.message);

  await recordRoundStart(roomId, roundIndex);
  return { done: false };
}

export async function endGame(roomId: string): Promise<void> {
  const { error } = await supabase.from("rooms").update({ status: "finished" }).eq("id", roomId);
  if (error) throw new Error(error.message);
}

export async function joinRoom(
  roomCode: string,
  nickname: string
): Promise<{ roomId: string; playerId: string }> {
  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("id, current_center_card_id")
    .eq("room_code", roomCode)
    .maybeSingle();
  if (roomError) throw new Error(roomError.message);
  if (!room) throw new Error("존재하지 않는 방 코드입니다.");

  const { data: cards, error: cardsError } = await supabase
    .from("cards")
    .select("id")
    .eq("room_id", room.id);
  if (cardsError) throw new Error(cardsError.message);
  if (!cards || cards.length === 0) throw new Error("이 방에는 아직 카드가 없습니다.");

  // 개인 카드는 지금 중앙에 공개된 카드와는 절대 겹치면 안 된다(겹치면 두 카드가
  // 100% 일치해 "공통 기호 정확히 1개" 규칙이 깨진다). 그 외에는 무작위로 배정 —
  // 다른 학생과 같은 카드를 받아도 무방하다(각자 독립적으로 매칭을 시도하므로 문제 없음).
  const eligible = cards.filter((c) => c.id !== room.current_center_card_id);
  const pool = eligible.length > 0 ? eligible : cards;
  const assignedCard = pool[Math.floor(Math.random() * pool.length)];

  const { data: player, error: playerError } = await supabase
    .from("players")
    .insert({ room_id: room.id, nickname, score: 0, streak: 0, card_id: assignedCard.id })
    .select()
    .single();
  if (playerError || !player) throw new Error(playerError?.message ?? "참가에 실패했습니다.");

  return { roomId: room.id, playerId: player.id };
}
