import type { HistoryEntry } from "@/lib/personal/price-compare";

export const STORE_COLORS = ["#2563eb", "#0d9488", "#b45309", "#7c3aed", "#be185d", "#475569"];
const short = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** One line per store, so a price that moves at one store is not mistaken for the other store. */
export function PriceChart({ history, stores, width = 380, height = 190 }: { history: HistoryEntry[]; stores: string[]; width?: number; height?: number }) {
  if (history.length < 2) return null;
  const days = history.map((h) => Date.parse(h.date) / 86400000);
  const [d0, d1] = [Math.min(...days), Math.max(...days)];
  const prices = history.map((h) => h.price);
  const lo = Math.min(...prices), hi = Math.max(...prices);
  const pad = (hi - lo || hi * 0.1 || 1) * 0.2;
  const [ymin, ymax] = [lo - pad, hi + pad];
  const L = 38, R = 14, T = 10, B = 26;
  const X = (d: number) => L + (d1 === d0 ? 0.5 : (d - d0) / (d1 - d0)) * (width - L - R);
  const Y = (v: number) => T + ((ymax - v) / (ymax - ymin)) * (height - T - B);
  const ticks = [lo, (lo + hi) / 2, hi];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label="Price over time at each store" className="max-w-full">
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={L} x2={width - R} y1={Y(t)} y2={Y(t)} stroke="currentColor" strokeOpacity="0.12" />
          <text x={2} y={Y(t) + 4} fontSize="11" fill="currentColor" fillOpacity="0.7">{t.toFixed(2)}</text>
        </g>
      ))}
      {stores.map((s, i) => {
        const pts = history.filter((h) => h.store === s).sort((a, b) => a.date.localeCompare(b.date));
        const c = STORE_COLORS[i % STORE_COLORS.length];
        return (
          <g key={s}>
            {pts.length > 1 && <polyline points={pts.map((h) => `${X(Date.parse(h.date) / 86400000).toFixed(1)},${Y(h.price).toFixed(1)}`).join(" ")} fill="none" stroke={c} strokeWidth="2.5" strokeLinejoin="round" />}
            {pts.map((h, j) => <circle key={j} cx={X(Date.parse(h.date) / 86400000)} cy={Y(h.price)} r="4.5" fill="var(--card, #fff)" stroke={c} strokeWidth="2.5" />)}
          </g>
        );
      })}
      <text x={X(d0)} y={height - 6} fontSize="11" fill="currentColor" fillOpacity="0.7" textAnchor="start">{short(history[history.length - 1].date)}</text>
      <text x={X(d1)} y={height - 6} fontSize="11" fill="currentColor" fillOpacity="0.7" textAnchor="end">{short(history[0].date)}</text>
    </svg>
  );
}
