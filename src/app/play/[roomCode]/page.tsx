"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getPlayerSession, type PlayerSession } from "@/lib/storage";
import {
  attemptMatch,
  expirePriorityIfNeeded,
  findCommonSymbolId,
  getCurrentCardPair,
  getRoomAnswerClaims,
  submitAnswer,
  HINT_REVEAL_MS,
  PRIORITY_WINDOW_MS,
  type AnswerClaimWithDetails,
  type CardWithSymbols,
} from "@/lib/game";
import type { Choice, Room, Symbol } from "@/types";
import DobbleCard from "@/components/DobbleCard";

function choiceText(symbol: Symbol, choice: Choice): string {
  return { a: symbol.choice_a, b: symbol.choice_b, c: symbol.choice_c, d: symbol.choice_d }[choice];
}

const CHOICES: Choice[] = ["a", "b", "c", "d"];

export default function PlayPage({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const { roomCode } = use(params);
  const router = useRouter();
  // localStorage는 서버에 없으므로 첫 렌더는 항상 null로 맞추고(hydration mismatch 방지),
  // 마운트 후 이펙트에서 읽어온다.
  const [session, setSession] = useState<PlayerSession | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [playerCount, setPlayerCount] = useState<number | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [pair, setPair] = useState<[CardWithSymbols, CardWithSymbols] | null>(null);
  const [matchSubmitting, setMatchSubmitting] = useState(false);
  const [matchWrongFlash, setMatchWrongFlash] = useState(false);
  const [answerSubmitting, setAnswerSubmitting] = useState(false);
  const [chosenChoice, setChosenChoice] = useState<Choice | null>(null);
  const [lastWrongChoice, setLastWrongChoice] = useState<Choice | null>(null);
  const [answerClaims, setAnswerClaims] = useState<AnswerClaimWithDetails[]>([]);

  useEffect(() => {
    // localStorage는 서버에 없는 값이라 렌더 중에는 읽을 수 없다 — 마운트 후
    // 이펙트에서 읽어 hydration mismatch를 피하는, 클라이언트 전용 데이터의 표준 패턴이다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSession(getPlayerSession(roomCode));
    setSessionChecked(true);
  }, [roomCode]);

  useEffect(() => {
    if (sessionChecked && !session) router.replace("/student");
  }, [sessionChecked, session, router]);

  useEffect(() => {
    if (room?.status === "finished") router.replace(`/result/${roomCode}`);
  }, [room, roomCode, router]);

  useEffect(() => {
    if (!session) return;
    let active = true;

    async function loadCount() {
      const { count } = await supabase
        .from("players")
        .select("id", { count: "exact", head: true })
        .eq("room_id", session!.roomId);
      if (active) setPlayerCount(count ?? 0);
    }
    loadCount();

    const playersChannel = supabase
      .channel(`room-players-${session.roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players", filter: `room_id=eq.${session.roomId}` },
        () => loadCount()
      )
      .subscribe();

    async function loadRoom() {
      const { data } = await supabase.from("rooms").select("*").eq("id", session!.roomId).maybeSingle();
      if (active && data) setRoom(data as Room);
    }
    loadRoom();

    const roomChannel = supabase
      .channel(`room-status-${session.roomId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${session.roomId}` },
        (payload) => {
          if (active) setRoom(payload.new as Room);
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(playersChannel);
      supabase.removeChannel(roomChannel);
    };
  }, [session]);

  useEffect(() => {
    if (!session) return;
    let active = true;

    async function loadClaims() {
      const claims = await getRoomAnswerClaims(session!.roomId);
      if (active) setAnswerClaims(claims);
    }
    loadClaims();

    const channel = supabase
      .channel(`room-answer-claims-${session.roomId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "answer_claims", filter: `room_id=eq.${session.roomId}` },
        () => loadClaims()
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [session]);

  useEffect(() => {
    if (!room || room.status !== "playing") return;
    let active = true;
    getCurrentCardPair(room.id, room.current_card_pair_index).then((result) => {
      if (active) setPair(result);
    });
    return () => {
      active = false;
    };
  }, [room]);

  // 라운드가 넘어가면 이전 라운드의 선택/피드백 상태를 지운다 — 렌더 중에 바로
  // 값을 맞추는 React 공식 패턴("Adjusting state when a prop changes")을 쓴다.
  // effect 안에서 동기적으로 setState하면 불필요한 캐스케이딩 렌더가 생기기 때문.
  const [lastSeenCardPairIndex, setLastSeenCardPairIndex] = useState<number | null>(null);
  if (room && room.current_card_pair_index !== lastSeenCardPairIndex) {
    setLastSeenCardPairIndex(room.current_card_pair_index);
    setChosenChoice(null);
    setLastWrongChoice(null);
    setMatchWrongFlash(false);
  }

  // 우선권자 닉네임: 본인이면 세션에서 즉시 알 수 있고(렌더 중 계산), 남이면
  // 비동기로 조회해야 하므로 그 결과만 effect에서 보관한다.
  const [fetchedPriorityNickname, setFetchedPriorityNickname] = useState<{
    playerId: string;
    nickname: string;
  } | null>(null);
  useEffect(() => {
    if (!room?.priority_player_id || room.priority_player_id === session?.playerId) return;
    let active = true;
    const targetId = room.priority_player_id;
    supabase
      .from("players")
      .select("nickname")
      .eq("id", targetId)
      .maybeSingle()
      .then(({ data }) => {
        if (active && data) setFetchedPriorityNickname({ playerId: targetId, nickname: data.nickname });
      });
    return () => {
      active = false;
    };
  }, [room, session]);
  const priorityPlayerNickname = !room?.priority_player_id
    ? null
    : room.priority_player_id === session?.playerId
      ? (session?.nickname ?? null)
      : fetchedPriorityNickname?.playerId === room.priority_player_id
        ? fetchedPriorityNickname.nickname
        : null;

  // 우선권 독점 구간의 카운트다운: "지금 시각"을 effect(setInterval 콜백) 안에서만
  // 읽어 state로 저장한다 — 렌더 중에 Date.now()를 직접 호출하면 순수하지 않은
  // 렌더가 되므로(React Compiler 규칙 위반), 항상 저장된 now 값만 렌더에서 사용한다.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!room || room.round_phase !== "priority_answering" || !room.priority_started_at) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [room]);

  const priorityElapsedMs =
    room?.round_phase === "priority_answering" && room.priority_started_at && now
      ? Math.max(0, now - new Date(room.priority_started_at).getTime())
      : 0;
  const priorityRemainingMs =
    room?.round_phase === "priority_answering" ? Math.max(0, PRIORITY_WINDOW_MS - priorityElapsedMs) : null;

  // 50초 만료 시 전체 공개로 전환을 시도한다(조건부 UPDATE라서 여러 학생 화면이
  // 동시에 호출해도 안전하다). setState가 아니라 서버 호출이라 동기 setState 규칙과 무관.
  useEffect(() => {
    if (!room || room.round_phase !== "priority_answering") return;
    if (priorityRemainingMs !== null && priorityRemainingMs <= 0) {
      expirePriorityIfNeeded(room.id, room.current_card_pair_index);
    }
  }, [room, priorityRemainingMs]);

  const commonSymbol = useMemo(() => {
    if (!pair) return null;
    const commonId = findCommonSymbolId(pair);
    return [...pair[0].symbols, ...pair[1].symbols].find((s) => s.id === commonId) ?? null;
  }, [pair]);

  const myCards = useMemo(
    () => answerClaims.filter((c) => c.player_id === session?.playerId),
    [answerClaims, session]
  );
  const currentRoundClaim = useMemo(
    () => (room ? answerClaims.find((c) => c.card_pair_index === room.current_card_pair_index) : undefined),
    [answerClaims, room]
  );

  async function handleMatchClick(symbolId: string) {
    if (!session || !room || !pair || room.round_phase !== "matching" || matchSubmitting) return;
    const correctId = findCommonSymbolId(pair);
    if (symbolId !== correctId) {
      setMatchWrongFlash(true);
      setTimeout(() => setMatchWrongFlash(false), 500);
      return;
    }
    setMatchSubmitting(true);
    try {
      await attemptMatch(room.id, room.current_card_pair_index, session.playerId);
    } finally {
      setMatchSubmitting(false);
    }
  }

  async function handleAnswerSubmit(choice: Choice) {
    if (!session || !room || !commonSymbol || answerSubmitting) return;
    if (room.round_phase !== "priority_answering" && room.round_phase !== "open_answering") return;
    const phase = room.round_phase === "priority_answering" ? "priority" : "open";
    setAnswerSubmitting(true);
    setChosenChoice(choice);
    try {
      const result = await submitAnswer(
        room,
        room.current_card_pair_index,
        session.playerId,
        commonSymbol,
        choice,
        phase
      );
      setLastWrongChoice(result.isCorrect ? null : choice);
    } finally {
      setAnswerSubmitting(false);
    }
  }

  const isPriorityMine = Boolean(room && session && room.priority_player_id === session.playerId);
  const showHint = priorityElapsedMs >= HINT_REVEAL_MS;
  const remainingSec = priorityRemainingMs !== null ? Math.ceil(priorityRemainingMs / 1000) : null;

  const myCardsTray = session && room?.status === "playing" && myCards.length > 0 && (
    <div className="mt-6 flex w-full max-w-sm flex-col items-center gap-2">
      <p className="text-xs font-semibold text-gray-500">내가 모은 카드 ({myCards.length}개)</p>
      <div className="flex flex-wrap justify-center gap-2">
        {myCards.map((c) => (
          <span
            key={c.id}
            className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800"
          >
            {c.symbol.label}
          </span>
        ))}
      </div>
    </div>
  );

  function renderChoices() {
    if (!commonSymbol) return null;
    return (
      <div className="mt-4 grid grid-cols-1 gap-2">
        {CHOICES.map((choice) => {
          const isChosen = chosenChoice === choice;
          const isWrong = lastWrongChoice === choice;
          return (
            <button
              key={choice}
              type="button"
              disabled={answerSubmitting}
              onClick={() => handleAnswerSubmit(choice)}
              className={`rounded-lg border px-4 py-3 text-left transition disabled:opacity-50 ${
                isWrong
                  ? "border-red-400 bg-red-50"
                  : isChosen
                    ? "border-amber-400 bg-amber-50"
                    : "border-gray-300 hover:bg-amber-50"
              }`}
            >
              <span className="font-bold">{choice.toUpperCase()}.</span> {choiceText(commonSymbol, choice)}
            </button>
          );
        })}
      </div>
    );
  }

  if (room?.status === "playing" && pair && commonSymbol) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-8">
        {room.round_phase === "matching" && (
          <>
            <div className={`flex flex-col items-center gap-6 ${matchWrongFlash ? "animate-pulse" : ""}`}>
              <DobbleCard
                symbols={pair[0].symbols}
                cardId={String(pair[0].cardIndex)}
                size={280}
                onSymbolClick={handleMatchClick}
              />
              <DobbleCard
                symbols={pair[1].symbols}
                cardId={String(pair[1].cardIndex)}
                size={280}
                onSymbolClick={handleMatchClick}
              />
            </div>
            <p className="text-sm text-gray-500">
              {matchWrongFlash ? "아직 아니에요! 다시 찾아보세요." : "두 카드에 공통으로 있는 기호를 찾아 눌러보세요!"}
            </p>
          </>
        )}

        {room.round_phase === "priority_answering" && isPriorityMine && (
          <div className="w-full max-w-sm text-center">
            <p className="text-sm font-semibold text-amber-700">
              우선권 획득! {remainingSec ?? "-"}초 안에 답하세요
            </p>
            <h2 className="mt-2 text-lg font-bold">{commonSymbol.question_text}</h2>
            {renderChoices()}
          </div>
        )}

        {room.round_phase === "priority_answering" && !isPriorityMine && (
          <div className="max-w-sm text-center">
            <p className="text-lg font-bold">{priorityPlayerNickname ?? "누군가"}님이 우선권을 얻어 답변 중입니다</p>
            <p className="mt-1 text-sm text-gray-500">{remainingSec ?? "-"}초 후 전체에게 공개됩니다</p>
            {showHint && (
              <p className="mt-4 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">힌트: {commonSymbol.hint}</p>
            )}
          </div>
        )}

        {room.round_phase === "open_answering" && (
          <div className="w-full max-w-sm text-center">
            <p className="text-sm font-semibold text-red-700">전체 공개! 먼저 맞히면 카드를 획득합니다</p>
            <h2 className="mt-2 text-lg font-bold">{commonSymbol.question_text}</h2>
            {renderChoices()}
          </div>
        )}

        {room.round_phase === "resolved" && (
          <div className="max-w-sm text-center">
            <p className="text-lg font-bold">
              {currentRoundClaim ? `${currentRoundClaim.player_nickname}님 정답!` : "이번 라운드 종료"}
            </p>
            <p className="mt-2 text-sm text-gray-600">
              정답: {commonSymbol.correct_choice ? choiceText(commonSymbol, commonSymbol.correct_choice) : "-"}
            </p>
            <p className="mt-1 text-xs text-gray-400">{commonSymbol.description}</p>
            <p className="mt-4 text-sm text-gray-400">선생님이 다음 카드로 넘기면 자동으로 전환됩니다.</p>
          </div>
        )}

        {myCardsTray}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm text-gray-500">방 코드 {roomCode}</p>
      <h1 className="text-2xl font-bold">
        {session ? `${session.nickname}님, 대기 중입니다` : "대기 중..."}
      </h1>
      <p className="text-gray-600">
        {playerCount === null ? "참여자 수 확인 중..." : `현재 ${playerCount}명 참여 중`}
      </p>
      <p className="text-sm text-gray-400">선생님이 게임을 시작하면 자동으로 화면이 전환됩니다.</p>
    </div>
  );
}
