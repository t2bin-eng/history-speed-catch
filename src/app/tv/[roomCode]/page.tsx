"use client";

import { use, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getRoomByCode } from "@/lib/rooms";
import {
  expirePriorityIfNeeded,
  getCardWithSymbols,
  getRoomAnswerClaims,
  HINT_REVEAL_MS,
  PRIORITY_WINDOW_MS,
  type AnswerClaimWithDetails,
  type CardWithSymbols,
} from "@/lib/game";
import type { Player, Room } from "@/types";
import DobbleCard, { CardStackDecoration } from "@/components/DobbleCard";
import RoomQrCode from "@/components/RoomQrCode";

const PHASE_LABEL: Record<Room["round_phase"], string> = {
  matching: "공통 기호를 찾는 중...",
  priority_answering: "우선권 답변 중",
  open_answering: "전체 공개! 먼저 맞히면 카드 획득",
  resolved: "라운드 종료",
};

interface AcquisitionBanner {
  key: string;
  nickname: string;
  label: string;
}

const BGM_TRACKS = ["/audio/bgm-1.mp3", "/audio/bgm-2.mp3"];

export default function TvPage({ params }: { params: Promise<{ roomCode: string }> }) {
  const { roomCode } = use(params);
  const [room, setRoom] = useState<Room | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [centerCard, setCenterCard] = useState<CardWithSymbols | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [answerClaims, setAnswerClaims] = useState<AnswerClaimWithDetails[]>([]);
  const [banner, setBanner] = useState<AcquisitionBanner | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);

  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const startSoundRef = useRef<HTMLAudioElement | null>(null);
  const revealSoundRef = useRef<HTMLAudioElement | null>(null);
  const acquiredSoundRef = useRef<HTMLAudioElement | null>(null);
  const bgmTrackIndexRef = useRef(0);
  const prevCenterCardIdRef = useRef<string | null>(null);

  // 실시간 이벤트 콜백 안에서 최신 players/centerCard를 읽기 위한 ref — 구독 자체를
  // players/centerCard가 바뀔 때마다 재생성하지 않기 위해 값만 매 렌더마다 갱신해둔다.
  const playersRef = useRef<Player[]>(players);
  useEffect(() => {
    playersRef.current = players;
  }, [players]);
  const centerCardRef = useRef<CardWithSymbols | null>(centerCard);
  useEffect(() => {
    centerCardRef.current = centerCard;
  }, [centerCard]);

  useEffect(() => {
    [bgmRef, startSoundRef, revealSoundRef, acquiredSoundRef].forEach((ref) => {
      if (ref.current) ref.current.muted = muted;
    });
  }, [muted]);

  // 배경음악: 게임이 진행 중일 때만 재생하고, 곡이 끝나면 두 곡을 번갈아 이어 튼다.
  useEffect(() => {
    const audio = bgmRef.current;
    if (!audio) return;
    if (room?.status === "playing") {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [room?.status]);

  function handleBgmEnded() {
    bgmTrackIndexRef.current = bgmTrackIndexRef.current === 0 ? 1 : 0;
    const audio = bgmRef.current;
    if (!audio) return;
    audio.src = BGM_TRACKS[bgmTrackIndexRef.current];
    audio.play().catch(() => {});
  }

  // 중앙 카드가 바뀔 때마다 카드 공개 효과음, 게임의 첫 카드일 때는 시작 소리도 함께.
  useEffect(() => {
    if (!centerCard || prevCenterCardIdRef.current === centerCard.cardId) return;
    const isFirstCard = prevCenterCardIdRef.current === null;
    prevCenterCardIdRef.current = centerCard.cardId;
    if (isFirstCard) startSoundRef.current?.play().catch(() => {});
    revealSoundRef.current?.play().catch(() => {});
  }, [centerCard]);

  useEffect(() => {
    let active = true;

    getRoomByCode(roomCode).then((data) => {
      if (!active) return;
      if (!data) setNotFound(true);
      else setRoom(data);
    });

    const channel = supabase
      .channel(`tv-room-${roomCode}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rooms", filter: `room_code=eq.${roomCode}` },
        (payload) => {
          if (active) setRoom(payload.new as Room);
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [roomCode]);

  useEffect(() => {
    if (!room) return;
    let active = true;

    async function loadPlayers() {
      const { data } = await supabase
        .from("players")
        .select("*")
        .eq("room_id", room!.id)
        .order("score", { ascending: false })
        .order("nickname", { ascending: true });
      if (active && data) setPlayers(data as Player[]);
    }
    loadPlayers();

    const playersChannel = supabase
      .channel(`tv-players-${room.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players", filter: `room_id=eq.${room.id}` },
        () => loadPlayers()
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(playersChannel);
    };
  }, [room]);

  // 중앙 카드는 교사가 "카드 제시"를 누를 때마다 바뀐다.
  useEffect(() => {
    if (!room?.current_center_card_id) return;
    let active = true;
    getCardWithSymbols(room.current_center_card_id).then((result) => {
      if (active) setCenterCard(result);
    });
    return () => {
      active = false;
    };
  }, [room?.current_center_card_id]);

  // 카드 획득 기록 로딩 + 실시간 구독. 정답(is_correct=true) INSERT가 오면 획득
  // 배너를 잠깐 띄운다 — 심볼/닉네임은 ref로 잡아둔 최신 centerCard/players에서 찾는다.
  useEffect(() => {
    if (!room) return;
    let active = true;

    async function loadClaims() {
      const claims = await getRoomAnswerClaims(room!.id);
      if (active) setAnswerClaims(claims);
    }
    loadClaims();

    const channel = supabase
      .channel(`tv-answer-claims-${room.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "answer_claims", filter: `room_id=eq.${room.id}` },
        (payload) => {
          const row = payload.new as { player_id: string; symbol_id: string; is_correct: boolean };
          if (row.is_correct) {
            const nickname = playersRef.current.find((p) => p.id === row.player_id)?.nickname ?? "??";
            const symbol = centerCardRef.current?.symbols.find((s) => s.id === row.symbol_id);
            setBanner({ key: `${row.player_id}-${row.symbol_id}-${Date.now()}`, nickname, label: symbol?.label ?? "" });
            setTimeout(() => setBanner(null), 3500);
            acquiredSoundRef.current?.play().catch(() => {});
          }
          loadClaims();
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [room]);

  // 우선권 독점 구간 카운트다운. Date.now()는 렌더 중이 아니라 항상 effect(타이머
  // 콜백) 안에서만 읽어 now 상태에 저장하고, 화면에 쓰는 값은 그 now로부터 계산한다.
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
  const remainingSec = priorityRemainingMs !== null ? Math.ceil(priorityRemainingMs / 1000) : null;
  const showHint = priorityElapsedMs >= HINT_REVEAL_MS;

  // 정답 기호: 우선권이 확정된 뒤(priority_symbol_id가 생긴 뒤)부터 알 수 있다.
  // 학생 화면에서 우선권을 놓친 학생이 보는 "문제 미리보기"를 전광판에도 그대로
  // 띄우고, 라운드가 풀리면 어떤 주제였는지 요약도 보여준다.
  const commonSymbol =
    centerCard && room?.priority_symbol_id
      ? (centerCard.symbols.find((s) => s.id === room.priority_symbol_id) ?? null)
      : null;

  // 50초 만료 시 전체 공개로 전환 시도 — 학생 화면과 동일한 조건부 UPDATE라서
  // 양쪽에서 동시에 호출해도 안전(idempotent)하다.
  useEffect(() => {
    if (!room || room.round_phase !== "priority_answering") return;
    if (priorityRemainingMs !== null && priorityRemainingMs <= 0) {
      expirePriorityIfNeeded(room.id, room.current_card_pair_index);
    }
  }, [room, priorityRemainingMs]);

  if (notFound) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-2xl text-red-700">존재하지 않는 방입니다.</p>
      </div>
    );
  }

  const topPlayers = players.slice(0, 5);
  const acquiredCounts = new Map<string, number>();
  answerClaims.forEach((c) => acquiredCounts.set(c.player_id, (acquiredCounts.get(c.player_id) ?? 0) + 1));
  const priorityNickname = room?.priority_player_id
    ? (players.find((p) => p.id === room.priority_player_id)?.nickname ?? null)
    : null;

  return (
    <div className="relative flex min-h-screen flex-col bg-zinc-50 px-10 py-8">
      { }
      <audio ref={bgmRef} src={BGM_TRACKS[0]} onEnded={handleBgmEnded} />
      { }
      <audio ref={startSoundRef} src="/audio/game-start.mp3" />
      { }
      <audio ref={revealSoundRef} src="/audio/card-reveal.mp3" />
      { }
      <audio ref={acquiredSoundRef} src="/audio/card-acquired.mp3" />

      <button
        type="button"
        onClick={() => setMuted((m) => !m)}
        className="fixed right-6 top-6 z-50 flex h-10 w-10 items-center justify-center rounded-full border-2 border-gray-300 bg-white text-lg shadow-sm"
        aria-label={muted ? "소리 켜기" : "소리 끄기"}
      >
        {muted ? "🔇" : "🔊"}
      </button>

      {banner && (
        <div className="fixed left-1/2 top-24 z-50 -translate-x-1/2 rounded-2xl border-4 border-amber-400 bg-white px-10 py-6 text-center shadow-2xl">
          <p className="text-3xl font-bold text-amber-700">🎉 {banner.nickname}님이 획득!</p>
          {banner.label && <p className="mt-1 text-xl text-gray-600">{banner.label}</p>}
        </div>
      )}

      <header className="flex items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <RoomQrCode roomCode={roomCode} size={100} />
          <div>
            <p className="text-3xl font-bold tracking-wide">
              방 코드 <span className="tracking-widest">{roomCode}</span>
            </p>
            {room?.status === "playing" && (
              <p className="mt-1 text-xl text-gray-500">
                {room.round_phase === "priority_answering"
                  ? `${priorityNickname ?? "누군가"}님 우선권 답변 중 (${remainingSec ?? "-"}초)`
                  : PHASE_LABEL[room.round_phase]}
              </p>
            )}
          </div>
        </div>
        <p className="text-2xl text-gray-600">참여 인원 {players.length}명</p>
      </header>

      {room?.round_phase === "priority_answering" && commonSymbol && (
        <div className="mx-auto mt-4 w-full max-w-2xl rounded-2xl border bg-white p-5 text-center shadow-sm">
          <p className="text-sm font-semibold text-gray-400">문제 미리보기 (선택지는 아직 비공개)</p>
          <p className="mt-1 text-xl font-bold">{commonSymbol.question_text}</p>
          {showHint && <p className="mt-2 text-base text-amber-700">힌트: {commonSymbol.hint}</p>}
        </div>
      )}

      {room?.round_phase === "resolved" && commonSymbol && (
        <div className="mx-auto mt-4 w-full max-w-2xl rounded-2xl border bg-white p-5 text-center shadow-sm">
          <p className="text-sm font-semibold text-gray-400">이번 라운드 주제</p>
          <p className="mt-1 text-xl font-bold">{commonSymbol.label}</p>
          <p className="mt-1 text-base text-gray-600">{commonSymbol.description}</p>
        </div>
      )}

      <div className="flex flex-1 flex-wrap items-center justify-center gap-16 py-10">
        <div className="flex flex-1 flex-wrap items-center justify-center gap-6">
          {room?.status === "playing" && centerCard ? (
            <>
              <CardStackDecoration size={140} />
              <div key={centerCard.cardId} className="deal-card-animate">
                <DobbleCard symbols={centerCard.symbols} cardId={centerCard.cardId} size={420} />
              </div>
            </>
          ) : (
            <p className="text-4xl font-bold">
              {room?.status === "playing" ? "선생님이 카드를 꺼내길 기다리는 중..." : "게임 시작을 기다리는 중..."}
            </p>
          )}
        </div>

        {topPlayers.length > 0 && (
          <aside className="w-80 flex-none rounded-xl border bg-white p-6">
            <h2 className="mb-4 text-xl font-bold">실시간 순위</h2>
            <ol className="flex flex-col gap-3">
              {topPlayers.map((p, i) => (
                <li key={p.id} className="flex items-center justify-between text-lg">
                  <span className="font-medium">
                    {i + 1}. {p.nickname}
                    <span className="ml-2 text-sm font-normal text-gray-400">
                      카드 {acquiredCounts.get(p.id) ?? 0}장
                    </span>
                  </span>
                  <span className="font-bold">{p.score}</span>
                </li>
              ))}
            </ol>
          </aside>
        )}
      </div>
    </div>
  );
}
