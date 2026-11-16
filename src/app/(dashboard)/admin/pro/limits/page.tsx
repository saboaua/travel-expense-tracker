"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { ProSubHeader } from "@/components/admin/ProSubHeader";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DEFAULT_LIMITS, FEATURE_FLAG, FEATURE_LABEL, type Limits, type ProFeature } from "@/lib/limits";

const FEATURES: { id: ProFeature; hint?: string }[] = [
  { id: "bills_email", hint: "Free people see Get Pro" },
  { id: "telegram_save" },
  { id: "telegram_summary" },
  { id: "doc_reminders", hint: "By push and Telegram" },
];

export default function ProLimitsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [l, setL] = useState<Limits>(DEFAULT_LIMITS);
  const [num, setNum] = useState({ scans: "10", free: "2", pro: "100" });

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/admin/pro-limits");
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) setError(json.error || "Could not load.");
      else { setL(json.limits); setNum({ scans: String(json.limits.free_ai_scans), free: String(json.limits.free_documents), pro: String(json.limits.pro_documents) }); }
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true); setError(null); setNotice(null);
    const res = await fetch("/api/admin/pro-limits", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...l, free_ai_scans: num.scans, free_documents: num.free, pro_documents: num.pro }) });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return setError(json.error || "Could not save.");
    setL(json.limits); setNotice(l.starts_on ? "Saved. The limits start on the day you chose." : "Saved. The limits are off until you choose a start day.");
  };
  const flip = (f: ProFeature) => setL((x) => ({ ...x, [FEATURE_FLAG[f]]: !x[FEATURE_FLAG[f]] }));

  return (
    <div className="mx-auto max-w-xl space-y-5 p-4 md:p-8">
      <ProSubHeader active="limits" title="Free plan limits" description="What Free and Pro get" />
      {error && <Alert>{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}
      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <>
          <Card><CardContent className="space-y-1.5 py-4">
            <label htmlFor="lim-start" className="text-sm font-semibold">Limits start on</label>
            <Input id="lim-start" type="date" value={l.starts_on ?? ""} onChange={(e) => setL((x) => ({ ...x, starts_on: e.target.value || null }))} data-testid="lim-start" />
            <p className="text-xs leading-relaxed text-muted-foreground">Before this date everything works as it does today. Empty means the limits are off.</p>
          </CardContent></Card>
          <Card><CardContent className="space-y-3 py-4">
            <p className="text-sm font-semibold">AI scans each month</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><label htmlFor="lim-scans" className="text-sm font-medium">Free</label><Input id="lim-scans" inputMode="numeric" value={num.scans} onChange={(e) => setNum((n) => ({ ...n, scans: e.target.value }))} /></div>
              <div className="space-y-1.5"><span className="text-sm font-medium">Pro</span><div className="flex h-10 items-center rounded-lg border bg-muted px-3 text-sm text-muted-foreground">No limit</div></div>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">Over the limit, scanning still works on the phone. AI comes back on the 1st.</p>
          </CardContent></Card>
          <Card><CardContent className="space-y-3 py-4">
            <p className="text-sm font-semibold">Documents</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><label htmlFor="lim-free-docs" className="text-sm font-medium">Free</label><Input id="lim-free-docs" inputMode="numeric" value={num.free} onChange={(e) => setNum((n) => ({ ...n, free: e.target.value }))} /></div>
              <div className="space-y-1.5"><label htmlFor="lim-pro-docs" className="text-sm font-medium">Pro</label><Input id="lim-pro-docs" inputMode="numeric" value={num.pro} onChange={(e) => setNum((n) => ({ ...n, pro: e.target.value }))} /></div>
            </div>
          </CardContent></Card>
          <Card><CardContent className="space-y-3 py-4">
            <p className="text-sm font-semibold">Pro only</p>
            {FEATURES.map((f) => {
              const on = l[FEATURE_FLAG[f.id]] === true;
              return (
                <div key={f.id} className="flex items-center gap-3">
                  <button type="button" role="switch" aria-checked={on} aria-label={FEATURE_LABEL[f.id]} onClick={() => flip(f.id)} data-testid={`lim-${f.id}`} className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", on ? "bg-primary" : "bg-muted-foreground/30")}><span className={cn("absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all", on ? "left-[22px]" : "left-0.5")} /></button>
                  <div><p className="text-sm font-semibold">{FEATURE_LABEL[f.id]}</p>{f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}</div>
                </div>
              );
            })}
          </CardContent></Card>
          <Alert variant="info">Nothing people already saved is removed. Over a limit, they keep what they have and cannot add more. Admins and Pro always have everything.</Alert>
          <Button className="min-h-[52px] w-full" onClick={save} disabled={saving} data-testid="lim-save"><Check className="h-5 w-5" aria-hidden="true" />Save</Button>
        </>
      )}
    </div>
  );
}
