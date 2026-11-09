"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BackLink } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { createClient } from "@/lib/supabase/client";
import { IPTV_CLIENT_COLS, IPTV_CUSTOMER_COLS, IPTV_RENEWAL_COLS } from "@/lib/columns";
import { cn, todayISO } from "@/lib/utils";
import {
  FREQUENCIES, REMINDER_DAYS, blankSubscription, computeExpiry, frequencyLabel, isDay, validateCustomer, validateSubscription, type SubscriptionInput,
} from "@/lib/iptv";

const label = "text-xs font-semibold uppercase tracking-wider text-muted-foreground";
const field = "flex flex-col gap-1.5 text-sm font-medium";
const h = (r: Record<string, unknown>, k: string) => (r[k] == null ? "" : String(r[k]));

/** One subscription: a new client's first one, another one for an existing client, or an edit. */
export function SubscriptionEditor({ customerId, subId }: { customerId: string | null; subId: string }) {
  const isNew = subId === "new";
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const confirm = useConfirm();
  const today = useMemo(() => todayISO(), []);
  const [form, setForm] = useState<SubscriptionInput>(() => blankSubscription(today));
  const [expireTouched, setExpireTouched] = useState(false);
  const [renewalDate, setRenewalDate] = useState("");
  const [mode, setMode] = useState<"existing" | "new">(customerId ? "existing" : "new");
  const [pick, setPick] = useState(customerId ?? "");
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [renewals, setRenewals] = useState<{ id: string; renewed_on: string; frequency: string; expires_after: string }[]>([]);
  const [info, setInfo] = useState("");
  const [loaded, setLoaded] = useState(isNew);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (isNew) {
      const { data } = await supabase.from("iptv_customers").select(IPTV_CUSTOMER_COLS).order("name");
      const list = ((data ?? []) as unknown as { id: string; name: string }[]).map((c) => ({ id: c.id, name: c.name }));
      setCustomers(list);
      if (customerId) setCustomerName(list.find((c) => c.id === customerId)?.name ?? "");
      if (!pick && list[0]) setPick(list[0].id);
      return;
    }
    const { data, error: e } = await supabase.from("iptv_clients").select(IPTV_CLIENT_COLS).eq("id", subId).maybeSingle();
    if (e || !data) return setError("Could not find that subscription.");
    const r = data as unknown as Record<string, unknown>;
    setForm({
      plan: h(r, "plan"), model: h(r, "model"), order_no: h(r, "order_no"), donation: h(r, "donation"), portal: h(r, "portal"), mac: h(r, "mac"),
      device_id: h(r, "device_id"), location: h(r, "location"), date_subscribed: h(r, "date_subscribed"), frequency: h(r, "frequency"), expire_date: h(r, "expire_date"), notes: h(r, "notes"),
    });
    setRenewalDate(h(r, "renewal_date"));
    setExpireTouched(true);
    const { data: c } = await supabase.from("iptv_customers").select("name").eq("id", String(r.customer_id)).maybeSingle();
    setCustomerName((c?.name as string) ?? "");
    const { data: ren } = await supabase.from("iptv_renewals").select(IPTV_RENEWAL_COLS).eq("client_id", subId).order("renewed_on", { ascending: false });
    setRenewals((ren ?? []) as typeof renewals);
    setLoaded(true);
  }, [supabase, subId, isNew, customerId, pick]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [supabase, subId]);

  const set = (k: keyof SubscriptionInput, v: string) => setForm((f) => {
    const n = { ...f, [k]: v };
    // The expiry follows date subscribed + frequency until the admin types a different one
    if ((k === "date_subscribed" || k === "frequency") && !expireTouched && isDay(n.date_subscribed)) n.expire_date = computeExpiry(n.date_subscribed, n.frequency as never);
    return n;
  });
  useEffect(() => { if (isNew && !expireTouched && isDay(form.date_subscribed)) setForm((f) => (f.expire_date ? f : { ...f, expire_date: computeExpiry(f.date_subscribed, f.frequency as never) })); }, [isNew, expireTouched, form.date_subscribed, form.frequency]);

  const save = async () => {
    setError("");
    const v = validateSubscription(form);
    if (!v.ok) return setError(v.error);
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    let target = customerId ?? (mode === "existing" ? pick : "");
    if (isNew && (mode === "new" && !customerId)) {
      const c = validateCustomer({ name, contact });
      if (!c.ok) { setSaving(false); return setError(c.error); }
      const { data, error: e } = await supabase.from("iptv_customers").insert({ ...c.value, created_by: u.user?.id }).select("id").single();
      if (e || !data) { setSaving(false); return setError("Could not save. Check your connection and try again."); }
      target = data.id as string;
    }
    if (!target) { setSaving(false); return setError("Pick the client this subscription is for."); }
    const { error: e } = isNew
      ? await supabase.from("iptv_clients").insert({ ...v.value, customer_id: target, created_by: u.user?.id })
      : await supabase.from("iptv_clients").update(v.value).eq("id", subId);
    setSaving(false);
    if (e) return setError("Could not save. Check your connection and try again.");
    router.replace(`/admin/iptv/${target}`);
  };

  const renew = async () => {
    const { error: e } = await supabase.rpc("iptv_renew", { p_client: subId, p_on: today });
    if (e) return setError("Could not renew. Try again.");
    setInfo("Renewed."); await load();
  };
  const remove = async () => {
    if (!(await confirm({ title: "Delete this subscription?", message: "This removes it and its renewal history.", confirmLabel: "Delete", destructive: true }))) return;
    await supabase.from("iptv_clients").delete().eq("id", subId);
    router.replace(`/admin/iptv/${customerId}`);
  };

  if (!loaded) return <div className="p-8 text-sm text-muted-foreground">{error || "Loading…"}</div>;
  const back = customerId ? `/admin/iptv/${customerId}` : "/admin/iptv";
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 pb-28 md:p-8">
      <BackLink href={back}>{customerName || "IPTV clients"}</BackLink>
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{isNew ? "New subscription" : [form.plan, form.model].filter(Boolean).join(" · ")}</h1>
      {isNew && customerName && <p className="text-sm text-muted-foreground">For {customerName}. It shows up on their page and on their one link.</p>}

      {isNew && !customerId && (
        <>
          <h2 className={label}>Who is it for</h2>
          <Card className="space-y-3.5 p-4">
            <div role="group" aria-label="Who is it for" className="flex gap-1 rounded-xl bg-muted p-1">
              {([["existing", "Existing client"], ["new", "New client"]] as const).map(([k, l]) => (
                <button key={k} type="button" aria-pressed={mode === k} onClick={() => setMode(k)} disabled={k === "existing" && customers.length === 0} className={cn("min-h-11 flex-1 rounded-lg text-sm disabled:opacity-40", mode === k ? "bg-background font-semibold shadow-sm" : "text-muted-foreground")}>{l}</button>
              ))}
            </div>
            {mode === "existing" ? (
              <label className={field}>Client
                <select value={pick} onChange={(e) => setPick(e.target.value)} className="h-12 rounded-lg border border-input bg-background px-3 text-base">
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            ) : (
              <>
                <label className={field}>Client name<Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></label>
                <label className={field}>Contact (WhatsApp number or email)<Input value={contact} onChange={(e) => setContact(e.target.value)} maxLength={120} placeholder="+297 555 0142" /></label>
              </>
            )}
          </Card>
        </>
      )}

      <h2 className={label}>Service</h2>
      <Card className="space-y-3.5 p-4">
        <div className="grid grid-cols-2 gap-3">
          <label className={field}>Subscription<Input value={form.plan} onChange={(e) => set("plan", e.target.value)} maxLength={60} /></label>
          <label className={field}>Model<Input value={form.model} onChange={(e) => set("model", e.target.value)} maxLength={60} /></label>
          <label className={field}>Order #<Input value={form.order_no} onChange={(e) => set("order_no", e.target.value)} maxLength={40} /></label>
          <label className={field}>Donation<Input value={form.donation} onChange={(e) => set("donation", e.target.value)} maxLength={40} placeholder="J17454B8498X" autoCapitalize="characters" /></label>
        </div>
        <label className={field}>Portal<Input value={form.portal} onChange={(e) => set("portal", e.target.value)} placeholder="https://" /></label>
        <div className="grid grid-cols-5 gap-3">
          <label className={cn(field, "col-span-3")}>MAC<Input value={form.mac} onChange={(e) => set("mac", e.target.value)} placeholder="00:1A:79:4C:2E:91" /></label>
          <label className={cn(field, "col-span-2")}>ID<Input value={form.device_id} onChange={(e) => set("device_id", e.target.value)} maxLength={60} /></label>
        </div>
        <label className={field}>Location<Input value={form.location} onChange={(e) => set("location", e.target.value)} maxLength={80} /></label>
      </Card>

      <h2 className={label}>Dates</h2>
      <Card className="space-y-3.5 p-4">
        <label className={field}>Date subscribed<Input type="date" value={form.date_subscribed} onChange={(e) => set("date_subscribed", e.target.value)} /></label>
        <div>
          <span className="mb-1.5 block text-sm font-medium">Frequency</span>
          <div role="group" aria-label="Frequency" className="flex gap-1 rounded-xl bg-muted p-1">
            {FREQUENCIES.map((f) => <button key={f.key} type="button" aria-pressed={form.frequency === f.key} onClick={() => set("frequency", f.key)} className={cn("min-h-11 flex-1 rounded-lg text-sm", form.frequency === f.key ? "bg-background font-semibold shadow-sm" : "text-muted-foreground")}>{f.label}</button>)}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className={field}>Renewal date<Input type="date" value={renewalDate} disabled aria-describedby="renewal-help" /></label>
          <label className={field}>Expire date<Input type="date" value={form.expire_date} onChange={(e) => { setExpireTouched(true); set("expire_date", e.target.value); }} /></label>
        </div>
        <p id="renewal-help" className="text-sm text-muted-foreground">Expire date = date subscribed + frequency. Each renewal moves it forward by one more period, and “Renewal date” shows the last one. You get an alert {REMINDER_DAYS} days before it expires.</p>
      </Card>
      <label className={field}>Notes (only you see them)<Input value={form.notes} onChange={(e) => set("notes", e.target.value)} maxLength={500} /></label>

      {info && <p role="status" className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{info}</p>}
      {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
      <Button onClick={save} disabled={saving} className="h-12 w-full text-base">{saving ? "Saving…" : isNew ? (customerId || mode === "existing" ? "Add subscription" : "Add client") : "Save subscription"}</Button>
      {!isNew && (
        <>
          <button type="button" onClick={() => void renew()} className="min-h-12 w-full rounded-xl border border-primary bg-primary/10 font-semibold text-primary">Renew</button>
          <h2 className={label}>Renewal history</h2>
          <Card className="divide-y px-4">
            {renewals.length === 0 ? <p className="py-3 text-sm text-muted-foreground">No renewals yet.</p> : renewals.map((r) => (
              <p key={r.id} className="flex justify-between py-3 text-sm"><span>Renewed {r.renewed_on} · {frequencyLabel(r.frequency)}</span><span className="text-muted-foreground">until {r.expires_after}</span></p>
            ))}
          </Card>
        </>
      )}
      {!isNew && <Button variant="destructive" className="w-full" onClick={() => void remove()}>Delete subscription</Button>}
    </div>
  );
}
