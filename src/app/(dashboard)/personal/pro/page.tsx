"use client";

import { useCallback, useEffect, useState } from "react";
import { Bitcoin, Check, Clock, Copy, Crown, Landmark } from "lucide-react";
import { BitcoinPay } from "@/components/pro/BitcoinPay";
import { withColumnFallback } from "@/lib/columns";
import { BackLink, PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { createClient } from "@/lib/supabase/client";
import { PAYMENT_BASE_COLS, PAYMENT_BASE_SETTINGS_COLS, PAYMENT_COLS, PAYMENT_SETTINGS_COLS, monthsFree, priceFor, userReference, type PayPeriod, type PaymentSettings, type PlanPayment } from "@/lib/payments";
import { PLAN_COLS, isProActive, type PlanRow } from "@/lib/plans";
import { cn, formatDate, todayISO } from "@/lib/utils";

const pick = "flex-1 rounded-2xl border-2 p-3 text-left";

export default function GetProPage() {
  const [state, setState] = useState<"loading" | "ready" | "setup">("loading");
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [uid, setUid] = useState("");
  const [plan, setPlan] = useState<PlanRow | null>(null);
  const [pending, setPending] = useState<PlanPayment | null>(null);
  const [rejected, setRejected] = useState(false);
  const [period, setPeriod] = useState<PayPeriod>("yearly");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [btc, setBtc] = useState<{ available: boolean; confirmations: number }>({ available: false, confirmations: 0 });
  const [tab, setTab] = useState<"bank" | "bitcoin">("bank");

  const load = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const id = session?.user.id;
      if (!id) return setState("setup");
      setUid(id);
      const [cfg, pays, pl] = await Promise.all([
        withColumnFallback((cols) => supabase.from("payment_settings").select(cols).eq("id", 1).maybeSingle(), PAYMENT_SETTINGS_COLS, PAYMENT_BASE_SETTINGS_COLS),
        withColumnFallback((cols) => supabase.from("plan_payments").select(cols).eq("user_id", id).neq("status", "expired").order("created_at", { ascending: false }).limit(5), PAYMENT_COLS, PAYMENT_BASE_COLS),
        supabase.from("user_plans").select(PLAN_COLS).eq("user_id", id).maybeSingle(),
      ]);
      if (cfg.error || !cfg.data) return setState("setup");
      const s = cfg.data as unknown as PaymentSettings;
      setSettings({ ...s, monthly_price: Number(s.monthly_price), yearly_price: Number(s.yearly_price), accounts: Array.isArray(s.accounts) ? s.accounts : [] });
      const rows = ((pays.data ?? []) as unknown as PlanPayment[]);
      setPending(rows.find((r) => r.status === "pending") ?? null);
      setRejected(rows[0]?.status === "rejected");
      try { const r = await fetch("/api/pro/bitcoin"); const j = r.ok ? await r.json() : null; setBtc({ available: !!j?.available, confirmations: Number(j?.confirmations) || 0 }); } catch { setBtc({ available: false, confirmations: 0 }); }
      setPlan((pl.data as PlanRow | null) ?? null);
      setState("ready");
    } catch { setState("setup"); }
  }, []);
  useEffect(() => { load(); }, [load]);
  // While a payment is being checked, look again now and then so the page notices when it is decided
  useEffect(() => { if (!pending) return; const t = setInterval(load, 30000); return () => clearInterval(t); }, [pending, load]);

  const reference = uid ? userReference(uid) : "";
  const today = todayISO();
  const proNow = isProActive(plan, today);
  const hasPrice = !!settings && priceFor(settings, "monthly") > 0;
  const bankReady = hasPrice && !!settings && settings.accounts.length > 0;
  const btcReady = hasPrice && btc.available;
  const btcOpen = pending?.method === "bitcoin";
  const ready = bankReady || btcReady || btcOpen;
  const showBtc = btcOpen || (tab === "bitcoin" && btcReady) || (!bankReady && btcReady);

  const copy = async () => { try { await navigator.clipboard.writeText(reference); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* the code is on screen to copy by hand */ } };

  const iPaid = async () => {
    if (!settings) return;
    setBusy(true); setError(null);
    const { error: err } = await createClient().from("plan_payments").insert({ user_id: uid, period, amount: priceFor(settings, period), currency: settings.currency, method: "other", reference, status: "pending" });
    setBusy(false);
    if (err && err.code !== "23505") return setError("Could not send. Check your connection and try again.");
    load();
  };

  return (
    <div className="mx-auto max-w-xl space-y-5 p-4 md:p-8">
      <BackLink href="/personal">Personal</BackLink>
      <PageHeader title="Get Pro" description={btc.available ? "Pay by bank transfer or Bitcoin" : "Pay by bank transfer from your bank app"} />
      {state === "loading" && <p className="text-sm text-muted-foreground">Loading…</p>}
      {state === "setup" && <Alert>Payment details are not set up yet. Ask your admin.</Alert>}
      {state === "ready" && settings && (
        <>
          {proNow && <Card><CardContent className="flex items-center gap-3 py-4" data-testid="pro-active"><Crown className="h-6 w-6 text-amber-600" aria-hidden="true" /><div><p className="font-semibold">Pro is on</p><p className="text-sm text-muted-foreground">{plan?.ends_on ? `Until ${formatDate(plan.ends_on)}. Paying again adds time to it.` : "No end date."}</p></div></CardContent></Card>}
          {rejected && !pending && <Alert>Your last payment could not be matched. Check the amount and the reference, then try again or tell your admin.</Alert>}
          {!ready && <Alert>Payment details are not set up yet. Ask your admin.</Alert>}

          {ready && pending && !btcOpen && (
            <>
              <Card><CardContent className="space-y-3 py-4" data-testid="pro-pending">
                <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"><Clock className="h-5 w-5" aria-hidden="true" /></span>
                  <div><p className="font-semibold">We are checking your payment</p><p className="text-sm text-muted-foreground">{pending.period === "yearly" ? "Yearly" : "Monthly"} Pro, <Money amount={Number(pending.amount)} currency={pending.currency} className="text-sm" /> · Reference {pending.reference}</p></div></div>
                <p className="text-sm leading-relaxed text-muted-foreground">Usually within a day. Pro turns on once your admin sees the money.</p>
              </CardContent></Card>
              <p className="text-center text-sm text-muted-foreground">Paid the wrong amount or no reference? Tell your admin and give them this reference: <b>{pending.reference}</b></p>
            </>
          )}

          {ready && btcOpen && <BitcoinPay period={pending!.period} pending={pending} confirmations={btc.confirmations} onChanged={load} />}

          {ready && !pending && (
            <>
              <div className="flex gap-3" role="radiogroup" aria-label="Plan">
                {(["monthly", "yearly"] as PayPeriod[]).map((p) => (
                  <button key={p} type="button" role="radio" aria-checked={period === p} onClick={() => setPeriod(p)} data-testid={`pro-${p}`} className={cn(pick, period === p ? "border-primary bg-primary/5" : "bg-card")}>
                    <span className="flex items-center justify-between gap-2"><span className="text-sm font-extrabold">{p === "yearly" ? "Yearly" : "Monthly"}</span>{p === "yearly" && monthsFree(settings) > 0 && <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-extrabold text-green-800 dark:bg-green-950 dark:text-green-200">Best value</span>}</span>
                    <span className="mt-1 block"><Money amount={priceFor(settings, p)} currency={settings.currency} className="text-xl" /></span>
                    <span className="block text-xs text-muted-foreground">{p === "yearly" ? (monthsFree(settings) > 0 ? `${monthsFree(settings)} month${monthsFree(settings) === 1 ? "" : "s"} free` : "a year") : "a month"}</span>
                  </button>
                ))}
              </div>
              {bankReady && btcReady && (
                <div className="flex gap-1 rounded-2xl bg-muted p-1" role="tablist" aria-label="How to pay">
                  <button type="button" role="tab" aria-selected={!showBtc} onClick={() => setTab("bank")} data-testid="pro-tab-bank" className={cn("flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl text-sm font-extrabold", !showBtc ? "bg-card shadow-sm" : "text-muted-foreground")}><Landmark className="h-4 w-4" aria-hidden="true" />Bank transfer</button>
                  <button type="button" role="tab" aria-selected={showBtc} onClick={() => setTab("bitcoin")} data-testid="pro-tab-bitcoin" className={cn("flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl text-sm font-extrabold", showBtc ? "bg-card shadow-sm" : "text-muted-foreground")}><Bitcoin className="h-4 w-4" aria-hidden="true" />Bitcoin</button>
                </div>
              )}
              {showBtc && <BitcoinPay period={period} pending={null} confirmations={btc.confirmations} onChanged={load} />}
              {!showBtc && <>
              <Card><CardContent className="space-y-1.5 py-4 text-sm leading-relaxed">
                <p className="font-semibold">How to pay</p>
                <p>1. Open your bank app.</p>
                <p>2. Send <b>{settings.currency} {priceFor(settings, period).toFixed(2)}</b> to one of the accounts below.</p>
                <p>3. Put your reference in the description.</p>
                <p>4. Tap <b>I have paid</b>. We turn Pro on within a day.</p>
                {settings.instructions && <p className="pt-1 text-muted-foreground">{settings.instructions}</p>}
              </CardContent></Card>
              <Card><CardContent className="py-4"><div className="flex items-center gap-3 rounded-2xl bg-muted p-3">
                <div className="flex-1"><p className="text-xs font-semibold text-muted-foreground">Your payment reference</p><p className="text-2xl font-black tracking-wider" data-testid="pro-reference">{reference}</p></div>
                <Button type="button" variant="outline" onClick={copy}>{copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}{copied ? "Copied" : "Copy"}</Button>
              </div></CardContent></Card>
              {settings.accounts.map((a, i) => (
                <Card key={i}><CardContent className="space-y-1 py-4 text-sm" data-testid="pro-account">
                  <p className="flex items-center gap-2 font-extrabold"><Landmark className="h-4 w-4 text-muted-foreground" aria-hidden="true" />{a.bank}</p>
                  {a.name && <p className="flex justify-between gap-3"><span className="text-muted-foreground">Account name</span><b>{a.name}</b></p>}
                  <p className="flex justify-between gap-3"><span className="text-muted-foreground">Account number</span><b>{a.number}</b></p>
                  <p className="flex justify-between gap-3"><span className="text-muted-foreground">Currency</span><b>{a.currency}</b></p>
                </CardContent></Card>
              ))}
              {error && <Alert>{error}</Alert>}
              <Button className="min-h-[52px] w-full text-[15px]" onClick={iPaid} disabled={busy} data-testid="pro-paid"><Check className="h-5 w-5" aria-hidden="true" />I have paid</Button>
              </>}
            </>
          )}
        </>
      )}
    </div>
  );
}
