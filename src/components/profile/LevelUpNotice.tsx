"use client";

import { useEffect, useMemo, useState } from "react";
import { Share2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { TIERS, levelUpToShow, progress, readBadge, tierOf, plural, type BadgeState } from "@/lib/personal/badges";
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
  const lvl = t.level;
  const headline = lvl === 1 ? "Your first badge!" : `You are a ${t.name}!`;
  const sparkle = (c: string, size: number, pos: React.CSSProperties) => <svg width={size} height={size} viewBox="0 0 24 24" fill={c} style={{ position: "absolute", ...pos }} aria-hidden="true"><path d="M12 1l2.6 8.4L23 12l-8.4 2.6L12 23l-2.6-8.4L1 12l8.4-2.6z" /></svg>;
  return (
    <>
      <style>{CSS}</style>
      <div className="fixed inset-0 z-[55] flex items-end justify-center overflow-hidden bg-slate-900/60" role="dialog" aria-modal="true" aria-label={`New badge: ${t.name}`} data-testid="level-up">
        <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-hidden="true">
          {pieces.map((c, i) => <i key={i} className="lu-conf" style={{ left: `${c.left}%`, width: c.w, background: c.c, animationDuration: `${c.d}s`, animationDelay: `${c.delay}s` }} />)}
        </div>
        <div className="relative max-h-[96vh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-white px-4 pb-5 pt-3 shadow-2xl dark:bg-slate-900" style={{ ["--lu-to" as string]: b.total }}>
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300" aria-hidden="true" />
          <button type="button" onClick={done} aria-label="Close" className="absolute right-3.5 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800"><X className="h-[18px] w-[18px]" aria-hidden="true" /></button>
          <div className="flex justify-center">
            <div className="lu-rise inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3.5 py-1.5 text-xs font-extrabold tracking-wider text-amber-800">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#f59e0b" aria-hidden="true"><path d="M12 1l2.6 8.4L23 12l-8.4 2.6L12 23l-2.6-8.4L1 12l8.4-2.6z" /></svg>CONGRATULATIONS!
            </div>
          </div>
          <div className="relative mx-auto flex h-48 w-48 items-center justify-center">
            <div className="lu-glow absolute inset-0 rounded-full" style={{ background: `radial-gradient(circle, ${t.tint} 0%, rgba(255,255,255,0) 70%)` }} />
            <div className="lu-spin absolute inset-3.5 rounded-full border-2 border-dashed opacity-80" style={{ borderColor: t.light }} />
            {sparkle("#f59e0b", 22, { top: 6, right: 30 })}{sparkle("#60a5fa", 14, { bottom: 30, left: 20 })}{sparkle("#facc15", 18, { bottom: 22, right: 18 })}{sparkle("#f472b6", 12, { top: 32, left: 18 })}
            <div className="lu-pop relative drop-shadow-xl"><BadgeShield level={lvl} size={120} /></div>
          </div>
          <p className="lu-rise text-center text-3xl font-extrabold leading-tight" style={{ animationDelay: ".6s" }}>{headline}</p>
          <p className="lu-rise mx-1.5 mt-2 text-center text-[15px] leading-snug text-slate-700 dark:text-slate-300" style={{ animationDelay: ".7s" }}>
            {lvl === 1 ? "You shared your first price. Every price you add helps someone find a cheaper store." : (
              <>You have shared <b><span className="lu-cnt" data-testid="level-up-count" /> {b.total === 1 ? "price" : "prices"}</b>. <span className="sr-only">That is {plural(b.total)}. </span>{lvl === 5 ? "Few people get this far. Thank you." : "Thank you for helping everyone find cheaper groceries."}</>
            )}
          </p>
          <div className="mt-3.5 rounded-2xl border bg-card p-3">
            <p className="mb-2 text-xs font-bold tracking-wide text-slate-600 dark:text-slate-300">YOUR PATH</p>
            <div className="flex justify-between gap-1">
              {TIERS.map((x) => (
                <div key={x.level} className="flex-1 text-center">
                  <div className="mx-auto flex h-[52px] w-[52px] items-center justify-center rounded-xl" style={x.level === lvl ? { outline: `2px solid ${x.dark}`, outlineOffset: 1 } : undefined}><BadgeShield level={x.level} size={42} locked={x.level > lvl} /></div>
                  <p className={`mt-1 text-[10.5px] ${x.level <= lvl ? "font-bold text-foreground" : "text-slate-400"}`}>{x.name}</p>
                  <p className="text-[10.5px] text-slate-400">{x.from.toLocaleString("en-US")}</p>
                </div>
              ))}
            </div>
          </div>
          {p.next ? (
            <div className="lu-rise mt-2.5 rounded-2xl border bg-slate-50 p-3 dark:bg-slate-800" style={{ animationDelay: ".9s" }}>
              <div className="flex justify-between text-sm"><span>Next level: <b style={{ color: p.next.dark }}>{p.next.name}</b></span><span className="font-semibold text-slate-500">{p.toGo.toLocaleString("en-US")} to go</span></div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200"><div className="lu-bar h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-700" style={{ width: `${p.pct}%` }} /></div>
              <div className="mt-1.5 flex justify-between text-xs text-slate-400"><span>{b.total.toLocaleString("en-US")} / {p.next.from.toLocaleString("en-US")} prices</span><span>{p.pct}% there</span></div>
            </div>
          ) : (
            <div className="mt-2.5 rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm leading-snug text-blue-900"><b>You reached the top level.</b> Thank you. Your count keeps growing, and so does the help for everyone.</div>
          )}
          <div className="mt-3.5 space-y-1.5">
            <Button className="h-12 w-full text-base" onClick={() => setSharing(true)} data-testid="level-up-share"><Share2 className="h-5 w-5" aria-hidden="true" /> Share my badge</Button>
            <Button variant="ghost" className="h-11 w-full text-[15px] font-bold text-slate-600" onClick={done} data-testid="level-up-done">Done</Button>
          </div>
        </div>
      </div>
      {sharing && <BadgeShare level={t.level} total={b.total} onClose={() => setSharing(false)} />}
    </>
  );
}
