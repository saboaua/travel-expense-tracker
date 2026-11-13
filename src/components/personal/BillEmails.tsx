"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm";
import { setupNeeded } from "@/lib/setup-message";
import { formatDate } from "@/lib/utils";

type Sender = { id: string; name: string; email: string };
type LogRow = { id: string; sender: string | null; subject: string | null; status: string; summary: string | null; code: string | null; created_at: string };

/** Known companies, offered with one tap. Setar's address appears under Recent emails after its first forwarded mail. */
const SUGGESTED = [{ name: "WEB Aruba", email: "bocuenta@oci.webaruba.com" }, { name: "Elmar", email: "noreply@elmar.aw" }];

const STATUS: Record<string, { text: string; cls: string }> = {
  added: { text: "Added", cls: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" },
  skipped_duplicate: { text: "Skipped", cls: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" },
  ignored_sender: { text: "Ignored", cls: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200" },
  unreadable: { text: "Add by hand", cls: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200" },
  confirmation: { text: "Code", cls: "bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200" },
};

/** Forward a bill email and it is added to the Due list: your private address, the senders you allow and what arrived. */
export function BillEmails() {
  const confirm = useConfirm();
  const [address, setAddress] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);
  const [setup, setSetup] = useState<string | null>(null);
  const [senders, setSenders] = useState<Sender[] | null>(null);
  const [log, setLog] = useState<LogRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const load = useCallback(async () => {
    const supabase = createClient();
    const [a, s, l] = await Promise.all([
      fetch("/api/email/address").then((r) => r.json()).catch(() => ({ setup: "error" })),
      supabase.from("bill_email_senders").select("id, name, email").order("name").limit(100),
      supabase.from("bill_email_log").select("id, sender, subject, status, summary, code, created_at").order("created_at", { ascending: false }).limit(20),
    ]);
    if (a.setup === "migration" || (s.error && /relation|schema cache|does not exist/i.test(s.error.message))) { setSetup(setupNeeded("Bill emails", "migration_bill_emails.sql")); setSenders([]); setLog([]); return; }
    setAddress(a.address ?? null); setConfigured(a.configured !== false);
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
  const removeSender = async (s: Sender) => {
    if (!(await confirm({ title: "Remove this sender?", message: `${s.name} (${s.email}). Its emails will be ignored.`, destructive: true }))) return;
    const { error: err } = await createClient().from("bill_email_senders").delete().eq("id", s.id);
    if (err) return setError("Could not remove it. Check your connection.");
    await load();
  };
  const newAddress = async () => {
    if (!(await confirm({ title: "Make a new address?", message: "The old address stops working. Update your Gmail filter with the new one.", destructive: true }))) return;
    const r = await fetch("/api/email/address", { method: "POST" }).then((x) => x.json()).catch(() => null);
    if (!r?.address) return setError("Could not make a new address.");
    setAddress(r.address);
  };
  const clearLog = async () => {
    const { data: { session } } = await createClient().auth.getSession();
    if (!session) return;
    await createClient().from("bill_email_log").delete().eq("user_id", session.user.id);
    await load();
  };

  const have = new Set((senders ?? []).map((s) => s.email));
  const suggestions = SUGGESTED.filter((s) => !have.has(s.email));
  const cap = "text-xs font-semibold uppercase tracking-wider text-muted-foreground";
  const label = "mb-1.5 block text-[13px] font-bold text-foreground/80";
  return (
    <div className="mx-auto max-w-lg space-y-4 p-4 pb-28 md:p-8 lg:max-w-4xl">
      <Link href="/personal/utilities" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Utilities</Link>
      <div>
        <h1 className="text-[26px] font-bold leading-tight">Bill emails</h1>
        <p className="mt-0.5 text-[13px] text-muted-foreground">Forward a bill email and it lands in your Due list.</p>
      </div>
      {setup && <Alert>{setup}</Alert>}
      {error && <Alert>{error}</Alert>}

      <div className="space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0">
        <div className="space-y-4">
          <Card className="space-y-2 rounded-2xl p-4">
            <h2 className={cap}>Your forwarding address</h2>
            {!configured || !address ? (
              <p className="text-sm text-muted-foreground" data-testid="email-not-configured">{setup ? "Run the migration first." : "Bill emails are not switched on yet. The server needs INBOUND_EMAIL_BASE and INBOUND_EMAIL_SECRET (see the setup notes)."}</p>
            ) : (
              <>
                <div className="flex items-center gap-2 rounded-xl border bg-background pl-3">
                  <code className="min-w-0 flex-1 truncate py-3 text-[13px]" data-testid="email-address">{address}</code>
                  <Button type="button" variant="outline" className="m-1 h-10 gap-1.5 px-3" onClick={() => copy(address, "address")} data-testid="email-copy"><Copy className="h-4 w-4" aria-hidden="true" />{copied === "address" ? "Copied" : "Copy"}</Button>
                </div>
                <p className="text-xs leading-snug text-muted-foreground">Keep it private: anyone who has it can add bills. Mail from senders not on your list is ignored.</p>
                <button type="button" onClick={newAddress} className="inline-flex min-h-11 items-center text-[13px] font-bold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Make a new address</button>
              </>
            )}
          </Card>

          <Card className="rounded-2xl p-4">
            <h2 className={cap}>Allowed senders</h2>
            <ul className="mt-1 divide-y" data-testid="email-senders">
              {(senders ?? []).map((s) => (
                <li key={s.id} className="flex min-h-14 items-center gap-3 py-2">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200"><Mail className="h-[19px] w-[19px]" aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1"><b className="block text-[15px]">{s.name}</b><span className="block truncate text-xs text-muted-foreground">{s.email}</span></span>
                  <button type="button" onClick={() => removeSender(s)} className="min-h-11 px-2 text-[13px] font-semibold text-red-700 dark:text-red-300" aria-label={`Remove ${s.name}`}>Remove</button>
                </li>
              ))}
              {suggestions.map((s) => (
                <li key={s.email} className="flex min-h-14 items-center gap-3 py-2">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"><Mail className="h-[19px] w-[19px]" aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1"><b className="block text-[15px]">{s.name}</b><span className="block truncate text-xs text-muted-foreground">{s.email}</span></span>
                  <Button type="button" variant="outline" className="h-10" onClick={() => addSender(s.name, s.email)} data-testid={`email-suggest-${s.email}`} aria-label={`Allow ${s.name}`}>Allow</Button>
                </li>
              ))}
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
            <h2 className={cap}>Set up Gmail, once</h2>
            <ol className="mt-2 space-y-2.5 text-sm leading-snug">
              {[["Copy the address above.", ""], ["Gmail: Settings, Forwarding and POP/IMAP, Add a forwarding address.", "Paste it. Gmail sends a confirmation code; it appears under Recent emails below."], ["Make a filter: From the company's address, Forward to the new address.", "If you already label these bills, use the same filter."]].map(([t, sub], i) => (
                <li key={i} className="flex gap-2.5"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">{i + 1}</span><span><b>{t}</b>{sub ? <span className="block text-muted-foreground">{sub}</span> : null}</span></li>
              ))}
            </ol>
          </Card>

          <Card className="rounded-2xl p-4">
            <div className="flex items-center justify-between"><h2 className={cap}>Recent emails</h2>{(log ?? []).length > 0 && <button type="button" onClick={clearLog} className="min-h-11 px-1 text-[13px] font-semibold text-primary">Clear</button>}</div>
            {log === null ? <p className="py-3 text-sm text-muted-foreground">&nbsp;</p> : log.length === 0 ? (
              <p className="py-3 text-sm text-muted-foreground" data-testid="email-log-empty">Nothing yet. Forward a bill email to see it here.</p>
            ) : (
              <ul className="divide-y" data-testid="email-log">
                {log.map((r) => {
                  const st = STATUS[r.status] ?? STATUS.skipped_duplicate;
                  const canAllow = r.status === "ignored_sender" && r.sender && !have.has(r.sender);
                  return (
                    <li key={r.id} className="py-2.5" data-testid="email-log-row">
                      <div className="flex items-center gap-3">
                        <span className="min-w-0 flex-1"><b className="block truncate text-[15px]">{r.status === "confirmation" ? "Gmail forwarding code" : r.summary && r.status === "added" ? r.summary : r.subject || r.sender || "Email"}</b><span className="block truncate text-xs text-muted-foreground">{formatDate(r.created_at.slice(0, 10))}{r.status !== "added" && r.sender ? ` · ${r.sender}` : ""}{r.status !== "added" && r.summary && r.status !== "confirmation" ? ` · ${r.summary}` : ""}</span></span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}>{st.text}</span>
                      </div>
                      {r.status === "confirmation" && r.code && (
                        <div className="mt-1.5 flex items-center gap-3"><span className="text-2xl font-bold tracking-[0.12em] tabular-nums" data-testid="email-code">{r.code}</span><Button type="button" variant="outline" className="h-10 gap-1.5" onClick={() => copy(r.code!, r.id)}><Copy className="h-4 w-4" aria-hidden="true" />{copied === r.id ? "Copied" : "Copy code"}</Button></div>
                      )}
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
