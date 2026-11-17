"use client";

import { useEffect, useState } from "react";
import { Bell, Briefcase, Check, FileSpreadsheet, ChevronDown, ChevronUp, Mail, Plane, Send, Share2, Sparkles, FileText, type LucideIcon } from "lucide-react";
import { ProSubHeader } from "@/components/admin/ProSubHeader";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn, formatDate, todayISO } from "@/lib/utils";
import { DEFAULT_LIMITS, LIMIT_KEYS, LIMIT_LABEL, limitOn, type LimitKey, type Limits } from "@/lib/limits";

type Mode = "off" | "now" | "date";
type Num = { scans: string; free: string; pro: string; shared: string; pfree: string; ppro: string; jfree: string; jpro: string };
const addDay = (iso: string) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

const FREE_LIMITS: { key: LimitKey; icon: LucideIcon }[] = [
  { key: "ai_scans", icon: Sparkles }, { key: "documents", icon: FileText }, { key: "card_sharing", icon: Share2 }, { key: "trip_papers", icon: Plane }, { key: "projects", icon: Briefcase },
];
const PRO_ONLY: { key: LimitKey; icon: LucideIcon; hint: string }[] = [
  { key: "bills_email", icon: Mail, hint: "Free people see Get Pro" },
  { key: "telegram_save", icon: Send, hint: "Pro only" },
  { key: "telegram_summary", icon: Send, hint: "Pro only" },
  { key: "doc_reminders", icon: Bell, hint: "By push and Telegram" },
  { key: "trip_reports", icon: FileSpreadsheet, hint: "Free keeps receipt photos" },
];

export default function ProLimitsPage() {
  const today = todayISO();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [l, setL] = useState<Limits>(DEFAULT_LIMITS);
  const [modes, setModes] = useState<Record<LimitKey, Mode>>(() => Object.fromEntries(LIMIT_KEYS.map((k) => [k, "off"])) as Record<LimitKey, Mode>);
  const [open, setOpen] = useState<LimitKey | null>(null);
  const [num, setNum] = useState<Num>({ scans: "10", free: "2", pro: "100", shared: "1", pfree: "3", ppro: "50", jfree: "2", jpro: "50" });

  const apply = (lim: Limits) => {
    setL(lim);
    setModes(Object.fromEntries(LIMIT_KEYS.map((k) => [k, !lim.starts[k] ? "off" : (lim.starts[k] as string) <= today ? "now" : "date"])) as Record<LimitKey, Mode>);
    setNum({ scans: String(lim.free_ai_scans), free: String(lim.free_documents), pro: String(lim.pro_documents), shared: String(lim.free_shared_cards), pfree: String(lim.free_trip_papers), ppro: String(lim.pro_trip_papers), jfree: String(lim.free_projects), jpro: String(lim.pro_projects) });
  };
  useEffect(() => {
    (async () => {
      const res = await fetch("/api/admin/pro-limits");
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) setError(json.error || "Could not load.");
      else apply(json.limits);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setMode = (k: LimitKey, m: Mode) => {
    setModes((x) => ({ ...x, [k]: m }));
    setL((x) => {
      const cur = x.starts[k];
      const next = m === "off" ? null : m === "now" ? (cur && cur <= today ? cur : today) : (cur && cur > today ? cur : addDay(today));
      return { ...x, starts: { ...x.starts, [k]: next } };
    });
  };
  const setDate = (k: LimitKey, v: string) => setL((x) => ({ ...x, starts: { ...x.starts, [k]: v || null } }));

  const save = async () => {
    setSaving(true); setError(null); setNotice(null);
    const starts = Object.fromEntries(LIMIT_KEYS.map((k) => [k, modes[k] === "off" ? null : l.starts[k]]));
    const missing = LIMIT_KEYS.find((k) => modes[k] === "date" && !l.starts[k]);
    if (missing) { setSaving(false); return setError(`Choose a start day for ${LIMIT_LABEL[missing]}.`); }
    const res = await fetch("/api/admin/pro-limits", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ starts, free_ai_scans: num.scans, free_documents: num.free, pro_documents: num.pro, free_shared_cards: num.shared, free_trip_papers: num.pfree, pro_trip_papers: num.ppro, free_projects: num.jfree, pro_projects: num.jpro }) });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return setError(json.error || "Could not save.");
    apply(json.limits);
    setNotice("Saved. Each limit starts on the day you chose.");
  };

  const sub = (k: LimitKey): string => {
    if (k === "ai_scans") return `Free: ${num.scans} a month`;
    if (k === "documents") return `Free: ${num.free} · Pro: ${num.pro}`;
    if (k === "card_sharing") return `Free: ${num.shared} card${num.shared === "1" ? "" : "s"} shared`;
    if (k === "trip_papers") return `Free: ${num.pfree} per trip`;
    if (k === "projects") return `Free: ${num.jfree} active · Pro: ${num.jpro}`;
    return "Pro only";
  };
  const chip = (k: LimitKey) => {
    const d = l.starts[k];
    if (modes[k] === "off" || !d) return <span className="shrink-0 rounded-full border bg-muted px-2.5 py-0.5 text-xs font-bold text-muted-foreground">Off</span>;
    if (limitOn(l, k, today)) return <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-800">On</span>;
    return <span className="shrink-0 whitespace-nowrap rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-800">Starts {formatDate(d)}</span>;
  };
  const fields = (k: LimitKey) => {
    const f = (id: string, label: string, v: string, set: (s: string) => void) => (
      <div className="min-w-0 flex-1 space-y-1.5"><label htmlFor={id} className="text-sm font-medium">{label}</label><Input id={id} inputMode="numeric" value={v} onChange={(e) => set(e.target.value)} /></div>
    );
    if (k === "ai_scans") return <>{f("lim-scans", "Free: scans a month", num.scans, (s) => setNum((n) => ({ ...n, scans: s })))}<div className="min-w-0 flex-1 space-y-1.5"><span className="text-sm font-medium">Pro</span><div className="flex h-10 items-center rounded-lg border bg-muted px-3 text-sm text-muted-foreground">No limit</div></div></>;
    if (k === "documents") return <>{f("lim-free-docs", "Free", num.free, (s) => setNum((n) => ({ ...n, free: s })))}{f("lim-pro-docs", "Pro", num.pro, (s) => setNum((n) => ({ ...n, pro: s })))}</>;
    if (k === "card_sharing") return f("lim-shared", "Free can share", num.shared, (s) => setNum((n) => ({ ...n, shared: s })));
    if (k === "trip_papers") return <>{f("lim-free-papers", "Free: papers per trip", num.pfree, (s) => setNum((n) => ({ ...n, pfree: s })))}{f("lim-pro-papers", "Pro: papers per trip", num.ppro, (s) => setNum((n) => ({ ...n, ppro: s })))}</>;
    if (k === "projects") return <>{f("lim-free-projects", "Free: active projects", num.jfree, (s) => setNum((n) => ({ ...n, jfree: s })))}{f("lim-pro-projects", "Pro: active projects", num.jpro, (s) => setNum((n) => ({ ...n, jpro: s })))}</>;
    return null;
  };
  const help: Partial<Record<LimitKey, string>> = {
    ai_scans: "Over the limit, scanning still works on the phone. AI comes back on the 1st.",
    documents: "People over the limit keep what they have and cannot add more.",
    card_sharing: "Free people can keep this many cards shared. Pro and admins share as many as they like. Cards already shared stay shared.",
    trip_papers: "Trips that already hold more keep everything; they just cannot add more.",
    projects: "Only active projects count. Finished ones do not. People over the limit keep every project and can still edit them; they just cannot start another.",
  };

  const Row = ({ k, icon: Icon, first, hint }: { k: LimitKey; icon: LucideIcon; first: boolean; hint?: string }) => {
    const isOpen = open === k;
    const seg = (m: Mode, label: string) => (
      <button type="button" role="radio" aria-checked={modes[k] === m} onClick={() => setMode(k, m)} data-testid={`lim-mode-${k}-${m}`}
        className={cn("min-h-10 flex-1 rounded-[10px] text-[13.5px] font-bold transition-colors", modes[k] === m ? "bg-background text-foreground shadow" : "text-muted-foreground")}>{label}</button>
    );
    return (
      <div className={cn(!first && "border-t")}>
        <button type="button" onClick={() => setOpen(isOpen ? null : k)} aria-expanded={isOpen} data-testid={`lim-row-${k}`} className="flex min-h-[60px] w-full items-center gap-3 py-2 text-left">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden="true"><Icon className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1"><span className="block text-[14.5px] font-bold">{LIMIT_LABEL[k]}</span><span className="block text-[12.5px] text-muted-foreground">{hint && hint !== "Pro only" && modes[k] !== "off" ? hint : sub(k)}</span></span>
          {chip(k)}
          {isOpen ? <ChevronUp className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden="true" /> : <ChevronDown className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />}
        </button>
        {isOpen && (
          <div className="space-y-3 pb-3 pt-1">
            <div><p className="mb-1.5 text-[13px] font-semibold">When does it start?</p><div role="radiogroup" aria-label={`When ${LIMIT_LABEL[k]} starts`} className="flex rounded-xl bg-muted p-[3px]">{seg("off", "Off")}{seg("now", "Start now")}{seg("date", "On a date")}</div></div>
            {modes[k] === "date" && <div className="space-y-1.5"><label htmlFor={`lim-date-${k}`} className="text-sm font-medium">Start date</label><Input id={`lim-date-${k}`} type="date" min={addDay(today)} value={l.starts[k] ?? ""} onChange={(e) => setDate(k, e.target.value)} data-testid={`lim-date-${k}`} /></div>}
            {fields(k) && <div className="flex gap-3">{fields(k)}</div>}
            <p className="text-xs leading-relaxed text-muted-foreground">{help[k] ?? "Free people see Get Pro for this."}{modes[k] === "now" && " Starts today when you save."}</p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-xl space-y-5 p-4 md:p-8">
      <ProSubHeader active="limits" title="Free plan limits" description="Pick what starts, and when" />
      {error && <Alert>{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}
      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <>
          <Alert variant="info">Every feature has its own start. Switch on the ones you want now and leave the rest off. Nothing people already saved is removed. Admins and Pro always have everything.</Alert>
          <div className="space-y-1.5">
            <p className="px-0.5 text-xs font-bold tracking-wide text-muted-foreground">LIMITS ON FREE</p>
            <Card><CardContent className="py-1.5">{FREE_LIMITS.map((f, i) => <Row key={f.key} k={f.key} icon={f.icon} first={i === 0} />)}</CardContent></Card>
          </div>
          <div className="space-y-1.5">
            <p className="px-0.5 text-xs font-bold tracking-wide text-muted-foreground">PRO ONLY</p>
            <Card><CardContent className="py-1.5">{PRO_ONLY.map((f, i) => <Row key={f.key} k={f.key} icon={f.icon} first={i === 0} hint={f.hint} />)}</CardContent></Card>
          </div>
          <Button className="min-h-[52px] w-full" onClick={save} disabled={saving} data-testid="lim-save"><Check className="h-5 w-5" aria-hidden="true" />Save</Button>
        </>
      )}
    </div>
  );
}
