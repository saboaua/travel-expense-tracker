"use client";

import { useEffect, useState } from "react";
import { Bitcoin, Check, Clock, Copy, RotateCcw } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Money } from "@/components/ui/money";
import { bip21, explorerAddress, explorerTx, formatBtc, mmss, secondsLeft } from "@/lib/bitcoin";
import type { PayPeriod, PlanPayment } from "@/lib/payments";

type Props = {
  period: PayPeriod;
  /** The person's open Bitcoin request, if there is one. */
  pending: PlanPayment | null;
  confirmations: number;
  onChanged: () => void;
};

async function post(url: string, body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    return res.ok ? { ok: true } : { ok: false, error: json.error || "Something went wrong. Try again." };
  } catch { return { ok: false, error: "Could not reach the server. Check your connection and try again." }; }
}

/** The Bitcoin tab on the Get Pro page: ask for an amount, pay it, say you paid, wait. */
export function BitcoinPay({ period, pending, confirmations, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txid, setTxid] = useState("");
  const [copied, setCopied] = useState<"address" | "amount" | null>(null);
  const [qr, setQr] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const live = pending?.method === "bitcoin" ? pending : null;
  const left = live ? secondsLeft(live.expires_at, now) : 0;
  const expired = !!live && !live.claimed_at && left <= 0;
  const waiting = !!live && !!live.claimed_at;
  const quoting = !!live && !live.claimed_at && left > 0;

  useEffect(() => {
    if (!quoting) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [quoting]);

  const uri = live?.btc_address && live.btc_amount != null ? bip21(live.btc_address, Number(live.btc_amount)) : "";
  useEffect(() => {
    let off = false;
    if (!uri || !quoting) { setQr(""); return; }
    import("qrcode").then(({ default: QRCode }) => QRCode.toDataURL(uri, { margin: 1, width: 240, errorCorrectionLevel: "M" })).then((u) => { if (!off) setQr(u); }).catch(() => { if (!off) setQr(""); });
    return () => { off = true; };
  }, [uri, quoting]);

  const run = async (url: string, body: Record<string, unknown>) => {
    setBusy(true); setError(null);
    const r = await post(url, body);
    setBusy(false);
    if (!r.ok) return setError(r.error ?? "Something went wrong.");
    onChanged();
  };
  const copy = async (what: "address" | "amount", text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(null), 2000); } catch { /* the text is on screen to copy by hand */ }
  };
  const confirmText = confirmations > 0 ? `We turn Pro on after the network shows ${confirmations} confirmation${confirmations === 1 ? "" : "s"}, usually within an hour.` : "We turn Pro on as soon as the network shows your payment.";

  if (waiting && live) {
    return (
      <div className="space-y-4" data-testid="btc-waiting">
        <Card><CardContent className="space-y-3 py-4">
          <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"><Clock className="h-5 w-5" aria-hidden="true" /></span>
            <div><p className="font-semibold">We are waiting for the network</p><p className="text-sm text-muted-foreground">{formatBtc(Number(live.btc_amount))} BTC · <Money amount={Number(live.amount)} currency={live.currency} className="text-sm" /></p></div></div>
          <p className="text-sm leading-relaxed text-muted-foreground">{confirmText}</p>
          <dl className="space-y-1 text-sm">
            {live.btc_address && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Address</dt><dd className="break-all text-right font-medium"><a className="underline" href={explorerAddress(live.btc_address)} target="_blank" rel="noreferrer">{live.btc_address.slice(0, 10)}…{live.btc_address.slice(-6)}</a></dd></div>}
            {live.txid && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Transaction</dt><dd className="text-right font-medium"><a className="underline" href={explorerTx(live.txid)} target="_blank" rel="noreferrer">{live.txid.slice(0, 8)}…{live.txid.slice(-6)}</a></dd></div>}
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Reference</dt><dd className="font-medium">{live.reference}</dd></div>
          </dl>
        </CardContent></Card>
      </div>
    );
  }

  if (expired && live) {
    return (
      <div className="space-y-4" data-testid="btc-expired">
        <Card><CardContent className="space-y-3 py-4">
          <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200"><Clock className="h-5 w-5" aria-hidden="true" /></span>
            <div><p className="font-semibold">The Bitcoin price changed</p><p className="text-sm text-muted-foreground">The amount was only valid for a short time. Get a new amount to pay.</p></div></div>
          {error && <Alert>{error}</Alert>}
          <Button className="min-h-[48px] w-full" onClick={() => run("/api/pro/bitcoin", { period: live.period })} disabled={busy} data-testid="btc-renew"><RotateCcw className="h-4 w-4" aria-hidden="true" />Get a new amount</Button>
        </CardContent></Card>
        <Card><CardContent className="space-y-2 py-4 text-sm">
          <p className="font-semibold">Already sent it?</p>
          <p className="text-muted-foreground">If you sent {formatBtc(Number(live.btc_amount))} BTC before the time ran out, tell your admin. They will check it.</p>
          <Button variant="outline" className="w-full" onClick={() => run("/api/pro/bitcoin/paid", { id: live.id })} disabled={busy} data-testid="btc-tell-admin">Tell my admin</Button>
        </CardContent></Card>
      </div>
    );
  }

  if (quoting && live && live.btc_address) {
    const amount = formatBtc(Number(live.btc_amount));
    return (
      <div className="space-y-4" data-testid="btc-quote">
        <Card><CardContent className="space-y-3 py-4 text-center">
          <p className="text-xs font-semibold text-muted-foreground">Send exactly</p>
          <p className="text-3xl font-black tracking-tight" data-testid="btc-amount">{amount} BTC</p>
          <p className="text-sm text-muted-foreground"><Money amount={Number(live.amount)} currency={live.currency} className="text-sm" /> · 1 BTC = USD {Number(live.btc_rate_usd).toLocaleString("en-US", { maximumFractionDigits: 0 })}</p>
          <p className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-extrabold text-amber-800 dark:bg-amber-950 dark:text-amber-200"><Clock className="h-3.5 w-3.5" aria-hidden="true" />Valid for <span data-testid="btc-timer">{mmss(left)}</span></p>
          {qr && /* eslint-disable-next-line @next/next/no-img-element */ <img src={qr} alt="QR code to pay with a Bitcoin wallet" width={200} height={200} className="mx-auto rounded-xl bg-white p-1" />}
          <p className="break-all rounded-xl bg-muted p-3 text-sm font-semibold" data-testid="btc-address">{live.btc_address}</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => copy("address", live.btc_address!)}>{copied === "address" ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}{copied === "address" ? "Copied" : "Copy address"}</Button>
            <Button type="button" variant="outline" className="flex-1" onClick={() => copy("amount", amount)}>{copied === "amount" ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}{copied === "amount" ? "Copied" : "Copy amount"}</Button>
          </div>
        </CardContent></Card>
        <Card><CardContent className="space-y-1.5 py-4 text-sm leading-relaxed">
          <p className="font-semibold">How to pay</p>
          <p>1. Open your Bitcoin wallet and scan the code, or copy the address and amount.</p>
          <p>2. Send exactly {amount} BTC before the time runs out.</p>
          <p>3. Tap <b>I have paid</b>. {confirmText}</p>
        </CardContent></Card>
        <Card><CardContent className="space-y-2 py-4">
          <label className="text-sm font-medium" htmlFor="btc-txid">Transaction ID (optional)</label>
          <Input id="btc-txid" value={txid} onChange={(e) => setTxid(e.target.value)} placeholder="Paste it if your wallet shows one" autoComplete="off" spellCheck={false} data-testid="btc-txid" />
        </CardContent></Card>
        {error && <Alert>{error}</Alert>}
        <Button className="min-h-[52px] w-full text-[15px]" onClick={() => run("/api/pro/bitcoin/paid", { id: live.id, txid })} disabled={busy} data-testid="btc-paid"><Check className="h-5 w-5" aria-hidden="true" />I have paid</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="btc-start">
      <Card><CardContent className="space-y-2 py-4 text-sm leading-relaxed">
        <p className="flex items-center gap-2 font-semibold"><Bitcoin className="h-4 w-4 text-amber-600" aria-hidden="true" />Pay with Bitcoin</p>
        <p className="text-muted-foreground">We work out the exact amount for the plan you chose and keep it for a short time, so the price cannot move while you pay. You get an address and a QR code.</p>
      </CardContent></Card>
      {error && <Alert>{error}</Alert>}
      <Button className="min-h-[52px] w-full text-[15px]" onClick={() => run("/api/pro/bitcoin", { period })} disabled={busy} data-testid="btc-get"><Bitcoin className="h-5 w-5" aria-hidden="true" />Show the Bitcoin amount</Button>
    </div>
  );
}
