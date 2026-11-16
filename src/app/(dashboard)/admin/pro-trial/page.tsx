"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { BackLink, PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DEFAULT_TRIAL, trialSummary, type TrialMode, type TrialSettings } from "@/lib/pro-trial";

const MODES: { id: TrialMode; label: string; hint: string }[] = [
  { id: "always", label: "Always", hint: "Every new account gets the free month" },
  { id: "dates", label: "Only between two dates", hint: "For a promotion, such as one month" },
  { id: "off", label: "Off", hint: "New accounts start on Free" },
];

export default function ProTrialPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [t, setT] = useState<TrialSettings>(DEFAULT_TRIAL);
  const [days, setDays] = useState("30");
  const [today, setToday] = useState("");

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/admin/pro-trial");
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) setError(json.error || "Could not load.");
      else { setT(json.trial); setDays(String(json.trial.days)); setToday(json.today); }
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true); setError(null); setNotice(null);
    const res = await fetch("/api/admin/pro-trial", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...t, days }) });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return setError(json.error || "Could not save.");
    setT(json.trial); setToday(json.today); setNotice("Saved. It applies to accounts created from now on.");
  };

  return (
    <div className="mx-auto max-w-xl space-y-5 p-4 md:p-8">
      <BackLink href="/admin/plans">Plans and access</BackLink>
      <PageHeader title="Free Pro month" description="Let new accounts try Pro before they buy it" />
      {error && <Alert>{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}
      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <>
          <p className="rounded-xl bg-muted px-4 py-3 text-sm font-semibold" data-testid="trial-summary">{trialSummary(t, today)}</p>
          <Card><CardContent className="space-y-2 py-4">
            <p className="text-sm font-semibold" id="trial-mode-label">Who gets it</p>
            <div role="radiogroup" aria-labelledby="trial-mode-label" className="space-y-2">
              {MODES.map((m) => (
                <button key={m.id} type="button" role="radio" aria-checked={t.mode === m.id} onClick={() => setT((x) => ({ ...x, mode: m.id }))} data-testid={`trial-mode-${m.id}`}
                  className={cn("flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 text-left", t.mode === m.id ? "border-primary bg-primary/5" : "bg-card")}>
                  <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border", t.mode === m.id ? "border-primary bg-primary text-primary-foreground" : "")}>{t.mode === m.id && <Check className="h-4 w-4" aria-hidden="true" />}</span>
                  <span><span className="block text-[15px] font-bold">{m.label}</span><span className="block text-xs text-muted-foreground">{m.hint}</span></span>
                </button>
              ))}
            </div>
          </CardContent></Card>
          {t.mode === "dates" && (
            <Card><CardContent className="space-y-3 py-4">
              <div className="space-y-1.5"><label htmlFor="trial-from" className="text-sm font-semibold">First day</label><Input id="trial-from" type="date" value={t.from_date ?? ""} onChange={(e) => setT((x) => ({ ...x, from_date: e.target.value || null }))} data-testid="trial-from" /></div>
              <div className="space-y-1.5"><label htmlFor="trial-to" className="text-sm font-semibold">Last day</label><Input id="trial-to" type="date" value={t.to_date ?? ""} onChange={(e) => setT((x) => ({ ...x, to_date: e.target.value || null }))} data-testid="trial-to" /></div>
              <p className="text-xs leading-relaxed text-muted-foreground">Only accounts created on these days get the free month. For one month, choose its first and last day.</p>
            </CardContent></Card>
          )}
          <Card><CardContent className="space-y-1.5 py-4">
            <label htmlFor="trial-days" className="text-sm font-semibold">Days of Pro</label>
            <Input id="trial-days" type="number" inputMode="numeric" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} data-testid="trial-days" />
            <p className="text-xs leading-relaxed text-muted-foreground">Counted from the day the account is created. When it ends the account goes back to Free. Nothing is deleted.</p>
          </CardContent></Card>
          <Button onClick={save} disabled={saving} className="min-h-12 w-full" data-testid="trial-save">{saving ? "Saving…" : "Save"}</Button>
          <p className="text-xs leading-relaxed text-muted-foreground">People who already have an account are not changed. Nobody gets the free month twice. You can still give or end Pro for one person under Plans and access.</p>
        </>
      )}
    </div>
  );
}
