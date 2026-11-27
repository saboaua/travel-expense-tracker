"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera, Copy, Crown, FileText, Lock, Plus, Upload } from "lucide-react";
import { Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm";
import { setupNeeded } from "@/lib/setup-message";
import { formatDate } from "@/lib/utils";
import { isMissingColumn } from "@/lib/columns";
import { gmailScript } from "@/lib/personal/gmail-script";
import { featureLocked } from "@/lib/limits";
import { onlinePaid, type OnlineSite } from "@/lib/personal/online-orders";
import { orderSiteOfSender } from "@/lib/personal/order-email";
import { PAID_WITH, type PaidWith } from "@/lib/paid-with";
import { useLimits } from "@/lib/use-limits";
import { todayISO } from "@/lib/utils";
import { PAGE_WIDTH } from "@/components/layout/PageShell";

type Sender = { id: string; name: string; email: string; accounts?: string[] };
type LogRow = { id: string; sender: string | null; subject: string | null; status: string; summary: string | null; code: string | null; account?: string | null; created_at: string };

/** Known companies, offered with one tap. If a company mails from another address, it appears under Recent emails and can be added from there. */
const SUGGESTED = [{ name: "Amazon", email: "auto-confirm@amazon.com" }, { name: "AliExpress", email: "transaction@notice.aliexpress.com" }, { name: "eBay", email: "ebay@ebay.com" }, { name: "WEB Aruba", email: "bocuenta@oci.webaruba.com" }, { name: "Elmar", email: "noreply@elmar.aw" }, { name: "Setar", email: "customercare@setar.aw" }];
const PAID_ORDER = ["credit", "debit", "cash"] as const;
const PAID_LABEL: Record<string, string> = { credit: "Credit card", debit: "Debit card", cash: "Cash" };

const STATUS: Record<string, { text: string; cls: string }> = {
  added: { text: "Added", cls: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" },
  skipped_duplicate: { text: "Skipped", cls: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" },
  wrong_account: { text: "Skipped", cls: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200" },
  ignored_sender: { text: "Ignored", cls: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200" },
  unreadable: { text: "Add by hand", cls: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200" },
  needs_pro: { text: "Waiting for Pro", cls: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200" },
  confirmation: { text: "Code", cls: "bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200" },
};

/** One inbox for email: bills from your utility companies and order emails from Amazon, AliExpress and eBay. Your Gmail sends them to the app; each sender says what it becomes. */
export function EmailInbox() {
  const confirm = useConfirm();
  const router = useRouter();
  const [address, setAddress] = useState<string | null>(null);
  const [bySite, setBySite] = useState<Record<string, string>>({});
  const [defPaid, setDefPaid] = useState<PaidWith>("credit");
  const [key, setKey] = useState<string | null>(null);
  const [setup, setSetup] = useState<string | null>(null);
  const [senders, setSenders] = useState<Sender[] | null>(null);
  const [log, setLog] = useState<LogRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [acct, setAcct] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const load = useCallback(async () => {
    const supabase = createClient();
    // the account columns come from migration 66: older databases are read without them
    const senderQ = async () => { const r = await supabase.from("bill_email_senders").select("id, name, email, accounts").order("name").limit(100); return r.error && isMissingColumn(r.error) ? supabase.from("bill_email_senders").select("id, name, email").order("name").limit(100) : r; };
    const logQ = async () => { const r = await supabase.from("bill_email_log").select("id, sender, subject, status, summary, code, account, created_at").order("created_at", { ascending: false }).limit(20); return r.error && isMissingColumn(r.error) ? supabase.from("bill_email_log").select("id, sender, subject, status, summary, code, created_at").order("created_at", { ascending: false }).limit(20) : r; };
    const [a, s, l] = await Promise.all([fetch("/api/email/address").then((r) => r.json()).catch(() => ({ setup: "error" })), senderQ(), logQ()]);
    if (a.setup === "migration" || (s.error && /relation|schema cache|does not exist/i.test(s.error.message))) { setSetup(setupNeeded("Bill emails", "migration_bill_emails.sql")); setSenders([]); setLog([]); return; }
    setKey(a.key ?? null);
    setAddress(a.address ?? null);
    const pr = await supabase.from("online_order_prefs").select("paid_with, paid_by_site").maybeSingle();
    const prefs = pr.error && isMissingColumn(pr.error) ? await supabase.from("online_order_prefs").select("paid_with").maybeSingle() : pr;
    const row = (prefs.data ?? null) as { paid_with?: string; paid_by_site?: Record<string, string> | null } | null;
    setDefPaid(onlinePaid(row?.paid_with));
    setBySite(row?.paid_by_site && typeof row.paid_by_site === "object" ? row.paid_by_site : {});
    setSenders(s.error ? [] : ((s.data ?? []) as Sender[]));
    setLog(l.error ? [] : ((l.data ?? []) as LogRow[]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(null), 2000); } catch { setError("Could not copy. Select it and copy by hand."); }
  };
  const addSender = async (n: string, e: string) => {
    setError(null);
    const em = e.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return setError("Enter the sender's email address.");
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return setError("Sign in again to save.");
    const { error: err } = await supabase.from("bill_email_senders").upsert({ user_id: session.user.id, name: (n.trim() || em.split("@")[0]).slice(0, 80), email: em }, { onConflict: "user_id,email" });
    if (err) return setError("Could not save that sender. Check your connection.");
    setName(""); setEmail(""); await load();
  };
  const saveAccounts = async (sd: Sender, accounts: string[]) => {
    setError(null);
    const { error: err } = await createClient().from("bill_email_senders").update({ accounts }).eq("id", sd.id);
    if (err) return setError(isMissingColumn(err) ? "Run migration_bill_email_accounts.sql in Supabase first, then try again." : "Could not save that account. Check your connection.");
    await load();
  };
  const addAccount = async (sd: Sender, raw: string) => {
    const a = raw.trim().slice(0, 40);
    if (!/^[A-Za-z0-9][A-Za-z0-9 -]{2,}$/.test(a)) return setError("Enter the account number exactly as it is on the bill.");
    const norm = (x: string) => x.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
    if ((sd.accounts ?? []).some((x) => norm(x) === norm(a))) { setAcct((o) => ({ ...o, [sd.id]: "" })); return; }
    await saveAccounts(sd, [...(sd.accounts ?? []), a]);
    setAcct((o) => ({ ...o, [sd.id]: "" }));
  };
  const removeSender = async (s: Sender) => {
    if (!(await confirm({ title: "Remove this sender?", message: `${s.name} (${s.email}). Its emails will be ignored.`, destructive: true }))) return;
    const { error: err } = await createClient().from("bill_email_senders").delete().eq("id", s.id);
    if (err) return setError("Could not remove it. Check your connection.");
    await load();
  };
  const newKey = async () => {
    if (!(await confirm({ title: "Make a new key?", message: "The script you pasted stops working. Copy the new script and paste it over the old one in script.google.com.", destructive: true }))) return;
    const r = await fetch("/api/email/address", { method: "POST" }).then((x) => x.json()).catch(() => null);
    if (!r?.key) return setError("Could not make a new key.");
    setKey(r.key);
  };
  const paidFor = (site: OnlineSite): PaidWith => onlinePaid(bySite[site] ?? defPaid);
  const savePaid = async (site: OnlineSite, v: PaidWith) => {
    setError(null);
    const next = { ...bySite, [site]: v };
    setBySite(next);
    const sb = createClient();
    const { data: u } = await sb.auth.getUser();
    if (!u.user) return setError("Sign in again to save.");
    const { error: err } = await sb.from("online_order_prefs").upsert({ user_id: u.user.id, paid_by_site: next, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (err) setError(isMissingColumn(err) ? "Run migration_online_order_pay_sites.sql in Supabase first, then try again." : "Could not save that. Check your connection.");
  };
  const clearLog = async () => {
    const { data: { session } } = await createClient().auth.getSession();
    if (!session) return;
    await createClient().from("bill_email_log").delete().eq("user_id", session.user.id);
    await load();
  };

  const lim = useLimits();
  const billsLocked = !!lim && featureLocked(lim.limits, lim.who, "bills_email", todayISO());
  const ordersLocked = !!lim && featureLocked(lim.limits, lim.who, "orders_email", todayISO());
  const locked = billsLocked && ordersLocked;
  // Someone who already set it up still sees their senders and what arrived; a new Free person sees only the Pro card
  const setUpBefore = !!key || (senders ?? []).length > 0 || (log ?? []).length > 0;
  const lastMail = (log ?? []).find((r) => r.status !== "confirmation") ?? null;
  const script = key ? gmailScript(key, `${typeof window === "undefined" ? "" : window.location.origin}/api/email/gmail`) : "";
  const have = new Set((senders ?? []).map((s) => s.email));
  const siteOf = (email: string) => orderSiteOfSender(email) as OnlineSite | null;
  const haveSites = new Set((senders ?? []).map((s) => siteOf(s.email)).filter(Boolean));
  const suggestions = SUGGESTED.filter((s) => !have.has(s.email) && !(siteOf(s.email) && haveSites.has(siteOf(s.email))));
  const copyAddress = () => { if (address) void copy(address, "address"); };
  const cap = "text-xs font-semibold uppercase tracking-wider text-muted-foreground";
  const label = "mb-1.5 block text-[13px] font-bold text-foreground/80";
  const tagCls = { orders: "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200", bills: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" };
  const paidPick = (site: OnlineSite, name: string) => (
    <label className="mt-1.5 flex min-h-11 items-center gap-2 text-[13px] text-muted-foreground">Paid with
      <select value={paidFor(site)} onChange={(e) => void savePaid(site, e.target.value as PaidWith)} aria-label={`${name} orders are paid with`} data-testid={`paid-${site}`} className="h-11 rounded-xl border bg-background px-3 text-sm font-bold text-foreground">
        {PAID_ORDER.filter((id) => PAID_WITH.some((o) => o.id === id)).map((id) => <option key={id} value={id}>{PAID_LABEL[id]}</option>)}
      </select>
    </label>
  );
  return (
    <div className={`${PAGE_WIDTH.form} space-y-4 p-4 pb-28 md:p-8`}>
      <button type="button" onClick={() => router.back()} className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back</button>
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Email inbox</h1>
        <p className="mt-0.5 text-[13px] text-muted-foreground">Bills and online orders from your email are added for you.</p>
      </div>
      {setup && <Alert>{setup}</Alert>}
      {error && <Alert>{error}</Alert>}

      {locked && (
        <div className="space-y-3" data-testid="email-locked">
          <Card className="space-y-3 rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"><Lock className="h-5 w-5" aria-hidden="true" /></span>
              <div className="min-w-0 flex-1"><p className="font-semibold">Email inbox is a Pro feature</p><p className="text-sm text-muted-foreground">Your own address reads bills from Elmar, WEB and Setar, and orders from Amazon, AliExpress and eBay, and adds them for you.</p></div>
            </div>
            <Link href="/personal/pro" className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-[15px] font-bold text-primary-foreground" data-testid="email-get-pro"><Crown className="h-5 w-5" aria-hidden="true" />Get Pro</Link>
          </Card>
          <Card className="space-y-2 rounded-2xl p-4">
            <p className="font-bold">On the Free plan you can still</p>
            <Link href="/personal/utilities/add" className="flex min-h-12 items-center gap-3 rounded-xl border px-3 font-bold" data-testid="free-bill"><FileText className="h-4 w-4" aria-hidden="true" />Add a bill by hand</Link>
            <Link href="/personal/shopping/new" className="flex min-h-12 items-center gap-3 rounded-xl border px-3 font-bold" data-testid="free-photo"><Camera className="h-4 w-4" aria-hidden="true" />Take a photo of an order</Link>
            <Link href="/personal/shopping/new" className="flex min-h-12 items-center gap-3 rounded-xl border px-3 font-bold"><Upload className="h-4 w-4" aria-hidden="true" />Upload a screenshot or PDF</Link>
            <Link href="/personal/shopping/new?manual=1" className="flex min-h-12 items-center gap-3 rounded-xl border px-3 font-bold" data-testid="free-manual"><Plus className="h-4 w-4" aria-hidden="true" />Add an order by hand</Link>
            <p className="text-xs leading-relaxed text-muted-foreground">They count in your budget the same way.</p>
          </Card>
          <p className="text-center text-xs leading-relaxed text-muted-foreground">Bills and orders already added stay in your list. Emails that arrive before Pro is on wait, and are added when Pro starts.</p>
        </div>
      )}

      <div className={`space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0${locked && !setUpBefore ? " hidden" : ""}`} data-testid="email-body">
        <div className="space-y-4">
          {(billsLocked || ordersLocked) && !locked && <p className="rounded-xl bg-amber-50 p-3 text-[13px] leading-snug text-amber-900 dark:bg-amber-950 dark:text-amber-200" data-testid="email-half-locked">{ordersLocked ? "Order emails need Pro. Bills still arrive." : "Bill emails need Pro. Orders still arrive."}</p>}
          <Card className="space-y-2 rounded-2xl p-4" data-testid="email-connection">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-bold">Gmail connection</h2>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${lastMail ? STATUS.added.cls : STATUS.ignored_sender.cls}`} data-testid="email-status">{lastMail ? "Connected" : "Not connected yet"}</span>
            </div>
            <p className="text-[13px] leading-snug text-muted-foreground">{lastMail ? `Last email arrived ${formatDate(lastMail.created_at.slice(0, 10))}.` : "Set up takes about 3 minutes, once. After that new bills and orders arrive on their own, within about 5 minutes."}</p>
            {address && (
              <div className="space-y-1.5">
                <p className="text-xs font-bold text-foreground/70">Or forward an email by hand to</p>
                <div className="flex items-center gap-2 rounded-xl border bg-muted/40 p-2.5">
                  <span className="min-w-0 flex-1 select-all break-all text-[13px] font-bold" data-testid="forward-address">{address}</span>
                  <Button type="button" variant="outline" className="min-h-11 gap-1.5" onClick={copyAddress} data-testid="forward-copy"><Copy className="h-4 w-4" aria-hidden="true" />{copied === "address" ? "Copied" : "Copy"}</Button>
                </div>
              </div>
            )}
            {key && lastMail && <button type="button" onClick={newKey} className="inline-flex min-h-11 items-center text-[13px] font-bold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" data-testid="email-new-key">Make a new key (the old script stops working)</button>}
          </Card>

          <Card className="rounded-2xl p-4">
            <h2 className="text-base font-bold">Senders</h2>
            <p className="text-[13px] leading-snug text-muted-foreground">Mail from these senders is added for you. Each one says what it becomes.</p>
            <ul className="mt-1 divide-y" data-testid="email-senders">
              {(senders ?? []).map((s) => {
                const site = siteOf(s.email);
                return (
                <li key={s.id} className="py-2.5" data-testid="email-sender">
                  <div className="flex min-h-14 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200"><Mail className="h-[19px] w-[19px]" aria-hidden="true" /></span>
                    <span className="min-w-0 flex-1"><b className="block text-[15px]">{s.name}</b><span className="block truncate text-xs text-muted-foreground">{s.email}</span></span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${site ? tagCls.orders : tagCls.bills}`} data-testid="email-sender-kind">{site ? "Online orders" : "Bills"}</span>
                    <button type="button" onClick={() => removeSender(s)} className="min-h-11 px-2 text-[13px] font-semibold text-red-700 dark:text-red-300" aria-label={`Remove ${s.name}`}>Remove</button>
                  </div>
                  <div className="ml-[52px]">
                    {site ? paidPick(site, s.name) : (<>
                    <p className="text-xs font-bold text-foreground/70">{(s.accounts ?? []).length ? "Only these accounts are added" : "Every account from this sender is added"}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      {(s.accounts ?? []).map((a) => (
                        <span key={a} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-blue-50 pl-3 pr-1 text-sm font-bold tabular-nums text-blue-800 dark:bg-blue-950 dark:text-blue-200" data-testid="email-account-chip">{a}
                          <button type="button" onClick={() => saveAccounts(s, (s.accounts ?? []).filter((x) => x !== a))} className="flex h-8 w-8 items-center justify-center rounded-full text-base" aria-label={`Remove account ${a}`}>×</button>
                        </span>
                      ))}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Input value={acct[s.id] ?? ""} onChange={(e) => setAcct((o) => ({ ...o, [s.id]: e.target.value }))} placeholder="Account number" maxLength={40} className="h-11 min-w-0 flex-1" aria-label={`Add an account number for ${s.name}`} data-testid={`email-account-input-${s.email}`} />
                      <Button type="button" variant="outline" className="h-11" onClick={() => addAccount(s, acct[s.id] ?? "")} data-testid={`email-account-add-${s.email}`}>Add</Button>
                    </div></>)}
                  </div>
                </li>
                );
              })}
              {suggestions.map((s) => {
                const site = siteOf(s.email);
                return (
                <li key={s.email} className="py-2">
                  <div className="flex min-h-14 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"><Mail className="h-[19px] w-[19px]" aria-hidden="true" /></span>
                    <span className="min-w-0 flex-1"><b className="block text-[15px]">{s.name}</b><span className="block truncate text-xs text-muted-foreground">{s.email}</span></span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${site ? tagCls.orders : tagCls.bills}`}>{site ? "Online orders" : "Bills"}</span>
                    <Button type="button" variant="outline" className="h-10" onClick={() => addSender(s.name, s.email)} data-testid={`email-suggest-${s.email}`} aria-label={`Allow ${s.name}`}>Allow</Button>
                  </div>
                  {site && <div className="ml-[52px]">{paidPick(site, s.name)}</div>}
                </li>
                );
              })}
            </ul>
            <div className="mt-3 space-y-2 border-t pt-3">
              <label htmlFor="es-name" className={label}>Add a sender</label>
              <Input id="es-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Company name" maxLength={80} className="h-12" />
              <Input id="es-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="bills@company.com" maxLength={200} className="h-12" aria-label="Sender email address" />
              <Button type="button" variant="outline" className="h-12 w-full" onClick={() => addSender(name, email)} data-testid="email-add-sender">Add sender</Button>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="rounded-2xl p-4">
            <h2 className={cap}>Set up, once</h2>
            {!key ? (
              <p className="mt-2 text-sm text-muted-foreground" data-testid="email-not-configured">{setup ? "Run the migration first." : "Could not load your key. Reload the page."}</p>
            ) : (
              <ol className="mt-2 space-y-3 text-sm leading-snug">
                <li className="flex gap-2.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">1</span>
                  <span className="min-w-0 flex-1"><b>Copy your script</b><span className="block text-muted-foreground">It already holds your private key, so there is nothing to type or paste into it.</span>
                    <pre className="relative mt-2 max-h-32 overflow-hidden rounded-xl bg-slate-900 p-3 text-[11.5px] leading-relaxed text-slate-200" data-testid="email-script" tabIndex={0}>{script}</pre>
                    <Button type="button" variant="outline" className="mt-2 h-10 gap-1.5" onClick={() => copy(script, "script")} data-testid="email-copy"><Copy className="h-4 w-4" aria-hidden="true" />{copied === "script" ? "Copied" : "Copy script"}</Button>
                  </span>
                </li>
                {[["Open script.google.com", "Sign in with the same Gmail. Tap New project, delete the sample code, paste yours, tap Save."], ["Tap Run and allow access", "Google asks if the script may read your mail. It only looks for mail from the senders you allow here. If Google says it is not verified, tap Advanced, then Go to the project: it is your own script."], ["Set it to repeat", "Tap the clock icon (Triggers), Add trigger, pick sendBills, Time-driven, Every 5 minutes, Save."], ["Come back here", "The status above turns green after the first bill email arrives."]].map(([t, sub], i) => (
                  <li key={t} className="flex gap-2.5"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">{i + 2}</span><span><b>{t}</b><span className="block text-muted-foreground">{sub}</span></span></li>
                ))}
              </ol>
            )}
          </Card>

          <Card className="rounded-2xl p-4">
            <div className="flex items-center justify-between"><h2 className={cap}>Received</h2>{(log ?? []).length > 0 && <button type="button" onClick={clearLog} className="min-h-11 px-1 text-[13px] font-semibold text-primary">Clear</button>}</div>
            {log === null ? <p className="py-3 text-sm text-muted-foreground">&nbsp;</p> : log.length === 0 ? (
              <p className="py-3 text-sm text-muted-foreground" data-testid="email-log-empty">Nothing yet. Bills and orders show here after the script runs.</p>
            ) : (
              <ul className="divide-y" data-testid="email-log">
                {log.map((r) => {
                  const isOrder = (r.summary ?? "").startsWith("Online order");
                  const st = r.status === "added" ? { text: isOrder ? "Added to orders" : "Added to bills", cls: isOrder ? "bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200" : STATUS.added.cls } : (STATUS[r.status] ?? STATUS.skipped_duplicate);
                  const canAllow = r.status === "ignored_sender" && r.sender && !have.has(r.sender);
                  const owner = (senders ?? []).find((x) => x.email === r.sender);
                  const norm = (x: string) => x.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
                  const canAddAccount = !!owner && !!r.account && (r.status === "wrong_account" || r.status === "added" || r.status === "skipped_duplicate") && !(owner.accounts ?? []).some((x) => norm(x) === norm(r.account!));
                  return (
                    <li key={r.id} className="py-2.5" data-testid="email-log-row">
                      <div className="flex items-center gap-3">
                        <span className="min-w-0 flex-1"><b className="block truncate text-[15px]">{r.status === "confirmation" ? "Gmail forwarding code" : r.summary && r.status === "added" ? r.summary : r.subject || r.sender || "Email"}</b><span className="block truncate text-xs text-muted-foreground">{formatDate(r.created_at.slice(0, 10))}{r.status !== "added" && r.sender ? ` · ${r.sender}` : ""}{r.status !== "added" && r.summary && r.status !== "confirmation" ? ` · ${r.summary}` : ""}</span></span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}>{st.text}</span>
                      </div>
                      {r.status === "confirmation" && r.code && (
                        <div className="mt-1.5 flex items-center gap-3"><span className="text-2xl font-bold tracking-[0.12em] tabular-nums" data-testid="email-code">{r.code}</span><Button type="button" variant="outline" className="h-10 gap-1.5" onClick={() => copy(r.code!, r.id)}><Copy className="h-4 w-4" aria-hidden="true" />{copied === r.id ? "Copied" : "Copy code"}</Button></div>
                      )}
                      {canAddAccount && <button type="button" onClick={() => addAccount(owner!, r.account!)} className="mt-1 min-h-11 text-[13px] font-bold text-primary" data-testid="email-add-account">{r.status === "wrong_account" ? "Add this account" : `Only add account ${r.account}`}</button>}
                      {canAllow && <button type="button" onClick={() => addSender(r.sender!.split("@")[0], r.sender!)} className="mt-1 min-h-11 text-[13px] font-bold text-primary" data-testid="email-allow-sender">Add as a sender</button>}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
