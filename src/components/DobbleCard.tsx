"use client";

import type { Symbol } from "@/types";

const INK = "#33281D";
const FRAME = "#F3ECD6";
const ICON_PALETTE = ["#3E7A72", "#C0402C", "#C9A227", "#3B4B6B", "#7A3E5C", "#6B7A3E"];

function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return hash;
}

function paletteColorFor(seed: string): string {
  return ICON_PALETTE[hashSeed(seed) % ICON_PALETTE.length];
}

function rotationFor(seed: string): number {
  return (hashSeed(seed) % 41) - 20; // -20deg ~ 20deg
}

export interface DobbleCardProps {
  symbols: Symbol[];
  onSymbolClick?: (symbolId: string) => void;
  size?: number;
}

/**
 * 도블 카드 1장: 기호들을 원형 카드 안에 랜덤(결정적 시드) 회전 배치한다.
 * SymbolTile과 달리 낱개 프레임 없이 아이콘만 배치해 "카드 위에 흩뿌려진" 느낌을 낸다.
 */
export default function DobbleCard({ symbols, onSymbolClick, size = 320 }: DobbleCardProps) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: `3px solid ${INK}`,
        background: FRAME,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "center",
        gap: size * 0.03,
        padding: size * 0.14,
        boxSizing: "border-box",
      }}
    >
      {symbols.map((symbol) => (
        <button
          key={symbol.id}
          type="button"
          onClick={() => onSymbolClick?.(symbol.id)}
          style={{
            width: size * 0.32,
            height: size * 0.32,
            borderRadius: "50%",
            border: `2px solid ${INK}`,
            background: paletteColorFor(symbol.id),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            transform: `rotate(${rotationFor(symbol.id)}deg)`,
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
          ) : (
            <span
              style={{
                fontFamily: "var(--font-gowun-batang), serif",
                fontSize: size * 0.09,
                fontWeight: 700,
                color: FRAME,
              }}
            >
              {symbol.label.charAt(0)}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
