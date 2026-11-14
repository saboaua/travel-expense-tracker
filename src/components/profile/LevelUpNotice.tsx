"use client";

import { useEffect, useMemo, useState } from "react";
import { Share2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { levelUpToShow, progress, readBadge, tierOf, plural, type BadgeState } from "@/lib/personal/badges";
import { BadgeShield } from "@/components/profile/BadgeShield";
import { BadgeShare } from "@/components/profile/BadgeShare";
import { Button } from "@/components/ui/button";

const CONFETTI = ["#f59e0b", "#34d399", "#60a5fa", "#f472b6", "#facc15", "#a78bfa", "#fb7185"];
const CSS = `
@property --lu-n{syntax:'<integer>';initial-value:0;inherits:false}
@keyframes lu-pop{0%{transform:scale(.15) rotate(-14deg);opacity:0}30%{opacity:1}55%{transform:scale(1.18) rotate(5deg)}75%{transform:scale(.94) rotate(-2deg)}100%{transform:scale(1) rotate(0);opacity:1}}
@keyframes lu-rise{0%{opacity:0;transform:translateY(14px)}100%{opacity:1;transform:none}}
@keyframes lu-glow{0%,100%{opacity:.4}50%{opacity:.8}}
@keyframes lu-spin{to{transform:rotate(360deg)}}
@keyframes lu-fall{0%{transform:translateY(-30px) rotate(0);opacity:0}10%{opacity:1}100%{transform:translateY(110vh) rotate(540deg);opacity:1}}
@keyframes lu-count{to{--lu-n:var(--lu-to)}}
@keyframes lu-bar{from{width:0}}
.lu-pop{animation:lu-pop .9s ease-out both}
.lu-rise{animation:lu-rise .6s ease-out both}
.lu-glow{animation:lu-glow 3s ease-in-out infinite,lu-spin 14s linear infinite}
.lu-conf{position:absolute;top:0;height:14px;border-radius:2px;animation:lu-fall linear both}
.lu-cnt{animation:lu-count 1.4s .5s ease-out forwards;counter-reset:lun var(--lu-n)}
.lu-cnt::after{content:counter(lun)}
.lu-bar{animation:lu-bar 1.2s .9s ease-out both}
@media (prefers-reduced-motion:reduce){.lu-pop,.lu-rise,.lu-glow,.lu-conf,.lu-cnt,.lu-bar{animation:none!important}.lu-cnt{--lu-n:var(--lu-to)}.lu-conf{display:none}}
`;

/** Shown once when a new badge level is reached: the badge pops in, confetti falls, the count climbs, and the person can share it. `check` changes when prices were just shared, so it looks again. */
export function LevelUpNotice({ check = 0 }: { check?: number }) {
  const [b, setB] = useState<BadgeState | null>(null);
  const [sharing, setSharing] = useState(false);
  useEffect(() => {
    (async () => {
      const r = await createClient().rpc("my_badge");
      if (!r.error) { const s = readBadge(r.data); setB(levelUpToShow(s) ? s : null); }
    })().catch(() => {});
  }, [check]);
  const pieces = useMemo(() => Array.from({ length: 24 }, (_, k) => ({ left: (k * 41 + 7) % 97, w: 7 + (k % 3) * 2, d: 3.4 + (k % 4) * 0.5, delay: 0.5 + (k % 8) * 0.12, c: CONFETTI[k % CONFETTI.length] })), []);
  if (!b) return null;
  const t = tierOf(levelUpToShow(b));
  if (!t) return null;
  const p = progress(b.total);
  const done = async () => { setB(null); try { await createClient().rpc("ack_badge"); } catch { /* shown again next time */ } };
  return (
    <>
      <style>{CSS}</style>
      <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden p-4" style={{ background: `linear-gradient(165deg, ${t.dark}, #0f766e)` }} role="dialog" aria-modal="true" aria-label={`New badge: ${t.name}`} data-testid="level-up">
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          {pieces.map((c, i) => <i key={i} className="lu-conf" style={{ left: `${c.left}%`, width: c.w, background: c.c, animationDuration: `${c.d}s`, animationDelay: `${c.delay}s` }} />)}
        </div>
        <div className="relative flex w-full max-w-sm flex-col items-center text-center text-white" style={{ ["--lu-to" as string]: b.total }}>
          <div className="relative flex h-44 w-44 items-center justify-center">
            <div className="lu-glow absolute -inset-5 rounded-full blur-md" style={{ background: "conic-gradient(rgba(255,255,255,0),rgba(255,255,255,.55),rgba(255,255,255,0),rgba(255,255,255,.45),rgba(255,255,255,0),rgba(255,255,255,.5),rgba(255,255,255,0))" }} />
            <div className="lu-pop relative drop-shadow-2xl"><BadgeShield level={t.level} size={150} /></div>
          </div>
          <p className="lu-rise mt-4 text-sm font-bold tracking-widest opacity-90" style={{ animationDelay: ".5s" }}>NEW BADGE</p>
          <p className="lu-rise text-4xl font-extrabold leading-tight" style={{ animationDelay: ".6s" }}>{t.name}</p>
          <p className="lu-rise mt-3 text-base leading-snug" style={{ animationDelay: ".7s" }}>
            <b className="text-2xl"><span className="lu-cnt" data-testid="level-up-count" aria-label={String(b.total)} /></b> {b.total === 1 ? "price" : "prices"} shared.<br />
            <span className="sr-only">You have shared {plural(b.total)}. </span>Thank you for helping everyone find cheaper groceries.
          </p>
          {p.next && (
            <div className="lu-rise mt-5 w-full max-w-[280px] text-left text-sm" style={{ animationDelay: ".9s" }}>
              Next: {p.next.name} at {p.next.from.toLocaleString("en-US")}
              <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-white/30"><div className="lu-bar h-full rounded-full bg-white" style={{ width: `${p.pct}%` }} /></div>
            </div>
          )}
          <div className="lu-rise mt-6 w-full space-y-2" style={{ animationDelay: "1s" }}>
            <Button className="h-12 w-full bg-blue-700 text-base text-white hover:bg-blue-600" onClick={() => setSharing(true)} data-testid="level-up-share"><Share2 className="h-5 w-5" aria-hidden="true" /> Share my badge</Button>
            <Button variant="outline" className="h-12 w-full border-0 bg-white text-base text-slate-900 hover:bg-white/90" onClick={done} data-testid="level-up-done">Done</Button>
          </div>
        </div>
      </div>
      {sharing && <BadgeShare level={t.level} total={b.total} onClose={() => setSharing(false)} />}
    </>
  );
}
