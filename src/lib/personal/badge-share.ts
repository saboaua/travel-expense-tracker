import { tierOf, plural } from "@/lib/personal/badges";

/** What the shared badge picture says. No stores, no prices: only the level and the count. Pure, so it is unit-tested. */
export function shareTitle(levelName: string, firstName?: string | null): string {
  const n = (firstName ?? "").trim().slice(0, 30);
  return n ? `${n} is a ${levelName}` : `I'm a ${levelName}`;
}
export const shareLine = (total: number) => `${plural(total)} shared.`;
export const shareSub = "Helping people find cheaper groceries.";
export const shareFooter = "I share grocery prices on Lifolio";
export const shareFileName = (levelName: string) => `lifolio-${levelName.toLowerCase()}-badge.png`;

const SHIELD = "M32 3 56 11v20c0 14-10 24-24 30C18 55 8 45 8 31V11z";
const STAR = "M32 15l4.2 8.6 9.4 1.3-6.8 6.6 1.6 9.4L32 36.4l-8.4 4.5 1.6-9.4-6.8-6.6 9.4-1.3z";

/** Draws the picture (1080 x 1350) on a canvas, on the phone. Browser only. */
export function drawBadgeCard(canvas: HTMLCanvasElement, o: { level: number; total: number; firstName?: string | null; link?: string | null }): void {
  const t = tierOf(o.level);
  const ctx = canvas.getContext("2d");
  if (!t || !ctx) return;
  const W = 1080, H = 1350;
  canvas.width = W; canvas.height = H;
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, t.dark); bg.addColorStop(1, "#0f766e");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center"; ctx.fillStyle = "#ffffff";
  ctx.font = "700 40px Inter, system-ui, sans-serif";
  ctx.globalAlpha = 0.9; ctx.fillText("LIFOLIO COMMUNITY", W / 2, 150); ctx.globalAlpha = 1;
  // the shield, 560 px wide, centred
  const s = 560 / 64;
  ctx.save();
  ctx.translate((W - 64 * s) / 2, 230); ctx.scale(s, s);
  const g = ctx.createLinearGradient(8, 3, 56, 61);
  g.addColorStop(0, t.light); g.addColorStop(1, t.dark);
  ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = 30; ctx.shadowOffsetY = 10;
  ctx.fillStyle = g; ctx.fill(new Path2D(SHIELD));
  ctx.shadowColor = "transparent";
  ctx.lineWidth = 2; ctx.strokeStyle = t.dark; ctx.stroke(new Path2D(SHIELD));
  ctx.fillStyle = "#ffffff"; ctx.fill(new Path2D(STAR));
  for (let j = 0; j < o.level; j++) { ctx.beginPath(); ctx.arc(32 - (o.level - 1) * 5 + j * 10, 46, 2.2, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 110px Inter, system-ui, sans-serif";
  ctx.fillText(shareTitle(t.name, o.firstName), W / 2, 960);
  ctx.font = "500 52px Inter, system-ui, sans-serif";
  ctx.fillText(shareLine(o.total), W / 2, 1050);
  ctx.fillText(shareSub, W / 2, 1115);
  ctx.globalAlpha = 0.35; ctx.fillRect(110, 1170, W - 220, 3); ctx.globalAlpha = 0.95;
  ctx.font = "700 44px Inter, system-ui, sans-serif";
  ctx.fillText(shareFooter, W / 2, 1245);
  if (o.link) { ctx.font = "500 34px Inter, system-ui, sans-serif"; ctx.fillText(o.link.replace(/^https?:\/\//, ""), W / 2, 1300); }
  ctx.globalAlpha = 1;
}
