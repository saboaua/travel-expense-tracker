/** Pure helpers for the "Where it goes" pie on Personal. */
import type { SpentArea } from "./budget";

export type Slice = { key: SpentArea; value: number; percent: number };
export type PieSlice = { key: SpentArea; percent: number; d: string; label: { x: number; y: number } | null };

const AREAS: SpentArea[] = ["groceries", "utilities", "quick", "house", "savings"];

/** The parts that have money, biggest first. Percentages are whole numbers that add up to 100 (largest remainder). */
export function slices(by: Record<SpentArea, number>): Slice[] {
  const parts = AREAS.map((key) => ({ key, value: Math.max(0, Number(by[key]) || 0) })).filter((p) => p.value > 0).sort((a, b) => b.value - a.value);
  const total = parts.reduce((t, p) => t + p.value, 0);
  if (!total) return [];
  const raw = parts.map((p) => (p.value / total) * 100);
  const pct = raw.map(Math.floor);
  let left = 100 - pct.reduce((a, b) => a + b, 0);
  raw.map((r, i) => ({ i, f: r - Math.floor(r) })).sort((a, b) => b.f - a.f).forEach(({ i }) => { if (left > 0) { pct[i]++; left--; } });
  return parts.map((p, i) => ({ ...p, percent: pct[i] }));
}

const pt = (r: number, a: number) => [100 + r * Math.cos((a * Math.PI) / 180), 100 + r * Math.sin((a * Math.PI) / 180)] as const;

/** SVG ring slices (outer 96, hole 44) from 12 o'clock clockwise, with a thin gap between parts. A label spot for slices of 12% or more. */
export function pieSlices(list: Slice[], outer = 96, inner = 44): PieSlice[] {
  const total = list.reduce((t, s) => t + s.value, 0);
  let a = -90;
  return list.map((s) => {
    const sweep = (s.value / total) * 360;
    const full = list.length === 1;
    const g = full ? 0 : 0.5;
    const a0 = a + g, a1 = a + sweep - g;
    a += sweep;
    let d: string;
    if (full) {
      d = `M100,${100 - outer} A${outer},${outer} 0 1 1 100,${100 + outer} A${outer},${outer} 0 1 1 100,${100 - outer} Z M100,${100 - inner} A${inner},${inner} 0 1 0 100,${100 + inner} A${inner},${inner} 0 1 0 100,${100 - inner} Z`;
    } else {
      const large = a1 - a0 > 180 ? 1 : 0;
      const [x0, y0] = pt(outer, a0), [x1, y1] = pt(outer, a1), [x2, y2] = pt(inner, a1), [x3, y3] = pt(inner, a0);
      d = `M${x0.toFixed(2)},${y0.toFixed(2)} A${outer},${outer} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)} L${x2.toFixed(2)},${y2.toFixed(2)} A${inner},${inner} 0 ${large} 0 ${x3.toFixed(2)},${y3.toFixed(2)} Z`;
    }
    const mid = pt((outer + inner) / 2, a - sweep / 2);
    return { key: s.key, percent: s.percent, d, label: s.percent >= 12 ? { x: mid[0], y: mid[1] } : null };
  });
}
