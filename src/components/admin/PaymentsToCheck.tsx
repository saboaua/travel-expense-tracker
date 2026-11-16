"use client";

import { useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { explorerAddress, explorerTx, formatBtc } from "@/lib/bitcoin";

type Pending = { id: string; name: string; period: "monthly" | "yearly"; amount: number; currency: string; reference: string; created_at: string; method?: string; btc_address?: string | null; btc_amount?: number | null; btc_rate_usd?: number | null; txid?: string | null };

/** Payments people say they made, waiting for the admin to confirm or reject. Confirming switches Pro on. */
export function PaymentsToCheck() {
  const [pending, setPending] = useState<Pending[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(async () => {
    const pay = await fetch("/api/admin/payments").then((r) => r.json()).catch(() => ({}));
    setPending(Array.isArray(pay.pending) ? pay.pending : []);
  }, []);
  useEffect(() => { load(); }, [load]);
  const decide = async (id: string, action: "confirm" | "reject") => {
    setError(null); setNotice(null);
    const res = await fetch("/api/admin/payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return setError(json.error || "Could not save.");
    setNotice(action === "confirm" ? "Payment confirmed. Pro is on." : "Payment rejected.");
    load();
  };
  return (
    <>
      {error && <Alert>{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}
      {pending.length > 0 && (
        <section className="space-y-2" data-testid="pay-pending">
          <p className="text-xs font-extrabold tracking-wide text-muted-foreground">PAYMENTS TO CHECK</p>
          <Card><CardContent className="divide-y p-0">
            {pending.map((p) => (
              <div key={p.id} className="space-y-3 p-4" data-testid="pay-request">
                <div className="flex items-center gap-3"><div className="min-w-0 flex-1"><p className="truncate font-semibold">{p.name}</p><p className="text-sm text-muted-foreground">{p.method === "bitcoin" ? "Bitcoin · " : ""}{p.period === "yearly" ? "Yearly" : "Monthly"} · {p.reference}</p></div><Money amount={Number(p.amount)} currency={p.currency} className="text-base" /></div>
                {p.method === "bitcoin" && p.btc_address && (
                  <dl className="space-y-1 rounded-xl bg-muted p-3 text-sm" data-testid="pay-btc">
                    <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Amount</dt><dd className="font-bold" data-testid="pay-btc-amount">{formatBtc(Number(p.btc_amount))} BTC{p.btc_rate_usd ? <span className="font-normal text-muted-foreground"> at USD {Number(p.btc_rate_usd).toLocaleString("en-US", { maximumFractionDigits: 0 })}</span> : null}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Address</dt><dd className="break-all text-right font-mono text-xs">{p.btc_address}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Transaction</dt><dd className="text-right font-mono text-xs">{p.txid ? <a className="underline" href={explorerTx(p.txid)} target="_blank" rel="noreferrer">{p.txid.slice(0, 10)}…{p.txid.slice(-6)}</a> : "Not given"}</dd></div>
                    <a className="inline-block pt-1 text-sm font-bold text-primary underline" href={p.txid ? explorerTx(p.txid) : explorerAddress(p.btc_address)} target="_blank" rel="noreferrer" data-testid="pay-btc-explorer">Open in explorer</a>
                  </dl>
                )}
                <div className="flex gap-2"><Button size="sm" className="bg-green-700 text-white hover:bg-green-800" onClick={() => decide(p.id, "confirm")} data-testid="pay-confirm"><Check className="h-4 w-4" aria-hidden="true" />Confirm payment</Button><Button size="sm" variant="outline" className="text-red-700" onClick={() => decide(p.id, "reject")} data-testid="pay-reject">Reject</Button></div>
              </div>
            ))}
          </CardContent></Card>
        </section>
      )}
    </>
  );
}
