"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BackLink, PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { convert, round2 } from "@/lib/personal/money";
import { FUEL_COLS, parsePositive, solveFillup, unitName, unitShort, type FuelRow, type FuelUnit } from "@/lib/personal/fuel";
import { todayISO } from "@/lib/utils";
import { browserOutbox } from "@/lib/outbox";
import { deleteRow, isRowSave, makeRowApi, saveRow } from "@/lib/row-outbox";
import { useConfirm } from "@/components/ui/confirm";

type Field = "t" | "p" | "q";
const UNIT_KEY = "fuel-unit";
const readUnit = (): FuelUnit => { try { return localStorage.getItem(UNIT_KEY) === "gal" ? "gal" : "L"; } catch { return "L"; } };

const seg = (on: boolean) => `flex min-h-[42px] flex-1 items-center justify-center rounded-[11px] text-sm font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${on ? "bg-background text-foreground shadow" : "text-muted-foreground"}`;
const show = (n: number, d: number) => String(Math.round(n * 10 ** d) / 10 ** d);

/** Add or change one fill-up. Total paid, price per unit and amount: fill in any two and the third is worked out. Only the total is fine too. */
export function FuelForm({ id }: { id?: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [unit, setUnit] = useState<FuelUnit>("L");
  const [currency, setCurrency] = useState<"AWG" | "USD">("AWG");
  const [v, setV] = useState<Record<Field, string>>({ t: "", p: "", q: "" });
  // the two fields typed last: the third one is worked out from them
  const [order, setOrder] = useState<Field[]>([]);
  const [date, setDate] = useState(todayISO());
  const [station, setStation] = useState("");
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setup, setSetup] = useState(false);

  useEffect(() => { if (!id) setUnit(readUnit()); }, [id]);
  useEffect(() => {
    if (!id) return;
    (async () => {
      const waiting = (await browserOutbox.list().catch(() => [])).find((i) => i.id === id);
      let row: FuelRow | null = waiting && isRowSave(waiting) && waiting.isNew ? ({ id, ...waiting.row } as unknown as FuelRow) : null;
      if (!row) {
        const { data, error: e } = await createClient().from("fuel_fillups").select(FUEL_COLS).eq("id", id).maybeSingle();
        if (e && /relation|schema cache/i.test(e.message)) setSetup(true);
        row = (data as unknown as FuelRow) ?? null;
      }
      if (row) {
        setUnit(row.unit === "gal" ? "gal" : "L"); setCurrency(row.currency === "USD" ? "USD" : "AWG"); setDate(row.fill_date); setStation(row.station ?? "");
        const t = String(Number(row.amount)), p = row.price_per_unit == null ? "" : show(Number(row.price_per_unit), 3), q = row.quantity == null ? "" : show(Number(row.quantity), 2);
        setV({ t, p, q });
        setOrder(row.quantity != null ? ["t", "q"] : row.price_per_unit != null ? ["t", "p"] : ["t"]);
      } else setError("That fill-up was not found.");
      setLoading(false);
    })();
  }, [id]);

  const chooseUnit = (u: FuelUnit) => { setUnit(u); if (!id) { try { localStorage.setItem(UNIT_KEY, u); } catch { /* fine */ } } };
  const type = (f: Field, text: string) => {
    setV((s) => ({ ...s, [f]: text }));
    setOrder((o) => [...o.filter((x) => x !== f), f].slice(-2));
  };

  // What is worked out: with two fields typed last and the third one empty or older, the third follows them
  const derived: Field | null = order.length === 2 ? (["t", "p", "q"] as Field[]).find((f) => !order.includes(f)) ?? null : null;
  const solved = useMemo(() => {
    const n = (f: Field) => (order.includes(f) ? parsePositive(v[f]) : null);
    return solveFillup({ total: n("t"), price: n("p"), qty: n("q") });
  }, [order, v]);
  const text = (f: Field): string => {
    if (f === derived && !("error" in solved)) {
      const x = f === "t" ? solved.total : f === "p" ? solved.price : solved.qty;
      return x == null ? "" : show(x, f === "p" ? 3 : 2);
    }
    return v[f];
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if ("error" in solved) return setError(solved.error);
    setSaving(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user.id;
      if (!uid) throw new Error("Sign in again to save.");
      const row = {
        fill_date: date || todayISO(), unit, quantity: solved.qty, price_per_unit: solved.price, amount: solved.total, currency,
        amount_usd: round2(convert(solved.total, currency, "USD") ?? 0), station: station.trim() || null,
      };
      const waiting = id ? (await browserOutbox.list().catch(() => [])).find((i) => i.id === id) ?? null : null;
      await saveRow({ api: makeRowApi(supabase), store: browserOutbox, userId: uid, table: "fuel_fillups", row, id, waiting, label: station.trim() || "Fuel fill-up", summary: id ? "Fuel · change" : "Fuel · new" });
      router.push("/personal/fuel");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!id || !(await confirm({ title: "Delete this fill-up?", message: `${date}${solved && !("error" in solved) ? `, ${currency} ${solved.total.toFixed(2)}` : ""}`, destructive: true }))) return;
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sign in again to delete.");
      await deleteRow({ api: makeRowApi(supabase), store: browserOutbox, userId: session.user.id, table: "fuel_fillups", id, paths: [], waiting: (await browserOutbox.list().catch(() => [])).find((i) => i.id === id) ?? null, label: station.trim() || "Fuel fill-up", summary: "Fuel · delete" });
      router.push("/personal/fuel");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not delete."); }
  };

  const lab = "mb-1.5 flex items-center gap-2 text-[13px] font-semibold text-foreground/80";
  const worked = <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11.5px] font-extrabold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" data-testid="fuel-worked-out">worked out</span>;
  const box = (f: Field, label: string, suffix: string, testid: string, hint?: string) => (
    <div>
      <label htmlFor={`fuel-${testid}`} className={lab}>{label}{derived === f && text(f) !== "" && worked}</label>
      <div className="relative">
        <Input id={`fuel-${testid}`} data-testid={`fuel-${testid}`} inputMode="decimal" autoComplete="off" value={text(f)} placeholder={hint} onChange={(e) => type(f, e.target.value)} className={`h-[52px] pr-16 text-[17px] ${derived === f ? "bg-muted font-extrabold" : ""}`} />
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">{suffix}</span>
      </div>
    </div>
  );
  const u = unitShort(unit);
  return (
    <div className="mx-auto max-w-lg space-y-4 p-4 pb-28 md:p-8">
      <BackLink href="/personal/fuel">Fuel</BackLink>
      <PageHeader title={id ? "Change fill-up" : "Add fill-up"} />
      {setup && <Alert>Run supabase/migration_fuel.sql in Supabase first.</Alert>}
      {error && <Alert>{error}</Alert>}
      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <form onSubmit={submit} className="space-y-4" data-testid="fuel-form">
          <div className="flex rounded-[13px] bg-muted p-[3px]" role="group" aria-label="Unit">
            <button type="button" className={seg(unit === "L")} aria-pressed={unit === "L"} onClick={() => chooseUnit("L")} data-testid="fuel-unit-l">Litres</button>
            <button type="button" className={seg(unit === "gal")} aria-pressed={unit === "gal"} onClick={() => chooseUnit("gal")} data-testid="fuel-unit-gal">Gallons</button>
          </div>
          <div className="space-y-3 rounded-2xl border bg-card p-4">
            <div className="flex rounded-[13px] bg-muted p-[3px]" role="group" aria-label="Currency">
              {(["AWG", "USD"] as const).map((c) => <button key={c} type="button" className={seg(currency === c)} aria-pressed={currency === c} onClick={() => setCurrency(c)} data-testid={`fuel-cur-${c}`}>{c}</button>)}
            </div>
            {box("t", "Total paid", currency, "total", "0.00")}
            {box("p", `Price per ${unitName(unit)}`, currency, "price", "Optional")}
            {box("q", unit === "gal" ? "Gallons" : "Litres", u, "qty", "Optional")}
            <p className="text-[12.5px] leading-snug text-muted-foreground">Fill in any two. The third is worked out. You can also enter only the total.</p>
          </div>
          <div className="space-y-3 rounded-2xl border bg-card p-4">
            <div>
              <label htmlFor="fuel-date" className={lab}>Date</label>
              <Input id="fuel-date" data-testid="fuel-date" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} className="h-[52px] text-[17px]" />
            </div>
            <div>
              <label htmlFor="fuel-station" className={lab}>Station (optional)</label>
              <Input id="fuel-station" data-testid="fuel-station" value={station} maxLength={120} onChange={(e) => setStation(e.target.value)} className="h-[52px] text-[17px]" />
            </div>
          </div>
          <Button type="submit" className="h-[52px] w-full text-[15px] font-bold" disabled={saving} data-testid="fuel-save">{saving ? "Saving…" : "Save fill-up"}</Button>
          {id && <Button type="button" variant="outline" className="h-12 w-full text-red-700" onClick={remove} data-testid="fuel-delete">Delete this fill-up</Button>}
        </form>
      )}
    </div>
  );
}
