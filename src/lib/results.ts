import { supabase } from "./supabaseClient";
import type { Player } from "@/types";

export interface PlayerResult {
  playerId: string;
  nickname: string;
  score: number;
  attempts: number;
  correctCount: number;
  accuracy: number; // 0~1
  avgReactionMs: number | null;
}

/**
 * 방의 최종 결과를 집계한다.
 * 반응 속도 = 정답 claim의 claimed_at - 해당 카드 쌍의 round_starts.started_at
 */
export async function getRoomResults(roomId: string): Promise<PlayerResult[]> {
  const [{ data: players }, { data: claims }, { data: roundStarts }] = await Promise.all([
    supabase.from("players").select("*").eq("room_id", roomId),
    supabase
      .from("card_claims")
      .select("player_id, card_pair_index, is_correct, claimed_at")
      .eq("room_id", roomId),
    supabase.from("round_starts").select("card_pair_index, started_at").eq("room_id", roomId),
  ]);

  const startMap = new Map<number, string>(
    (roundStarts ?? []).map((r) => [r.card_pair_index as number, r.started_at as string])
  );

  return ((players ?? []) as Player[])
    .map((player) => {
      const own = (claims ?? []).filter((c) => c.player_id === player.id);
      const correct = own.filter((c) => c.is_correct);
      const reactionTimes = correct
        .map((c) => {
          const start = startMap.get(c.card_pair_index as number);
          if (!start) return null;
          const ms = new Date(c.claimed_at as string).getTime() - new Date(start).getTime();
          return ms >= 0 ? ms : null;
        })
        .filter((v): v is number => v !== null);

      return {
        playerId: player.id,
        nickname: player.nickname,
        score: player.score,
        attempts: own.length,
        correctCount: correct.length,
        accuracy: own.length > 0 ? correct.length / own.length : 0,
        avgReactionMs:
          reactionTimes.length > 0
            ? reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length
            : null,
      };
    })
    .sort((a, b) => b.score - a.score);
}
