"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BackLink } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { createClient } from "@/lib/supabase/client";
import { IPTV_CLIENT_COLS, IPTV_RENEWAL_COLS } from "@/lib/columns";
import { cn, todayISO } from "@/lib/utils";
import {
  FREQUENCIES, REMINDER_DAYS, blankClient, breakdownText, computeExpiry, contactUrl, daysLabel, daysLeft, frequencyLabel, isDay, renewalMessage, urgencyOf, validateClient, type ClientInput,
} from "@/lib/iptv";

type Renewal = { id: string; renewed_on: string; frequency: string; expires_after: string };
const label = "text-xs font-semibold uppercase tracking-wider text-muted-foreground";
const field = "flex flex-col gap-1.5 text-sm font-medium";
const h = (r: Record<string, unknown>, k: string) => (r[k] == null ? "" : String(r[k]));

export function IptvClientEditor({ id }: { id: string }) {
  const isNew = id === "new";
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const confirm = useConfirm();
  const today = useMemo(() => todayISO(), []);
  const [form, setForm] = useState<ClientInput>(() => blankClient(today));
  const [expireTouched, setExpireTouched] = useState(false);
  const [renewalDate, setRenewalDate] = useState("");
  const [renewals, setRenewals] = useState<Renewal[]>([]);
  const [clientUser, setClientUser] = useState<string | null>(null);
  const [shareEnabled, setShareEnabled] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(isNew);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [saving, setSaving] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [made, setMade] = useState<{ email: string; tempPassword: string } | null>(null);
  const [owner, setOwner] = useState("");

  const load = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    if (u.user) { const { data: p } = await supabase.from("profiles").select("first_name").eq("id", u.user.id).single(); setOwner((p?.first_name as string) ?? ""); }
    if (isNew) return;
    const { data, error: e } = await supabase.from("iptv_clients").select(IPTV_CLIENT_COLS).eq("id", id).maybeSingle();
    if (e || !data) return setError("Could not find that client.");
    const r = data as unknown as Record<string, unknown>;
    setForm({
      client_name: h(r, "client_name"), contact: h(r, "contact"), plan: h(r, "plan"), model: h(r, "model"), order_no: h(r, "order_no"), donation: h(r, "donation"),
      portal: h(r, "portal"), mac: h(r, "mac"), device_id: h(r, "device_id"), location: h(r, "location"), date_subscribed: h(r, "date_subscribed"),
      frequency: h(r, "frequency"), expire_date: h(r, "expire_date"), notes: h(r, "notes"),
    });
    setRenewalDate(h(r, "renewal_date"));
    setClientUser((r.client_user_id as string) ?? null);
    setShareEnabled(!!r.share_enabled);
    setExpireTouched(true);
    const { data: ren } = await supabase.from("iptv_renewals").select(IPTV_RENEWAL_COLS).eq("client_id", id).order("renewed_on", { ascending: false });
    setRenewals((ren ?? []) as Renewal[]);
    setLoaded(true);
  }, [supabase, id, isNew]);
  useEffect(() => { void load(); }, [load]);

  const set = (k: keyof ClientInput, v: string) => setForm((f) => {
    const n = { ...f, [k]: v };
    // The expiry follows date subscribed + frequency until the admin types a different one
    if ((k === "date_subscribed" || k === "frequency") && !expireTouched && isDay(n.date_subscribed)) n.expire_date = computeExpiry(n.date_subscribed, n.frequency as never);
    return n;
  });
  useEffect(() => { if (isNew && !expireTouched && isDay(form.date_subscribed)) setForm((f) => (f.expire_date ? f : { ...f, expire_date: computeExpiry(f.date_subscribed, f.frequency as never) })); }, [isNew, expireTouched, form.date_subscribed, form.frequency]);

  const save = async () => {
    setError(""); setInfo("");
    const v = validateClient(form);
    if (!v.ok) return setError(v.error);
    setSaving(true);
    if (isNew) {
      const { data: u } = await supabase.auth.getUser();
      const { data, error: e } = await supabase.from("iptv_clients").insert({ ...v.value, created_by: u.user?.id }).select("id").single();
      setSaving(false);
      if (e || !data) return setError("Could not save. Check your connection and try again.");
      router.replace(`/admin/iptv/${data.id}`);
      return;
    }
    const { error: e } = await supabase.from("iptv_clients").update(v.value).eq("id", id);
    setSaving(false);
    if (e) return setError("Could not save. Check your connection and try again.");
    setInfo("Saved."); await load();
  };

  const renew = async () => {
    const { error: e } = await supabase.rpc("iptv_renew", { p_client: id, p_on: today });
    if (e) return setError("Could not renew. Try again.");
    setInfo("Renewed."); await load();
  };
  const remove = async () => {
    if (!(await confirm({ title: `Delete ${form.client_name}?`, message: "This removes the client and their renewal history. Their link stops working.", confirmLabel: "Delete", destructive: true }))) return;
    await supabase.from("iptv_clients").delete().eq("id", id);
    router.replace("/admin/iptv");
  };

  const link = token ? `${window.location.origin}/s/${token}` : "";
  const makeLink = async () => {
    const { data, error: e } = await supabase.rpc("iptv_create_link", { p_client: id });
    if (e || typeof data !== "string") return setError("Could not make the link.");
    setToken(data); setShareEnabled(true);
  };
  const stopLink = async () => {
    if (!(await confirm({ title: "Stop this link?", message: "The old address will never work again.", confirmLabel: "Stop link", destructive: true }))) return;
    await supabase.rpc("iptv_stop_link", { p_client: id });
    setToken(null); setShareEnabled(false);
  };
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); setInfo("Copied."); } catch { setInfo("Copy did not work. Select the text and copy it."); } };

  const linkExisting = async () => {
    const { data, error: e } = await supabase.rpc("iptv_link_user", { p_client: id, p_email: loginEmail });
    if (e) return setError("Could not link.");
    if (data !== true) return setError("No account has that email. Make a login instead.");
    setLoginEmail(""); setInfo("Linked. This client now sees it under Personal."); await load();
  };
  const makeLogin = async () => {
    setError("");
    const res = await fetch("/api/admin/iptv-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: id, email: loginEmail }) });
    const d = (await res.json().catch(() => ({}))) as { error?: string; email?: string; tempPassword?: string };
    if (!res.ok || !d.tempPassword) return setError(d.error ?? "Could not make the login.");
    setMade({ email: d.email ?? loginEmail, tempPassword: d.tempPassword }); setLoginEmail(""); await load();
  };
  const unlinkUser = async () => { await supabase.rpc("iptv_unlink_user", { p_client: id }); await load(); };

  const days = isDay(form.expire_date) ? daysLeft(form.expire_date, today) : null;
  const msgUrl = contactUrl(form.contact, renewalMessage({ client_name: form.client_name || "there", plan: form.plan || "TV", expire_date: form.expire_date || today }, today, owner));

  if (!loaded) return <div className="p-8 text-sm text-muted-foreground">{error || "Loading…"}</div>;
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 pb-28 md:p-8">
      <BackLink href="/admin/iptv">IPTV clients</BackLink>
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{isNew ? "New client" : form.client_name}</h1>

      {!isNew && days !== null && (
        <section className="space-y-2 rounded-2xl bg-primary p-4 text-primary-foreground">
          <p className="flex justify-between text-sm opacity-85"><span>Time left</span><span>Expires {form.expire_date}</span></p>
          <p className="text-3xl font-bold tracking-tight">{daysLabel(days)}</p>
          <p className="text-sm opacity-85">{breakdownText(form.expire_date, today)} · {frequencyLabel(form.frequency).toLowerCase()} plan{urgencyOf(days) !== "ok" ? " · contact them" : ""}</p>
        </section>
      )}
      {!isNew && (
        <div className="grid grid-cols-2 gap-2">
          {msgUrl ? <a href={msgUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-emerald-700 font-semibold text-white">Message</a> : <span className="inline-flex min-h-12 items-center justify-center rounded-xl border text-sm text-muted-foreground">Add a contact to message</span>}
          <button type="button" onClick={() => void renew()} className="min-h-12 rounded-xl border border-primary bg-primary/10 font-semibold text-primary">Renew</button>
        </div>
      )}

      <h2 className={label}>Client</h2>
      <Card className="space-y-3.5 p-4">
        <label className={field}>Client name<Input value={form.client_name} onChange={(e) => set("client_name", e.target.value)} maxLength={80} /></label>
        <label className={field}>Contact (WhatsApp number or email)<Input value={form.contact} onChange={(e) => set("contact", e.target.value)} maxLength={120} placeholder="+297 555 0142" /></label>
        <label className={field}>Location<Input value={form.location} onChange={(e) => set("location", e.target.value)} maxLength={80} /></label>
      </Card>

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

      {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
      {info && <p role="status" className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{info}</p>}
      <Button onClick={save} disabled={saving} className="h-12 w-full text-base">{saving ? "Saving…" : isNew ? "Add client" : "Save client"}</Button>

      {!isNew && (
        <>
          <h2 className={label}>Let the client see their subscription</h2>
          <Card className="space-y-4 p-4 text-sm">
            <div className="space-y-2">
              <p className="font-semibold">1. A link</p>
              <p className="text-muted-foreground">Anyone with the link can open it. No sign-in. Shows first name, plan, dates and renewal history only.</p>
              {token ? (
                <>
                  <Input readOnly value={link} aria-label="Client link" onFocus={(e) => e.currentTarget.select()} />
                  <div className="grid grid-cols-3 gap-2">
                    <Button variant="outline" onClick={() => void copy(link)}>Copy</Button>
                    {contactUrl(form.contact, `Your TV subscription: ${link}`) ? <a href={contactUrl(form.contact, `Your TV subscription: ${link}`)!} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center justify-center rounded-lg border text-sm font-medium hover:bg-accent">Send</a> : <span />}
                    <Button variant="outline" onClick={() => void stopLink()}>Stop</Button>
                  </div>
                </>
              ) : (
                <Button variant="outline" onClick={() => void makeLink()}>{shareEnabled ? "Show the link" : "Make a link"}</Button>
              )}
            </div>
            <div className="space-y-2 border-t pt-4">
              <p className="font-semibold">2 and 3. Their own login</p>
              <p className="text-muted-foreground">A new login opens only the “My subscription” page and can be saved on the Home Screen. If they already have an app account, link it and the page appears in their Personal section.</p>
              {clientUser ? (
                <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 p-3"><span>A login is linked to this client.</span><Button variant="outline" size="sm" onClick={() => void unlinkUser()}>Unlink</Button></div>
              ) : (
                <>
                  <Input type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="client@example.com" aria-label="Client email" />
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" onClick={() => void makeLogin()} disabled={!loginEmail.includes("@")}>Make a login</Button>
                    <Button variant="outline" onClick={() => void linkExisting()} disabled={!loginEmail.includes("@")}>Link existing account</Button>
                  </div>
                </>
              )}
              {made && (
                <div className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
                  <p className="font-semibold">Login made. Send this once; it is not shown again.</p>
                  <p>Email: {made.email}</p>
                  <p>Temporary password: <span className="font-mono">{made.tempPassword}</span></p>
                  <Button variant="outline" size="sm" onClick={() => void copy(`Email: ${made.email}\nTemporary password: ${made.tempPassword}`)}>Copy</Button>
                </div>
              )}
            </div>
          </Card>

          <h2 className={label}>Renewal history</h2>
          <Card className="divide-y px-4">
            {renewals.length === 0 ? <p className="py-3 text-sm text-muted-foreground">No renewals yet.</p> : renewals.map((r) => (
              <p key={r.id} className="flex justify-between py-3 text-sm"><span>Renewed {r.renewed_on} · {frequencyLabel(r.frequency)}</span><span className="text-muted-foreground">until {r.expires_after}</span></p>
            ))}
          </Card>
          <Button variant="destructive" className="w-full" onClick={() => void remove()}>Delete client</Button>
        </>
      )}
    </div>
  );
}
