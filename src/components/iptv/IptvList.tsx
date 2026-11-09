"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BackLink } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { IPTV_CLIENT_COLS, IPTV_CUSTOMER_COLS } from "@/lib/columns";
import { cn, todayISO } from "@/lib/utils";
import { REMINDER_DAYS, contactUrl, daysLabel, daysLeft, frequencyLabel, groupClients, renewalMessage, summary, urgencyOf } from "@/lib/iptv";

type Sub = { id: string; customer_id: string; plan: string; model: string | null; order_no: string | null; mac: string | null; device_id: string | null; location: string | null; frequency: string; expire_date: string };
type Customer = { id: string; name: string; contact: string | null };
/** One row per client: the soonest subscription decides where it sits in the list */
type Row = { id: string; client_name: string; contact: string | null; subs: Sub[]; expire_date: string; location: string | null; frequency: string };
const label = "text-xs font-semibold uppercase tracking-wider text-muted-foreground";
const pill: Record<string, string> = {
  expired: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200", now: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  soon: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200", ok: "bg-muted text-muted-foreground",
};
const SORTS = ["Soonest first", "Monthly", "Yearly", "Location"] as const;

export function IptvList() {
  const supabase = useMemo(() => createClient(), []);
  const today = useMemo(() => todayISO(), []);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<(typeof SORTS)[number]>("Soonest first");
  const [killed, setKilled] = useState(false);
  const [contact, setContact] = useState("");
  const [owner, setOwner] = useState("");

  const load = useCallback(async () => {
    const [cs, ss] = await Promise.all([
      supabase.from("iptv_customers").select(IPTV_CUSTOMER_COLS).order("name"),
      supabase.from("iptv_clients").select(IPTV_CLIENT_COLS).order("expire_date"),
    ]);
    const e = cs.error ?? ss.error;
    if (e) return setError(/does not exist|schema cache|column/i.test(e.message) ? "IPTV is not set up yet. Run the latest database updates (migrations 36 and 37)." : "Could not load clients. Try again.");
    setError("");
    const subs = (ss.data ?? []) as unknown as Sub[];
    setRows(((cs.data ?? []) as unknown as Customer[]).flatMap((c) => {
      const mine = subs.filter((x) => x.customer_id === c.id);
      return mine.length ? [{ id: c.id, client_name: c.name, contact: c.contact, subs: mine, expire_date: mine[0].expire_date, location: mine.find((x) => x.location)?.location ?? null, frequency: mine[0].frequency }] : [];
    }));
    const { data: s } = await supabase.from("app_settings").select("client_links_disabled, iptv_contact").eq("id", 1).single();
    if (s) { setKilled(!!s.client_links_disabled); setContact((s.iptv_contact as string) ?? ""); }
    const { data: u } = await supabase.auth.getUser();
    if (u.user) { const { data: p } = await supabase.from("profiles").select("first_name").eq("id", u.user.id).single(); setOwner((p?.first_name as string) ?? ""); }
  }, [supabase]);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    let list = (rows ?? []).filter((r) => !t || [r.client_name, r.location, ...r.subs.flatMap((x) => [x.mac, x.order_no, x.device_id, x.plan, x.model])].some((v) => v?.toLowerCase().includes(t)));
    if (sort === "Monthly") list = list.filter((r) => r.subs.some((x) => x.frequency === "monthly"));
    if (sort === "Yearly") list = list.filter((r) => r.subs.some((x) => x.frequency !== "monthly"));
    if (sort === "Location") list = [...list].sort((a, b) => (a.location ?? "~").localeCompare(b.location ?? "~") || a.expire_date.localeCompare(b.expire_date));
    return list;
  }, [rows, q, sort]);
  const sum = useMemo(() => summary(rows ?? [], today), [rows, today]);
  const subCount = (rows ?? []).reduce((n, r) => n + r.subs.length, 0);
  const groups = useMemo(() => groupClients(filtered, today), [filtered, today]);

  const renew = async (r: Row) => {
    const { error: e } = await supabase.rpc("iptv_renew", { p_client: r.subs[0].id, p_on: today });
    if (e) setError("Could not renew. Try again.");
    await load();
  };
  const saveSettings = async (patch: { client_links_disabled?: boolean; iptv_contact?: string | null }) => {
    const { error: e } = await supabase.from("app_settings").update(patch).eq("id", 1);
    if (e) setError("Could not save that setting.");
  };

  const item = (r: Row) => {
    const d = daysLeft(r.expire_date, today);
    const u = urgencyOf(d);
    const ending = r.subs.filter((x) => urgencyOf(daysLeft(x.expire_date, today)) !== "ok");
    const many = r.subs.length > 1;
    const url = contactUrl(r.contact, renewalMessage(r.client_name, ending.length ? ending : r.subs, today, owner, r.subs.length));
    return (
      <div key={r.id} className="space-y-2.5 py-3.5">
        <Link href={`/admin/iptv/${r.id}`} className="block min-h-11 space-y-1.5">
          <span className="flex items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{r.client_name}</span>
              <span className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                {many && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200">{r.subs.length} subscriptions</span>}
                <span className="truncate">{many ? r.location : [r.subs[0].plan, r.subs[0].model, frequencyLabel(r.subs[0].frequency), r.location].filter(Boolean).join(" · ")}</span>
              </span>
            </span>
            <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-bold", pill[u])}>{daysLabel(d)}</span>
          </span>
          {many && (
            <span className="block space-y-1 rounded-lg bg-muted/50 p-2.5 text-sm">
              {r.subs.map((x) => {
                const dd = daysLeft(x.expire_date, today);
                return <span key={x.id} className="flex justify-between gap-3"><span className="truncate">{[x.plan, x.model].filter(Boolean).join(" · ")}</span><span className={cn("shrink-0", urgencyOf(dd) === "expired" || urgencyOf(dd) === "now" ? "font-semibold text-red-700 dark:text-red-300" : "text-muted-foreground")}>{daysLabel(dd)}</span></span>;
              })}
            </span>
          )}
        </Link>
        {u !== "ok" && (
          <div className="flex gap-2">
            {url
              ? <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-emerald-700 text-sm font-semibold text-white">Message</a>
              : <Link href={`/admin/iptv/${r.id}`} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border text-sm text-muted-foreground">Add contact</Link>}
            {many
              ? <Link href={`/admin/iptv/${r.id}`} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border text-sm font-semibold hover:bg-accent">Open to renew</Link>
              : <button type="button" onClick={() => void renew(r)} className="min-h-11 flex-1 rounded-lg border text-sm font-semibold hover:bg-accent">Mark renewed</button>}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 pb-28 md:p-8">
      <BackLink href="/admin/settings">Admin</BackLink>
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">IPTV clients</h1>
      <p className="text-sm text-muted-foreground">Only admins see this page. You add and renew clients here; clients never see each other.</p>
      {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">{error}</p>}

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/40"><p className="text-2xl font-bold">{sum.contactNow}</p><p className="text-xs text-muted-foreground">Expired or this week</p></div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40"><p className="text-2xl font-bold">{sum.soon}</p><p className="text-xs text-muted-foreground">Within {REMINDER_DAYS} days</p></div>
        <div className="rounded-xl border bg-card p-3"><p className="text-2xl font-bold">{subCount === (rows ?? []).length ? sum.active : subCount}</p><p className="text-xs text-muted-foreground">{subCount === (rows ?? []).length ? "Active clients" : `Subscriptions · ${(rows ?? []).length} clients`}</p></div>
      </div>

      <Input type="search" aria-label="Search clients" placeholder="Search name, MAC, order or ID" value={q} onChange={(e) => setQ(e.target.value)} className="h-12" />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Sort and filter">
        {SORTS.map((s) => <button key={s} type="button" aria-pressed={sort === s} onClick={() => setSort(s)} className={cn("min-h-11 rounded-full border px-4 text-sm", sort === s ? "border-primary bg-primary font-semibold text-primary-foreground" : "bg-card")}>{s}</button>)}
      </div>

      {rows && rows.length === 0 && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No clients yet. Add the first one below.</p>}
      {groups.contactNow.length > 0 && (<><h2 className={cn(label, "text-red-700 dark:text-red-300")}>Contact now</h2><Card className="divide-y border-red-200 px-4 dark:border-red-900">{groups.contactNow.map(item)}</Card></>)}
      {groups.soon.length > 0 && (<><h2 className={label}>Coming up · notice {REMINDER_DAYS} days before</h2><Card className="divide-y px-4">{groups.soon.map(item)}</Card></>)}
      {groups.later.length > 0 && (<><h2 className={label}>Later</h2><Card className="divide-y px-4">{groups.later.map(item)}</Card></>)}

      <Link href="/admin/iptv/new" className="flex min-h-12 items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground">+ Add a client</Link>

      <h2 className={label}>Client access</h2>
      <Card className="divide-y px-4">
        <div className="flex items-center gap-3 py-2">
          <span className="flex-1"><span className="block font-semibold">Client links and client logins</span><span className="block text-sm text-muted-foreground">Turn off to stop every client view at once.</span></span>
          <Switch checked={!killed} label="Client links and client logins" onChange={(on) => { setKilled(!on); void saveSettings({ client_links_disabled: !on }); }} />
        </div>
        <label className="flex flex-col gap-1.5 py-3 text-sm font-medium">Your WhatsApp or email, shown to clients so they can reach you
          <Input value={contact} maxLength={40} onChange={(e) => setContact(e.target.value)} onBlur={() => void saveSettings({ iptv_contact: contact.trim() || null })} placeholder="+297 555 0100" />
        </label>
      </Card>
    </div>
  );
}
