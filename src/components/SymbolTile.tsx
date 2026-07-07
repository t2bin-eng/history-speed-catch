"use client";

import type { Symbol } from "@/types";

/**
 * Claude Design "역사 카드 디자인" 1안(빈티지 타로) 기반 구현.
 * 색상/치수는 원본 시안 값을 그대로 사용한다.
 */
const INK = "#33281D";
const FRAME = "#F3ECD6";

const ICON_PALETTE = ["#3E7A72", "#C0402C", "#C9A227", "#3B4B6B", "#7A3E5C", "#6B7A3E"];

function paletteColorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return ICON_PALETTE[hash % ICON_PALETTE.length];
}

export interface SymbolTileProps {
  symbol: Pick<Symbol, "label" | "unit" | "sub_unit" | "image_url" | "description">;
  onClick?: () => void;
  selected?: boolean;
}

export default function SymbolTile({ symbol, onClick, selected }: SymbolTileProps) {
  const { label, unit, sub_unit, image_url, description } = symbol;
  const badgeLetter = (sub_unit || unit || "").charAt(0);
  const iconColor = paletteColorFor(label);

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: 260,
        height: 446,
        boxSizing: "border-box",
        background: FRAME,
        border: `2.5px solid ${INK}`,
        borderRadius: 16,
        padding: "12px 12px 8px",
        display: "flex",
        flexDirection: "column",
        fontFamily: "var(--font-gowun-batang), serif",
        color: INK,
        boxShadow: selected
          ? `0 0 0 3px ${INK}, 0 2px 6px rgba(0,0,0,.14)`
          : "0 2px 6px rgba(0,0,0,.14)",
        textAlign: "left",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <div
        style={{
          position: "relative",
          flex: "none",
          height: 250,
          border: `2px solid ${INK}`,
          borderRadius: 10,
          background: iconColor,
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image_url} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span style={{ fontSize: 64, fontWeight: 700, color: "#F3ECD6", opacity: 0.85 }}>
            {label.charAt(0)}
          </span>
        )}
        <div
          style={{
            position: "absolute",
            top: -2,
            left: -2,
            width: 36,
            height: 36,
            background: FRAME,
            borderRight: `2px solid ${INK}`,
            borderBottom: `2px solid ${INK}`,
            borderRadius: "8px 0 14px 0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: 15,
          }}
        >
          {badgeLetter}
        </div>
        <div
          style={{
            position: "absolute",
            bottom: -2,
            right: -2,
            width: 36,
            height: 36,
            background: FRAME,
            borderLeft: `2px solid ${INK}`,
            borderTop: `2px solid ${INK}`,
            borderRadius: "14px 0 8px 0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: 15,
            transform: "rotate(180deg)",
          }}
        >
          {badgeLetter}
        </div>
      </div>
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 7,
          textAlign: "center",
          padding: "6px 6px 0",
        }}
      >
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: 7, textIndent: 7 }}>{label}</div>
        <div
          style={{
            fontFamily: "var(--font-noto-sans-kr), sans-serif",
            fontSize: 11,
            letterSpacing: 2,
            opacity: 0.65,
          }}
        >
          {[sub_unit, unit].filter(Boolean).join(" · ")}
        </div>
        <div style={{ width: 30, height: 2, background: INK, opacity: 0.5 }} />
        <div
          style={{
            fontFamily: "var(--font-noto-sans-kr), sans-serif",
            fontSize: 12,
            lineHeight: 1.55,
            color: "#4C4032",
          }}
        >
          {description}
        </div>
      </div>
    </button>
  );
}
