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
 * 방의 최종 결과를 집계한다. "정답"은 이제 도블 매칭이 아니라 매칭 이후의
 * 역사 문제를 실제로 맞혔는지(answer_claims)로 판단한다 — 이게 진짜 학습 평가 지표다.
 * 반응 속도 = 정답 claim의 claimed_at - 해당 카드 쌍의 round_starts.started_at
 * (매칭에 걸린 시간 + 문제 풀이 시간을 합친, "그 라운드를 해결하는 데 걸린 총 시간").
 */
export async function getRoomResults(roomId: string): Promise<PlayerResult[]> {
  const [{ data: players }, { data: claims }, { data: roundStarts }] = await Promise.all([
    supabase.from("players").select("*").eq("room_id", roomId),
    supabase
      .from("answer_claims")
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
