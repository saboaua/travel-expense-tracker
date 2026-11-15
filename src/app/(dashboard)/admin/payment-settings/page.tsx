"use client";

import { useCallback, useEffect, useState } from "react";
import { Bitcoin, Check, Plus, Trash2 } from "lucide-react";
import { BackLink, PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { BankAccount } from "@/lib/payments";

type Addr = { address: string; used: boolean };
const short = (a: string) => `${a.slice(0, 10)}…${a.slice(-6)}`;
const blank = (): BankAccount => ({ bank: "", name: "", number: "", currency: "AWG" });

export default function PaymentSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [monthly, setMonthly] = useState("");
  const [yearly, setYearly] = useState("");
  const [instructions, setInstructions] = useState("");
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [btcOn, setBtcOn] = useState(false);
  const [btcMinutes, setBtcMinutes] = useState("30");
  const [btcConfs, setBtcConfs] = useState("2");
  const [btcSetup, setBtcSetup] = useState(true);
  const [addresses, setAddresses] = useState<Addr[]>([]);
  const [pasted, setPasted] = useState("");
  const [adding, setAdding] = useState(false);

  const reload = useCallback(async () => {
      const res = await fetch("/api/admin/payment-settings");
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) setError(json.error || "Could not load.");
      else {
        const s = json.settings;
        setBtcOn(s.btc_enabled === true); setBtcMinutes(String(s.btc_quote_minutes ?? 30)); setBtcConfs(String(s.btc_confirmations ?? 2));
        setBtcSetup(json.bitcoinSetup !== false); setAddresses(Array.isArray(json.addresses) ? json.addresses : []);
        setMonthly(String(s.monthly_price ?? "")); setYearly(String(s.yearly_price ?? "")); setInstructions(s.instructions ?? ""); setAccounts(Array.isArray(s.accounts) ? s.accounts : []);
      }
      setLoading(false);
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const addAddresses = async () => {
    setAdding(true); setError(null); setNotice(null);
    const res = await fetch("/api/admin/payment-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add_addresses", text: pasted }) });
    const json = await res.json().catch(() => ({}));
    setAdding(false);
    if (!res.ok) return setError(json.error || "Could not add.");
    setPasted(""); setNotice(`${json.added} address${json.added === 1 ? "" : "es"} added${json.skipped ? `, ${json.skipped} already in the list` : ""}.`);
    reload();
  };
  const removeAddress = async (address: string) => {
    setError(null); setNotice(null);
    const res = await fetch("/api/admin/payment-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "remove_address", address }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return setError(json.error || "Could not remove.");
    reload();
  };
  const free = addresses.filter((a) => !a.used).length;

  const set = (i: number, patch: Partial<BankAccount>) => setAccounts((a) => a.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const save = async () => {
    setSaving(true); setError(null); setNotice(null);
    const res = await fetch("/api/admin/payment-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ monthly_price: monthly, yearly_price: yearly, instructions, accounts, currency: "AWG", btc_enabled: btcOn, btc_quote_minutes: btcMinutes, btc_confirmations: btcConfs }) });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return setError(json.error || "Could not save.");
    setAccounts(json.settings.accounts); setNotice("Saved. People see this when they pick Pro.");
  };

  return (
    <div className="mx-auto max-w-xl space-y-5 p-4 md:p-8">
      <BackLink href="/admin/plans">Plans and access</BackLink>
      <PageHeader title="Payment settings" description="What people see when they pick Pro" />
      {error && <Alert>{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}
      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <>
          <Card><CardContent className="space-y-3 py-4">
            <p className="font-semibold">Prices (AWG)</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><label htmlFor="pay-monthly" className="text-sm font-medium">Monthly</label><Input id="pay-monthly" inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} /></div>
              <div className="space-y-1.5"><label htmlFor="pay-yearly" className="text-sm font-medium">Yearly</label><Input id="pay-yearly" inputMode="decimal" value={yearly} onChange={(e) => setYearly(e.target.value)} /></div>
            </div>
          </CardContent></Card>
          <Card><CardContent className="space-y-4 py-4">
            <p className="font-semibold">Bank accounts</p>
            {accounts.length === 0 && <p className="text-sm text-muted-foreground">No bank account yet. People cannot pay until you add one.</p>}
            {accounts.map((a, i) => (
              <div key={i} className="space-y-2 rounded-xl border p-3" data-testid="pay-account">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1"><label htmlFor={`pay-bank-${i}`} className="text-xs font-medium">Bank</label><Input id={`pay-bank-${i}`} value={a.bank} onChange={(e) => set(i, { bank: e.target.value })} placeholder="Aruba Bank" /></div>
                  <div className="space-y-1"><label htmlFor={`pay-name-${i}`} className="text-xs font-medium">Account name</label><Input id={`pay-name-${i}`} value={a.name} onChange={(e) => set(i, { name: e.target.value })} /></div>
                  <div className="space-y-1"><label htmlFor={`pay-num-${i}`} className="text-xs font-medium">Account number</label><Input id={`pay-num-${i}`} value={a.number} onChange={(e) => set(i, { number: e.target.value })} /></div>
                  <div className="space-y-1"><label htmlFor={`pay-cur-${i}`} className="text-xs font-medium">Currency</label><Input id={`pay-cur-${i}`} value={a.currency} maxLength={3} onChange={(e) => set(i, { currency: e.target.value })} /></div>
                </div>
                <Button type="button" variant="outline" size="sm" className="text-red-700" onClick={() => setAccounts((x) => x.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" aria-hidden="true" />Remove</Button>
              </div>
            ))}
            {accounts.length < 6 && <Button type="button" variant="outline" onClick={() => setAccounts((a) => [...a, blank()])} data-testid="pay-add-account"><Plus className="h-4 w-4" aria-hidden="true" />Add bank account</Button>}
          </CardContent></Card>
          <Card><CardContent className="space-y-1.5 py-4">
            <label htmlFor="pay-instructions" className="text-sm font-semibold">Extra instructions</label>
            <Input id="pay-instructions" value={instructions} maxLength={600} onChange={(e) => setInstructions(e.target.value)} placeholder="Use your reference in the description." />
          </CardContent></Card>
          <Card><CardContent className="space-y-4 py-4" data-testid="btc-settings">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"><Bitcoin className="h-5 w-5" aria-hidden="true" /></span>
              <div className="flex-1"><p className="font-semibold">Bitcoin</p><p className="text-sm text-muted-foreground">Show Bitcoin to people who pick Pro</p></div>
              <button type="button" role="switch" aria-checked={btcOn} aria-label="Show Bitcoin to people" disabled={!btcSetup} onClick={() => setBtcOn((v) => !v)} data-testid="btc-toggle" className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50", btcOn ? "bg-primary" : "bg-muted-foreground/30")}><span className={cn("absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all", btcOn ? "left-[22px]" : "left-0.5")} /></button>
            </div>
            {!btcSetup && <Alert variant="warning">Bitcoin is not set up yet. Run supabase/migration_pro_bitcoin.sql in the Supabase SQL Editor.</Alert>}
            {btcSetup && (
              <>
                <Alert variant="warning">Paste receiving addresses only. Never paste a seed phrase or a private key anywhere in this app.</Alert>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between"><p className="text-sm font-semibold">Addresses</p><p className="text-xs font-semibold text-muted-foreground" data-testid="btc-count">{free} free of {addresses.length}</p></div>
                  <p className="text-xs text-muted-foreground">Each address is used for one request, so you can tell who paid. Bitcoin shows only while at least one is free.</p>
                  {addresses.length > 0 && (
                    <ul className="max-h-56 divide-y overflow-y-auto rounded-xl border">
                      {addresses.map((a) => (
                        <li key={a.address} className="flex items-center gap-2 px-3 py-2 text-sm" data-testid="btc-address-row">
                          <span className="min-w-0 flex-1 truncate font-mono text-xs">{short(a.address)}</span>
                          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-extrabold", a.used ? "bg-muted text-muted-foreground" : "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200")}>{a.used ? "Used" : "Free"}</span>
                          {!a.used && <button type="button" className="text-xs font-semibold text-red-700" onClick={() => removeAddress(a.address)} aria-label={`Remove ${short(a.address)}`}>Remove</button>}
                        </li>
                      ))}
                    </ul>
                  )}
                  <label htmlFor="btc-paste" className="sr-only">Addresses to add</label>
                  <textarea id="btc-paste" value={pasted} onChange={(e) => setPasted(e.target.value)} rows={3} spellCheck={false} placeholder="One address per line" data-testid="btc-paste" className="w-full rounded-lg border border-input bg-background p-3 font-mono text-xs" />
                  <Button type="button" variant="outline" onClick={addAddresses} disabled={adding || !pasted.trim()} data-testid="btc-add"><Plus className="h-4 w-4" aria-hidden="true" />Add addresses</Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><label htmlFor="btc-minutes" className="text-sm font-medium">Price valid (minutes)</label><Input id="btc-minutes" inputMode="numeric" value={btcMinutes} onChange={(e) => setBtcMinutes(e.target.value)} /></div>
                  <div className="space-y-1.5"><label htmlFor="btc-confs" className="text-sm font-medium">Confirmations</label><Input id="btc-confs" inputMode="numeric" value={btcConfs} onChange={(e) => setBtcConfs(e.target.value)} /></div>
                </div>
              </>
            )}
          </CardContent></Card>
          <Button className="min-h-[52px] w-full" onClick={save} disabled={saving} data-testid="pay-save"><Check className="h-5 w-5" aria-hidden="true" />Save</Button>
        </>
      )}
    </div>
  );
}
