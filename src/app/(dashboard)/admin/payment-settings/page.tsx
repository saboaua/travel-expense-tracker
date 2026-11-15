"use client";

import { useEffect, useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { BackLink, PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { BankAccount } from "@/lib/payments";

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

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/admin/payment-settings");
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) setError(json.error || "Could not load.");
      else {
        const s = json.settings;
        setMonthly(String(s.monthly_price ?? "")); setYearly(String(s.yearly_price ?? "")); setInstructions(s.instructions ?? ""); setAccounts(Array.isArray(s.accounts) ? s.accounts : []);
      }
      setLoading(false);
    })();
  }, []);

  const set = (i: number, patch: Partial<BankAccount>) => setAccounts((a) => a.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const save = async () => {
    setSaving(true); setError(null); setNotice(null);
    const res = await fetch("/api/admin/payment-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ monthly_price: monthly, yearly_price: yearly, instructions, accounts, currency: "AWG" }) });
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
          <Button className="min-h-[52px] w-full" onClick={save} disabled={saving} data-testid="pay-save"><Check className="h-5 w-5" aria-hidden="true" />Save</Button>
        </>
      )}
    </div>
  );
}
