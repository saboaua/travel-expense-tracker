"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BackLink } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { createClient } from "@/lib/supabase/client";
import { IPTV_CLIENT_COLS, IPTV_CUSTOMER_COLS } from "@/lib/columns";
import { cn, todayISO } from "@/lib/utils";
import { REMINDER_DAYS, contactUrl, daysLabel, daysLeft, frequencyLabel, renewalMessage, urgencyOf, validateCustomer } from "@/lib/iptv";

type Sub = { id: string; plan: string; model: string | null; mac: string | null; frequency: string; expire_date: string };
const label = "text-xs font-semibold uppercase tracking-wider text-muted-foreground";
const field = "flex flex-col gap-1.5 text-sm font-medium";
const pill: Record<string, string> = {
  expired: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200", now: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  soon: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200", ok: "bg-muted text-muted-foreground",
};

/** One client: their name and contact, all their subscriptions, and how they can see them (one link, one login). */
export function CustomerEditor({ id }: { id: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const confirm = useConfirm();
  const today = useMemo(() => todayISO(), []);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [subs, setSubs] = useState<Sub[]>([]);
  const [clientUser, setClientUser] = useState<string | null>(null);
  const [shareEnabled, setShareEnabled] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [saving, setSaving] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [made, setMade] = useState<{ email: string; tempPassword: string } | null>(null);
  const [owner, setOwner] = useState("");

  const load = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    if (u.user) { const { data: p } = await supabase.from("profiles").select("first_name").eq("id", u.user.id).single(); setOwner((p?.first_name as string) ?? ""); }
    const { data, error: e } = await supabase.from("iptv_customers").select(IPTV_CUSTOMER_COLS).eq("id", id).maybeSingle();
    if (e || !data) return setError("Could not find that client.");
    const r = data as unknown as { name: string; contact: string | null; client_user_id: string | null; share_enabled: boolean };
    setName(r.name); setContact(r.contact ?? ""); setClientUser(r.client_user_id); setShareEnabled(!!r.share_enabled);
    const { data: s } = await supabase.from("iptv_clients").select(IPTV_CLIENT_COLS).eq("customer_id", id).order("expire_date");
    setSubs((s ?? []) as unknown as Sub[]);
    setLoaded(true);
  }, [supabase, id]);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setError(""); setInfo("");
    const v = validateCustomer({ name, contact });
    if (!v.ok) return setError(v.error);
    setSaving(true);
    const { error: e } = await supabase.from("iptv_customers").update(v.value).eq("id", id);
    setSaving(false);
    if (e) return setError("Could not save. Check your connection and try again.");
    setInfo("Saved."); await load();
  };
  const renew = async (s: Sub) => {
    const { error: e } = await supabase.rpc("iptv_renew", { p_client: s.id, p_on: today });
    if (e) return setError("Could not renew. Try again.");
    setInfo("Renewed."); await load();
  };
  const remove = async () => {
    if (!(await confirm({ title: `Delete ${name}?`, message: `This removes the client, ${subs.length === 1 ? "their subscription" : `all ${subs.length} subscriptions`} and the renewal history. Their link stops working.`, confirmLabel: "Delete", destructive: true }))) return;
    await supabase.from("iptv_customers").delete().eq("id", id);
    router.replace("/admin/iptv");
  };

  const ending = subs.filter((s) => urgencyOf(daysLeft(s.expire_date, today)) !== "ok");
  const msgFor = (list: Sub[]) => contactUrl(contact, renewalMessage(name || "there", list, today, owner, subs.length));
  const subName = (s: Sub) => [s.plan, s.model].filter(Boolean).join(" · ");
  const soonest = subs[0];

  const link = token ? `${window.location.origin}/s/${token}` : "";
  const makeLink = async () => {
    const { data, error: e } = await supabase.rpc("iptv_create_link", { p_customer: id });
    if (e || typeof data !== "string") return setError("Could not make the link.");
    setToken(data); setShareEnabled(true);
  };
  const stopLink = async () => {
    if (!(await confirm({ title: "Stop this link?", message: "The old address will never work again.", confirmLabel: "Stop link", destructive: true }))) return;
    await supabase.rpc("iptv_stop_link", { p_customer: id });
    setToken(null); setShareEnabled(false);
  };
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); setInfo("Copied."); } catch { setInfo("Copy did not work. Select the text and copy it."); } };
  const linkExisting = async () => {
    const { data, error: e } = await supabase.rpc("iptv_link_user", { p_customer: id, p_email: loginEmail });
    if (e) return setError("Could not link.");
    if (data !== true) return setError("No account has that email. Make a login instead.");
    setLoginEmail(""); setInfo("Linked. This client now sees it under Personal."); await load();
  };
  const makeLogin = async () => {
    setError("");
    const res = await fetch("/api/admin/iptv-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customerId: id, email: loginEmail }) });
    const d = (await res.json().catch(() => ({}))) as { error?: string; email?: string; tempPassword?: string };
    if (!res.ok || !d.tempPassword) return setError(d.error ?? "Could not make the login.");
    setMade({ email: d.email ?? loginEmail, tempPassword: d.tempPassword }); setLoginEmail(""); await load();
  };
  const unlinkUser = async () => { await supabase.rpc("iptv_unlink_user", { p_customer: id }); await load(); };

  if (!loaded) return <div className="p-8 text-sm text-muted-foreground">{error || "Loading…"}</div>;
  const sendLink = link ? contactUrl(contact, `Your TV subscriptions: ${link}`) : null;
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 pb-28 md:p-8">
      <BackLink href="/admin/iptv">IPTV clients</BackLink>
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{name}</h1>
        <p className="text-sm text-muted-foreground">{subs.length} subscription{subs.length === 1 ? "" : "s"}</p>
      </div>

      {soonest && (
        <section className="space-y-1.5 rounded-2xl bg-primary p-4 text-primary-foreground">
          <p className="text-sm opacity-85">{ending.length ? "Needs attention first" : "Next to end"}</p>
          <p className="text-2xl font-bold tracking-tight">{subName(soonest)} · {daysLabel(daysLeft(soonest.expire_date, today))}</p>
          {subs.length > 1 && <p className="text-sm opacity-85">{subs.length - 1 === 1 ? "The other ends" : "The others end"} {subs.slice(1).map((s) => `in ${Math.max(0, daysLeft(s.expire_date, today))}`).join(" and ")} days.</p>}
        </section>
      )}
      {ending.length > 0 && (
        <div className="grid grid-cols-1 gap-2">
          {msgFor(ending) ? <a href={msgFor(ending)!} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-emerald-700 font-semibold text-white">Message about {ending.length === 1 ? "the ending subscription" : `the ${ending.length} ending subscriptions`}</a> : <span className="inline-flex min-h-12 items-center justify-center rounded-xl border text-sm text-muted-foreground">Add a contact to message</span>}
        </div>
      )}

      <h2 className={label}>Client</h2>
      <Card className="space-y-3.5 p-4">
        <label className={field}>Client name<Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></label>
        <label className={field}>Contact (WhatsApp number or email)<Input value={contact} onChange={(e) => setContact(e.target.value)} maxLength={120} placeholder="+297 555 0142" /></label>
        <Button onClick={save} disabled={saving} className="h-12 text-base">{saving ? "Saving…" : "Save client"}</Button>
      </Card>

      <h2 className={label}>Subscriptions</h2>
      <Card className="divide-y px-4">
        {subs.map((s) => {
          const d = daysLeft(s.expire_date, today);
          const u = urgencyOf(d);
          const url = contactUrl(contact, renewalMessage(name || "there", [s], today, owner, subs.length));
          return (
            <div key={s.id} className="space-y-2.5 py-3.5">
              <Link href={`/admin/iptv/${id}/sub/${s.id}`} className="block min-h-11 space-y-1">
                <span className="flex items-center gap-3"><span className="flex-1 font-semibold">{subName(s)}</span><span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-bold", pill[u])}>{daysLabel(d)}</span></span>
                <span className="block text-sm text-muted-foreground">{frequencyLabel(s.frequency)}{s.mac ? ` · MAC ${s.mac}` : ""} · {d < 0 ? "ended" : "ends"} {s.expire_date}</span>
              </Link>
              {u !== "ok" && (
                <div className="flex gap-2">
                  {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-emerald-700 text-sm font-semibold text-white">Message</a> : <span className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border text-sm text-muted-foreground">Add contact</span>}
                  <button type="button" onClick={() => void renew(s)} className="min-h-11 flex-1 rounded-lg border text-sm font-semibold hover:bg-accent">Mark renewed</button>
                </div>
              )}
            </div>
          );
        })}
        {subs.length === 0 && <p className="py-3 text-sm text-muted-foreground">No subscriptions yet.</p>}
      </Card>
      <Link href={`/admin/iptv/new?client=${id}`} className="flex min-h-12 items-center justify-center rounded-xl border border-dashed border-primary bg-primary/5 font-semibold text-primary">+ Add another subscription for {name.split(" ")[0]}</Link>
      <p className="text-sm text-muted-foreground">Each subscription keeps its own plan, MAC, ID, order, donation reference, dates and renewal history. You get an alert {REMINDER_DAYS} days before each one ends.</p>

      {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
      {info && <p role="status" className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{info}</p>}

      <h2 className={label}>Let {name.split(" ")[0]} see their subscriptions</h2>
      <Card className="space-y-4 p-4 text-sm">
        <div className="space-y-2">
          <p className="font-semibold">1. A link</p>
          <p className="text-muted-foreground">Anyone with the link can open it. No sign-in. One link shows all {subs.length} subscription{subs.length === 1 ? "" : "s"}, and any you add later. Shows first name, plan, dates and renewal history only.</p>
          {token ? (
            <>
              <Input readOnly value={link} aria-label="Client link" onFocus={(e) => e.currentTarget.select()} />
              <div className="grid grid-cols-3 gap-2">
                <Button variant="outline" onClick={() => void copy(link)}>Copy</Button>
                {sendLink ? <a href={sendLink} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center justify-center rounded-lg border text-sm font-medium hover:bg-accent">Send</a> : <span />}
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
      <Button variant="destructive" className="w-full" onClick={() => void remove()}>Delete client</Button>
    </div>
  );
}
