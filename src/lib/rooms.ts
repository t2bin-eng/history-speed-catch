import { supabase } from "./supabaseClient";
import { generateDobbleDeck } from "./dobbleDeck";
import type { Room, SymbolCsvRow } from "@/types";

function generateRoomCode(): string {
  return String(Math.floor(10000 + Math.random() * 90000)); // 5자리
}

export async function createRoom(
  symbolRows: SymbolCsvRow[]
): Promise<{ roomId: string; roomCode: string }> {
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
    .insert({ room_code: roomCode, status: "waiting", current_card_pair_index: 0 })
    .select()
    .single();
  if (roomError || !room) throw new Error(roomError?.message ?? "방 생성에 실패했습니다.");

  const { data: insertedSymbols, error: symbolsError } = await supabase
    .from("symbols")
    .insert(
      symbolRows.map((row) => ({
        room_id: room.id,
        label: row.Label,
        unit: row.Unit,
        sub_unit: row.SubUnit,
        image_url: row.ImageURL ?? null,
        description: row.Description,
        hint: row.Hint,
        memory_hook: row.MemoryHook,
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
  const { error } = await supabase
    .from("rooms")
    .update({ status: "playing", current_card_pair_index: 0 })
    .eq("id", roomId);
  if (error) throw new Error(error.message);
  await recordRoundStart(roomId, 0);
}

export async function nextCard(roomId: string, nextCardPairIndex: number): Promise<void> {
  const { error } = await supabase
    .from("rooms")
    .update({ current_card_pair_index: nextCardPairIndex })
    .eq("id", roomId);
  if (error) throw new Error(error.message);
  await recordRoundStart(roomId, nextCardPairIndex);
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
    .select("id")
    .eq("room_code", roomCode)
    .maybeSingle();
  if (roomError) throw new Error(roomError.message);
  if (!room) throw new Error("존재하지 않는 방 코드입니다.");

  const { data: player, error: playerError } = await supabase
    .from("players")
    .insert({ room_id: room.id, nickname, score: 0 })
    .select()
    .single();
  if (playerError || !player) throw new Error(playerError?.message ?? "참가에 실패했습니다.");

  return { roomId: room.id, playerId: player.id };
}
