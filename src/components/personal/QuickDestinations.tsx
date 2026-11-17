"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bell, CheckCircle2, Coins, Fuel, Lock, Plus, ShoppingCart, Store, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IconTile } from "@/components/ui/icon-tile";
import { Money } from "@/components/ui/money";
import { AmountField } from "@/components/personal/AmountField";
import { MarkPaidSheet } from "@/components/personal/MarkPaidSheet";
import { toUsd } from "@/lib/currencies";
import { useCurrencies } from "@/lib/use-currencies";
import { useUsdRate } from "@/lib/personal/use-rate";
import { useUtilityBills } from "@/lib/personal/use-utility-bills";
import { convert } from "@/lib/personal/money";
import { DESTS, fuelTotalRow, groceryTotalRow, topNames, type Dest } from "@/lib/personal/quick-targets";
import { parseAmount, QUICK_DEFAULT_CURRENCY } from "@/lib/personal/quick-spend";
import { UTILITY_KINDS, defaultBillMonth, dueBills, dueLabel, kindLabel, lastProvider, monthStart, usualLag, type BillRow } from "@/lib/personal/utilities";
import { browserOutbox } from "@/lib/outbox";
import { makeRowApi, saveRow } from "@/lib/row-outbox";
import { addDaysISO, cn, formatCurrency, todayISO } from "@/lib/utils";

const chip = (on: boolean) =>
  `inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${on ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900" : "bg-background hover:bg-accent"}`;
const label = "mb-1.5 block text-[13px] font-bold text-foreground/80";

const TILES: { id: Dest; icon: typeof Coins; tone: "groceries" | "projects" | "utilities" | "spend" }[] = [
  { id: "groceries", icon: ShoppingCart, tone: "groceries" }, { id: "fuel", icon: Fuel, tone: "projects" }, { id: "utilities", icon: Zap, tone: "utilities" }, { id: "everyday", icon: Coins, tone: "spend" },
];

/** Where the amount goes. The group is the tile you pick. */
export function DestinationTiles({ value, onChange }: { value: Dest; onChange: (d: Dest) => void }) {
  return (
    <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Where did it go?" data-testid="quick-dests">
      {TILES.map((t) => {
        const on = value === t.id;
        const Icon = t.icon;
        return (
          <button key={t.id} type="button" role="radio" aria-checked={on} onClick={() => onChange(t.id)} data-testid={`dest-${t.id}`}
            className={cn("flex min-w-0 flex-col items-center gap-1.5 rounded-2xl border px-1 py-2.5 text-[12.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", on ? "border-primary bg-primary/5 font-extrabold" : "bg-card font-semibold hover:bg-accent")}>
            <IconTile tone={t.tone} className="h-9 w-9"><Icon className="h-[18px] w-[18px]" /></IconTile>
            {DESTS.find((d) => d.id === t.id)?.label}
          </button>
        );
      })}
    </div>
  );
}

/** The date row all three share. */
function DateRow({ date, setDate }: { date: string; setDate: (d: string) => void }) {
  const today = todayISO(), yesterday = addDaysISO(today, -1);
  const [pick, setPick] = useState(false);
  return (
    <div>
      <span className={label}>Date</span>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Date">
        <button type="button" aria-pressed={!pick && date === today} onClick={() => { setPick(false); setDate(today); }} className={chip(!pick && date === today)}>Today</button>
        <button type="button" aria-pressed={!pick && date === yesterday} onClick={() => { setPick(false); setDate(yesterday); }} className={chip(!pick && date === yesterday)}>Yesterday</button>
        <button type="button" aria-pressed={pick} onClick={() => setPick(true)} className={chip(pick)}>Pick a date</button>
      </div>
      {pick && <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className="mt-2 h-12" aria-label="Date" />}
    </div>
  );
}

/** The amount with AWG/USD only: grocery totals and fuel fill-ups are kept in one of those two. */
function useMoney() {
  const currencies = useCurrencies();
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(QUICK_DEFAULT_CURRENCY);
  const { rate, setRate } = useUsdRate(currency);
  const choices = currencies.some((c) => c.code === "USD") && currencies.some((c) => c.code === QUICK_DEFAULT_CURRENCY) ? [QUICK_DEFAULT_CURRENCY, "USD"] : [QUICK_DEFAULT_CURRENCY, "USD"];
  return { amount, setAmount, currency, setCurrency, rate, setRate, choices };
}

/** Names you used before, newest first. Reads one column; nothing when the table is empty or missing. */
function useRecent(table: string, nameCol: string, dateCol: string): string[] {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    createClient().from(table).select(nameCol).order(dateCol, { ascending: false }).limit(200)
      .then(({ data }) => setNames(topNames(((data ?? []) as unknown as Record<string, string | null>[]).map((r) => r[nameCol]))));
  }, [table, nameCol, dateCol]);
  return names;
}

async function userId(): Promise<string> {
  const { data: { session } } = await createClient().auth.getSession();
  if (!session) throw new Error("Sign in again to save.");
  return session.user.id;
}

export function QuickGroceries() {
  const m = useMoney();
  const stores = useRecent("grocery_receipts", "store", "purchase_date");
  const [store, setStore] = useState("");
  const [other, setOther] = useState(false);
  const [date, setDate] = useState(todayISO());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setDone(null);
    const amt = parseAmount(m.amount);
    if (amt == null) return setError("Enter the amount you spent.");
    const row = groceryTotalRow({ store, date, amount: amt, currency: m.currency });
    if (!row) return setError("Choose the store, or type its name.");
    setSaving(true);
    try {
      const supabase = createClient();
      await saveRow({ api: makeRowApi(supabase), store: browserOutbox, userId: await userId(), table: "grocery_receipts", row, label: row.store, summary: "Groceries · total only" });
      setDone(`Saved: ${formatCurrency(amt, m.currency)} at ${row.store}`);
      m.setAmount(""); setStore(""); setOther(false); setDate(todayISO());
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save."); } finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border bg-card p-4" data-testid="quick-groceries">
      <div><label htmlFor="qg-amount" className={label}>Amount</label><AmountField id="qg-amount" amount={m.amount} onAmount={m.setAmount} currency={m.currency} onCurrency={m.setCurrency} choices={m.choices} others={[]} rate={m.rate} onRate={m.setRate} /></div>
      <div>
        <span className={label} id="qg-store">Which store?</span>
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby="qg-store">
          {stores.map((s) => <button key={s} type="button" aria-pressed={store === s && !other} onClick={() => { setStore(s); setOther(false); }} className={chip(store === s && !other)}><Store className="h-4 w-4" aria-hidden="true" />{s}</button>)}
          <button type="button" aria-pressed={other || stores.length === 0} onClick={() => { setOther(true); setStore(""); }} className={chip(other || stores.length === 0)} data-testid="store-other">{stores.length ? "Other store…" : "Type the store"}</button>
        </div>
        {(other || stores.length === 0) && <Input value={store} onChange={(e) => setStore(e.target.value)} placeholder="Store name" maxLength={120} className="mt-2 h-12 text-base" aria-label="Store name" data-testid="store-name" />}
      </div>
      <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[13px] leading-relaxed text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-50">
        <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Saved as a total with the store. No receipt needed. It is private and never goes to community prices.</span>
      </div>
      <DateRow date={date} setDate={setDate} />
      {error && <Alert>{error}</Alert>}
      {done && <Alert variant="success" data-testid="quick-dest-done">{done}. <Link href="/personal/groceries" className="font-semibold underline">See Groceries</Link></Alert>}
      <Button type="submit" disabled={saving} className="h-12 w-full text-base" data-testid="quick-dest-save">{saving ? "Saving..." : "Save"}</Button>
    </form>
  );
}

export function QuickFuel() {
  const m = useMoney();
  const stations = useRecent("fuel_fillups", "station", "fill_date");
  const [station, setStation] = useState("");
  const [other, setOther] = useState(false);
  const [litres, setLitres] = useState("");
  const [date, setDate] = useState(todayISO());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setDone(null);
    const amt = parseAmount(m.amount);
    if (amt == null) return setError("Enter the amount you paid.");
    const q = litres.trim() ? parseAmount(litres) : null;
    if (litres.trim() && q == null) return setError("Litres must be a number, or leave it empty.");
    const row = fuelTotalRow({ date, amount: amt, currency: m.currency, usd: convert(amt, m.currency, "USD") ?? toUsd(amt, Number(m.rate) || 1), station, quantity: q });
    if (!row) return setError("Enter the amount you paid.");
    setSaving(true);
    try {
      await saveRow({ api: makeRowApi(createClient()), store: browserOutbox, userId: await userId(), table: "fuel_fillups", row, label: station.trim() || "Fuel fill-up", summary: "Fuel · new" });
      setDone(`Saved: ${formatCurrency(amt, m.currency)}${station.trim() ? ` at ${station.trim()}` : ""}`);
      m.setAmount(""); setStation(""); setOther(false); setLitres(""); setDate(todayISO());
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save."); } finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border bg-card p-4" data-testid="quick-fuel">
      <div><label htmlFor="qf-amount" className={label}>Amount</label><AmountField id="qf-amount" amount={m.amount} onAmount={m.setAmount} currency={m.currency} onCurrency={m.setCurrency} choices={m.choices} others={[]} rate={m.rate} onRate={m.setRate} /></div>
      <div>
        <span className={label} id="qf-station">Which station? <span className="font-normal text-muted-foreground">(optional)</span></span>
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby="qf-station">
          {stations.map((s) => <button key={s} type="button" aria-pressed={station === s && !other} onClick={() => { setStation(s); setOther(false); }} className={chip(station === s && !other)}><Fuel className="h-4 w-4" aria-hidden="true" />{s}</button>)}
          <button type="button" aria-pressed={other || stations.length === 0} onClick={() => { setOther(true); setStation(""); }} className={chip(other || stations.length === 0)}>{stations.length ? "Other station…" : "Type the station"}</button>
        </div>
        {(other || stations.length === 0) && <Input value={station} onChange={(e) => setStation(e.target.value)} placeholder="Station name" maxLength={120} className="mt-2 h-12 text-base" aria-label="Station name" />}
      </div>
      <div><label htmlFor="qf-litres" className={label}>Litres <span className="font-normal text-muted-foreground">(optional, to track price and use)</span></label><Input id="qf-litres" inputMode="decimal" value={litres} onChange={(e) => setLitres(e.target.value)} placeholder="Add litres" className="h-12 text-base" /></div>
      <DateRow date={date} setDate={setDate} />
      {error && <Alert>{error}</Alert>}
      {done && <Alert variant="success" data-testid="quick-dest-done">{done}. <Link href="/personal/fuel" className="font-semibold underline">See Fuel</Link></Alert>}
      <Button type="submit" disabled={saving} className="h-12 w-full text-base" data-testid="quick-dest-save">{saving ? "Saving..." : "Save"}</Button>
    </form>
  );
}

export function QuickUtilities() {
  const { rows, error: loadError, reload } = useUtilityBills();
  const [paying, setPaying] = useState<BillRow | null>(null);
  const [another, setAnother] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const waiting = useMemo(() => dueBills(rows ?? []), [rows]);
  const kindsWaiting = new Set(waiting.map((b) => b.kind));

  return (
    <div className="space-y-4 rounded-2xl border bg-card p-4" data-testid="quick-utilities">
      {loadError && <Alert>{loadError}</Alert>}
      {done && <Alert variant="success" data-testid="quick-dest-done"><CheckCircle2 className="mr-1 inline h-4 w-4" aria-hidden="true" />{done}</Alert>}
      {waiting.length > 0 && (
        <div>
          <span className={label}>Waiting to be paid</span>
          <ul className="space-y-2">
            {waiting.map((b) => {
              const due = dueLabel(b, todayISO());
              return (
                <li key={b.id}>
                  <button type="button" onClick={() => { setDone(null); setPaying(b); }} data-testid="quick-bill" className="flex min-h-[62px] w-full items-center gap-3 rounded-2xl border bg-background px-3 py-2 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    <IconTile tone="utilities" className="h-10 w-10"><Zap className="h-5 w-5" /></IconTile>
                    <span className="min-w-0 flex-1"><span className="block truncate text-[14.5px] font-extrabold">{kindLabel(b.kind)}{b.provider ? ` · ${b.provider}` : ""}</span><span className="block text-[12.5px] text-muted-foreground">{due.text} · <Money amount={Number(b.amount)} currency={b.currency} /></span></span>
                    <span className="shrink-0 text-xs font-bold text-primary">Mark paid</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 flex items-start gap-2 text-xs text-muted-foreground"><Bell className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />Marking a bill paid stops its reminder. Nothing else changes.</p>
        </div>
      )}
      <div>
        {waiting.length > 0 && <span className={label}>Or</span>}
        {!another ? (
          <button type="button" onClick={() => setAnother(true)} data-testid="quick-another" className="flex min-h-[62px] w-full items-center gap-3 rounded-2xl border bg-background px-3 py-2 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <IconTile tone="fixed" className="h-10 w-10"><Plus className="h-5 w-5" /></IconTile>
            <span className="min-w-0 flex-1"><span className="block text-[14.5px] font-extrabold">Another utility</span><span className="block text-[12.5px] text-muted-foreground">Water, phone, internet, trash…</span></span>
          </button>
        ) : (
          <AnotherUtility rows={rows ?? []} waitingKinds={kindsWaiting} onSaved={(t) => { setDone(t); setAnother(false); reload(); }} onCancel={() => setAnother(false)} />
        )}
      </div>
      {rows !== null && waiting.length === 0 && !another && <p className="text-sm text-muted-foreground">No bills waiting. Add the one you just paid.</p>}
      {paying && <MarkPaidSheet bill={paying} onClose={() => setPaying(null)} onSaved={() => { setDone(`${kindLabel(paying.kind)} marked paid`); setPaying(null); reload(); }} />}
    </div>
  );
}

function AnotherUtility({ rows, waitingKinds, onSaved, onCancel }: { rows: BillRow[]; waitingKinds: Set<string>; onSaved: (text: string) => void; onCancel: () => void }) {
  const m = useMoney();
  const [kind, setKind] = useState<string>("water");
  const [provider, setProvider] = useState("");
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const usual = useMemo(() => lastProvider(rows, kind), [rows, kind]);
  const shown = touched ? provider : usual ?? "";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    const amt = parseAmount(m.amount);
    if (amt == null) return setError("Enter the amount you paid.");
    const rateNum = m.currency === "USD" ? 1 : Number(m.rate);
    if (!(rateNum > 0)) return setError("Enter an exchange rate to USD.");
    setSaving(true);
    try {
      const today = todayISO();
      const prov = shown.trim() || null;
      const row = { kind, provider: prov, bill_month: defaultBillMonth(today, usualLag(rows, kind, prov)) || monthStart(today), amount: amt, currency: m.currency, exchange_rate: rateNum, amount_usd: toUsd(amt, rateNum), paid_on: today, due_date: null, notes: null };
      await saveRow({ api: makeRowApi(createClient()), store: browserOutbox, userId: await userId(), table: "utility_bills", row, label: `${kindLabel(kind)} bill`, summary: "Utility bill · paid" });
      onSaved(`Saved: ${formatCurrency(amt, m.currency)} for ${kindLabel(kind).toLowerCase()}`);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save."); setSaving(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border bg-background p-3" data-testid="quick-another-form">
      <div>
        <span className={label} id="qu-kind">Which utility?</span>
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby="qu-kind">
          {UTILITY_KINDS.map((k) => <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => { setKind(k.id); setTouched(false); }} className={chip(kind === k.id)}>{k.label}</button>)}
        </div>
        {waitingKinds.has(kind) && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300" data-testid="quick-kind-waiting">You already have a {kindLabel(kind).toLowerCase()} bill waiting. Pick it above if this is the same one.</p>}
      </div>
      <div><label htmlFor="qu-provider" className={label}>Company <span className="font-normal text-muted-foreground">(optional)</span></label><Input id="qu-provider" value={shown} onChange={(e) => { setProvider(e.target.value); setTouched(true); }} maxLength={80} className="h-12 text-base" /></div>
      <div><label htmlFor="qu-amount" className={label}>Amount paid today</label><AmountField id="qu-amount" amount={m.amount} onAmount={m.setAmount} currency={m.currency} onCurrency={m.setCurrency} choices={m.choices} others={[]} rate={m.rate} onRate={m.setRate} /></div>
      {error && <Alert>{error}</Alert>}
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="h-12 flex-1" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={saving} className="h-12 flex-1 text-base" data-testid="quick-dest-save">{saving ? "Saving..." : "Save paid bill"}</Button>
      </div>
    </form>
  );
}

