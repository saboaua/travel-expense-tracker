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
  const [mode, setMode] = useState<"xpub" | "list">("xpub");
  const [xpub, setXpub] = useState("");
  const [xpubType, setXpubType] = useState<"legacy" | "segwit" | "native">("native");
  const [savedXpub, setSavedXpub] = useState("");
  const [nextIndex, setNextIndex] = useState(0);
  const [walletSetup, setWalletSetup] = useState(true);
  const [preview, setPreview] = useState<{ prefix: string; label: string; addresses: string[] } | null>(null);
  const [match, setMatch] = useState(false);
  const [checking, setChecking] = useState(false);
  const [adding, setAdding] = useState(false);

  const reload = useCallback(async () => {
      const res = await fetch("/api/admin/payment-settings");
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) setError(json.error || "Could not load.");
      else {
        const s = json.settings;
        setBtcOn(s.btc_enabled === true); setBtcMinutes(String(s.btc_quote_minutes ?? 30)); setBtcConfs(String(s.btc_confirmations ?? 2));
        setBtcSetup(json.bitcoinSetup !== false); setAddresses(Array.isArray(json.addresses) ? json.addresses : []);
        setWalletSetup(json.walletSetup !== false);
        if (json.wallet) { setXpub(json.wallet.xpub); setSavedXpub(json.wallet.xpub); setXpubType(json.wallet.type); setNextIndex(json.wallet.nextIndex); setMode("xpub"); }
        else { setSavedXpub(""); setNextIndex(0); setMode(Array.isArray(json.addresses) && json.addresses.length > 0 ? "list" : "xpub"); }
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
  const checkKey = async () => {
    setChecking(true); setError(null); setNotice(null); setPreview(null); setMatch(false);
    const res = await fetch("/api/admin/payment-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "check_xpub", xpub, type: xpubType }) });
    const json = await res.json().catch(() => ({}));
    setChecking(false);
    if (!res.ok) return setError(json.error || "Could not check the key.");
    setPreview({ prefix: json.prefix, label: json.label, addresses: json.addresses });
  };
  const keyChanged = mode === "xpub" && xpub.trim() !== "" && xpub.trim() !== savedXpub;
  const free = addresses.filter((a) => !a.used).length;

  const set = (i: number, patch: Partial<BankAccount>) => setAccounts((a) => a.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const save = async () => {
    setSaving(true); setError(null); setNotice(null);
    const res = await fetch("/api/admin/payment-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ monthly_price: monthly, yearly_price: yearly, instructions, accounts, currency: "AWG", btc_enabled: btcOn, btc_quote_minutes: btcMinutes, btc_confirmations: btcConfs, ...(walletSetup ? { btc_xpub: mode === "xpub" ? xpub.trim() : "", btc_xpub_type: xpubType, btc_xpub_match: match } : {}) }) });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return setError(json.error || "Could not save.");
    setAccounts(json.settings.accounts); setNotice("Saved. People see this when they pick Pro.");
    setPreview(null); setMatch(false); reload();
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
                {walletSetup && (
                  <div className="flex gap-1 rounded-2xl bg-muted p-1" role="tablist" aria-label="How addresses are made">
                    {([["xpub", "Wallet key (xpub)"], ["list", "Address list"]] as const).map(([m, label]) => (
                      <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} data-testid={`btc-mode-${m}`} className={cn("min-h-[44px] flex-1 rounded-xl text-sm font-extrabold", mode === m ? "bg-card shadow-sm" : "text-muted-foreground")}>{label}</button>
                    ))}
                  </div>
                )}
                {walletSetup && mode === "xpub" && (
                  <div className="space-y-3" data-testid="btc-xpub-card">
                    <div className="space-y-1.5">
                      <label htmlFor="btc-xpub" className="text-sm font-semibold">Public key from your wallet</label>
                      <p className="text-xs text-muted-foreground">Paste the xpub, ypub or zpub. The app makes a new address for each request and never holds a key that can spend.</p>
                      <textarea id="btc-xpub" value={xpub} onChange={(e) => { setXpub(e.target.value); setPreview(null); setMatch(false); }} rows={3} spellCheck={false} autoComplete="off" data-testid="btc-xpub" className="w-full rounded-lg border border-input bg-background p-3 font-mono text-xs" />
                    </div>
                    {xpub.trim().startsWith("xpub") && (
                      <div className="space-y-1.5">
                        <label htmlFor="btc-xpub-type" className="text-sm font-medium">Address type in your wallet</label>
                        <select id="btc-xpub-type" value={xpubType} onChange={(e) => { setXpubType(e.target.value as "legacy" | "segwit" | "native"); setPreview(null); setMatch(false); }} data-testid="btc-xpub-type" className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">
                          <option value="legacy">Legacy (starts with 1)</option>
                          <option value="segwit">SegWit (starts with 3)</option>
                          <option value="native">Native SegWit (starts with bc1q)</option>
                        </select>
                      </div>
                    )}
                    <Button type="button" variant="outline" className="w-full" onClick={checkKey} disabled={checking || !xpub.trim()} data-testid="btc-check-key"><Check className="h-4 w-4" aria-hidden="true" />Check key</Button>
                    {preview && (
                      <div className="space-y-2 rounded-xl border p-3" data-testid="btc-preview">
                        <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold">{preview.label}</p><span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-extrabold text-green-800 dark:bg-green-950 dark:text-green-200">Key is valid</span></div>
                        <p className="text-xs text-muted-foreground">Open your wallet and compare. These must be the first receiving addresses it shows.</p>
                        <ul className="divide-y">
                          {preview.addresses.map((a, i) => <li key={a} className="flex gap-3 py-2 text-xs"><span className="w-6 font-extrabold text-muted-foreground">#{i}</span><span className="break-all font-mono font-semibold">{a}</span></li>)}
                        </ul>
                        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={match} onChange={(e) => setMatch(e.target.checked)} data-testid="btc-match" className="mt-1 h-4 w-4" /><span><b>They match my wallet</b><br /><span className="text-xs text-muted-foreground">Needed before a new key can be saved</span></span></label>
                      </div>
                    )}
                    {keyChanged && !preview && <p className="text-xs text-amber-700">Check the key before you save it.</p>}
                    {savedXpub && !keyChanged && (
                      <div className="flex items-center justify-between rounded-xl bg-muted p-3 text-sm" data-testid="btc-given"><span className="font-semibold">Addresses given out</span><span className="font-extrabold">{nextIndex}</span></div>
                    )}
                    <Alert variant="warning">An xpub shows every address and balance of that wallet to anyone who sees it. It is kept on the server and only an admin can see it. Never paste a seed phrase or a key that starts with xprv.</Alert>
                  </div>
                )}
                {(!walletSetup || mode === "list") && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between"><p className="text-sm font-semibold">Addresses</p><p className="text-xs font-semibold text-muted-foreground" data-testid="btc-count">{free} free of {addresses.length}</p></div>
                  <p className="text-xs text-muted-foreground">Each address is used for one request, so you can tell who paid. Bitcoin shows only while at least one is free.{savedXpub ? " Saving with this tab open stops using your wallet key." : ""}</p>
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
                )}
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
