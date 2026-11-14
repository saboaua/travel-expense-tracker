import type { CSSProperties } from "react";

export type TileKind = "trip" | "receipt" | "basket" | "bolt" | "coin" | "pass";

const TILE: Record<TileKind, [string, string]> = {
  trip: ["#FF7A59", "#FF9E6B"],
  receipt: ["#7C3AED", "#A78BFA"],
  basket: ["#0D9488", "#2DD4BF"],
  bolt: ["#F97316", "#FDBA74"],
  coin: ["#16A34A", "#4ADE80"],
  pass: ["#0B63CE", "#22D3EE"],
};

function Glyph({ kind, tint }: { kind: TileKind; tint: string }) {
  switch (kind) {
    case "trip":
      return (
        <>
          <path d="M21.6 2.9 3 10c-.9.3-.9 1.5 0 1.8l5.7 2.1 2.1 5.7c.3.9 1.5.9 1.8 0L21.6 2.9z" fill="#fff" />
          <path d="M8.7 13.8 21.6 2.9" stroke={tint} strokeOpacity=".55" strokeWidth="1.6" strokeLinecap="round" />
        </>
      );
    case "receipt":
      return (
        <>
          <path d="M5 3.6A1.6 1.6 0 0 1 6.6 2h10.8A1.6 1.6 0 0 1 19 3.6V21.2l-2.5-1.7-2.2 1.7L12 19.5 9.7 21.2 7.5 19.5 5 21.2z" fill="#fff" />
          <path d="M8.6 7.4h6.8M8.6 11h6.8M8.6 14.6h4" stroke={tint} strokeOpacity=".7" strokeWidth="1.7" strokeLinecap="round" />
        </>
      );
    case "basket":
      return (
        <>
          <path d="M3 10.2h18l-1.7 8.4a2.1 2.1 0 0 1-2.1 1.7H6.8a2.1 2.1 0 0 1-2.1-1.7L3 10.2z" fill="#fff" />
          <path d="M8 10 11 4M16 10l-3-6" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity=".75" />
          <path d="M8.5 13.4v3.6M12 13.4v3.6M15.5 13.4v3.6" stroke={tint} strokeOpacity=".55" strokeWidth="1.7" strokeLinecap="round" />
        </>
      );
    case "bolt":
      return (
        <>
          <circle cx="12" cy="12" r="9.5" fill="#fff" fillOpacity=".28" />
          <path d="M13.6 3 6.2 13.1h5.2L10.4 21l7.4-10.1h-5.2z" fill="#fff" />
        </>
      );
    case "coin":
      return (
        <>
          <circle cx="9" cy="9" r="6.3" fill="#fff" fillOpacity=".38" />
          <circle cx="14.6" cy="14.6" r="6.6" fill="#fff" />
          <circle cx="14.6" cy="14.6" r="3.5" fill="none" stroke={tint} strokeOpacity=".6" strokeWidth="1.7" />
        </>
      );
    case "pass":
      return (
        <>
          <rect x="4.5" y="2.5" width="15" height="19" rx="3" fill="#fff" />
          <circle cx="12" cy="10.5" r="3.7" fill="none" stroke={tint} strokeOpacity=".65" strokeWidth="1.7" />
          <path d="M9 10.5h6M12 6.8c-1.3 1.2-1.3 6.2 0 7.4M12 6.8c1.3 1.2 1.3 6.2 0 7.4" stroke={tint} strokeOpacity=".45" strokeWidth="1.1" fill="none" />
          <path d="M8.4 17.6h7.2" stroke={tint} strokeOpacity=".6" strokeWidth="1.7" strokeLinecap="round" />
        </>
      );
  }
}

/** Gradient squircle with a white two-tone glyph. */
export function IconTile({ kind, size = 44, style }: { kind: TileKind; size?: number; style?: CSSProperties }) {
  const [a, b] = TILE[kind];
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.3),
        background: `linear-gradient(145deg, ${b}, ${a})`,
        boxShadow: `inset 0 1.5px 0 rgba(255,255,255,.55), inset 0 -2px 4px rgba(0,0,0,.12), 0 6px 14px ${a}55`,
        ...style,
      }}
    >
      <svg width={Math.round(size * 0.52)} height={Math.round(size * 0.52)} viewBox="0 0 24 24" fill="none">
        <Glyph kind={kind} tint={a} />
      </svg>
    </span>
  );
}

/** Layered sea waves along the bottom of the ocean panel. */
export function Waves() {
  return (
    <svg className="pointer-events-none absolute inset-x-0 bottom-0 h-[34%] w-full" viewBox="0 0 600 270" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 40 C120 0 210 70 330 40 S520 0 600 45 V270 H0Z" fill="#0E7FA8" opacity=".55" />
      <path d="M0 110 C130 70 240 150 360 110 S530 80 600 115 V270 H0Z" fill="#0A5A8C" />
      <path d="M0 190 C150 160 270 220 420 190 S560 175 600 195 V270 H0Z" fill="#0A2540" />
    </svg>
  );
}

export const FEATURES: { kind: TileKind; title: string; text: string }[] = [
  { kind: "trip", title: "Trips and flights", text: "Plan, track and expense every trip" },
  { kind: "receipt", title: "Receipts", text: "Scan once, sorted for you" },
  { kind: "basket", title: "Groceries", text: "Find the cheapest store near you" },
  { kind: "bolt", title: "Bills and budget", text: "Due dates, limits, nothing missed" },
  { kind: "coin", title: "Savings", text: "Goals you can see growing" },
  { kind: "pass", title: "Documents", text: "Passports and cards, always at hand" },
];
