"use client";

import type { Symbol } from "@/types";
import { getIconComponent } from "@/lib/icons";

const INK = "#33281D";
const FRAME = "#F3ECD6";
const ICON_PALETTE = ["#3E7A72", "#C0402C", "#C9A227", "#3B4B6B", "#7A3E5C", "#6B7A3E"];
const GOLDEN_ANGLE = 2.39996323; // 라디안 (~137.5deg) — 개수에 상관없이 고르게 흩어지는 스파이럴 배치용

function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return hash;
}

function paletteColorFor(seed: string): string {
  return ICON_PALETTE[hashSeed(seed) % ICON_PALETTE.length];
}

/**
 * 카드 게임판이 아니라 단일 기호를 뱃지처럼 보여줄 때 쓰는 작은 원형 아이콘.
 * "내가 모은 카드" 트레이 등에서 DobbleCard 안의 아이콘과 동일한 색/스타일로
 * 표시해 같은 기호임을 한눈에 알아볼 수 있게 한다.
 */
export function SymbolIconBadge({ symbol, size = 44 }: { symbol: Symbol; size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: `2px solid ${INK}`,
        background: paletteColorFor(symbol.id),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {[symbol].map((s) => {
        const IconComp = getIconComponent(s.icon_name);
        return s.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={s.id}
            src={s.image_url}
            alt={s.label}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : IconComp ? (
          <IconComp key={s.id} size={size * 0.58} color={FRAME} stroke={1.75} />
        ) : (
          <span
            key={s.id}
            style={{
              fontFamily: "var(--font-gowun-batang), serif",
              fontSize: size * 0.36,
              fontWeight: 700,
              color: FRAME,
            }}
          >
            {s.label.charAt(0)}
          </span>
        );
      })}
    </div>
  );
}

/**
 * 중앙 카드 옆에 놓는 "카드 뒷면 스택" 장식. 진짜 도블처럼 카드를 한 장씩 뽑아
 * 보여준다는 느낌을 주기 위한 순수 장식용 컴포넌트 — 클릭 불가, 실제 데이터 없음.
 */
export function CardStackDecoration({ size = 100 }: { size?: number }) {
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: `3px solid ${INK}`,
            background: FRAME,
            transform: `rotate(${(i - 1) * 7}deg) translate(${(i - 1) * 4}px, ${(2 - i) * 3}px)`,
            opacity: 0.45 + i * 0.18,
          }}
        />
      ))}
    </div>
  );
}

interface Slot {
  x: number; // 카드 크기 대비 중심 x 비율(0~1)
  y: number;
  size: number; // 카드 크기 대비 아이콘 지름 비율
  rotation: number; // deg
}

/**
 * 심볼마다 결정적(카드+심볼 조합 시드) 위치/크기/회전을 부여한다. 골든앵글
 * 스파이럴로 배치해서 3~8개 어떤 개수든 자연스럽게 흩뿌려지고 서로 살짝 겹친다.
 * cardId가 다르면 같은 심볼이라도 카드마다 다른 위치/크기/각도로 보인다 —
 * 실제 도블처럼 두 카드 속 같은 기호가 서로 다르게 그려지는 효과.
 */
function computeSlot(symbolId: string, cardId: string, index: number, total: number): Slot {
  const seed = `${cardId}:${symbolId}`;
  const h1 = hashSeed(seed + ":angle");
  const h2 = hashSeed(seed + ":radius");
  const h3 = hashSeed(seed + ":size");
  const h4 = hashSeed(seed + ":rot");

  const angle = index * GOLDEN_ANGLE + ((h1 % 20) - 10) * (Math.PI / 180);
  const radiusFactor = Math.sqrt((index + 0.5) / total);
  const maxRadius = 0.32;
  const radius = maxRadius * radiusFactor * (0.85 + (h2 % 20) / 100);

  const x = 0.5 + radius * Math.cos(angle);
  const y = 0.5 + radius * Math.sin(angle);
  const size = 0.26 * (0.85 + (h3 % 30) / 100); // 85%~115%
  const rotation = (h4 % 61) - 30; // -30~30deg

  return { x, y, size, rotation };
}

export interface DobbleCardProps {
  symbols: Symbol[];
  /** 카드마다 다른 배치가 되도록 하는 시드(보통 card_index). 없으면 두 카드가 똑같이 배치됨. */
  cardId?: string;
  onSymbolClick?: (symbolId: string) => void;
  size?: number;
}

/**
 * 도블 카드 1장: 기호(아이콘)들을 원형 카드 안에 결정적 랜덤 위치·회전·크기로
 * 흩뿌려 배치한다. 겹침을 의도적으로 허용해 실제 도블 카드처럼 보이게 한다.
 */
export default function DobbleCard({ symbols, cardId = "", onSymbolClick, size = 320 }: DobbleCardProps) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: `3px solid ${INK}`,
        background: FRAME,
        position: "relative",
        boxSizing: "border-box",
      }}
    >
      {symbols.map((symbol, i) => {
        const slot = computeSlot(symbol.id, cardId, i, symbols.length);
        const iconSize = size * slot.size;
        const IconComp = getIconComponent(symbol.icon_name);
        return (
          <button
            key={symbol.id}
            type="button"
            onClick={() => onSymbolClick?.(symbol.id)}
            style={{
              position: "absolute",
              left: size * slot.x - iconSize / 2,
              top: size * slot.y - iconSize / 2,
              width: iconSize,
              height: iconSize,
              borderRadius: "50%",
              border: `2px solid ${INK}`,
              background: paletteColorFor(symbol.id),
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              transform: `rotate(${slot.rotation}deg)`,
              cursor: onSymbolClick ? "pointer" : "default",
              padding: 0,
            }}
          >
            {symbol.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={symbol.image_url}
                alt={symbol.label}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : IconComp ? (
              <IconComp size={iconSize * 0.58} color={FRAME} stroke={1.75} />
            ) : (
              <span
                style={{
                  fontFamily: "var(--font-gowun-batang), serif",
                  fontSize: iconSize * 0.36,
                  fontWeight: 700,
                  color: FRAME,
                }}
              >
                {symbol.label.charAt(0)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
