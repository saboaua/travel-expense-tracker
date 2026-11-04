import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { MonthlyDownload } from "@/components/MonthlyDownload";
import { MonthlyBars } from "@/components/reports/MonthlyBars";
import { CategoryDonut } from "@/components/reports/CategoryDonut";
import { TripReportList, type TripReportRow } from "@/components/reports/TripReportList";
import { Bars } from "@/components/personal/Bars";
import { fetchAll } from "@/lib/personal/fetch-all";
import { MONTH_LONG, summarize, type ExpenseRow } from "@/lib/reports";
import { formatCurrency, todayISO } from "@/lib/utils";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarRange, Download, FileSpreadsheet, Plane, Receipt, TrendingUp, Wallet } from "lucide-react";

type Trip = { id: string; name: string; destination: string | null; start_date: string; end_date: string | null; status: string };

function Delta({ pct, suffix }: { pct: number | null; suffix: string }) {
  if (pct == null) return <span className="text-xs text-muted-foreground">{suffix}</span>;
  const up = pct > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium ${pct === 0 ? "bg-muted text-muted-foreground" : up ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
        {pct !== 0 && <Icon className="h-3 w-3" />}
        {pct > 0 ? "+" : ""}
        {pct}%
      </span>
      <span className="text-muted-foreground">{suffix}</span>
    </span>
  );
}

function Tile({ icon: Icon, label, value, children }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
      <p className="flex items-center gap-2 text-sm text-muted-foreground"><Icon className="h-4 w-4" />{label}</p>
      <p className="mt-2 truncate text-2xl font-bold tracking-tight sm:text-3xl">{value}</p>
      <div className="mt-1 min-h-[1.25rem]">{children}</div>
    </div>
  );
}

function Section({ title, subtitle, children, className = "" }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border bg-card p-5 shadow-sm ${className}`}>
      <div className="mb-4">
        <h2 className="text-base font-semibold">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const sp = await searchParams;
  const today = todayISO(); // Aruba date: avoids the UTC date flipping to tomorrow in the evening
  const currentYear = Number(today.slice(0, 4));
  const requested = parseInt(sp.year || "", 10);
  const year = Number.isFinite(requested) ? Math.min(Math.max(requested, 2000), currentYear + 1) : currentYear;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [expenses, tripsRes] = await Promise.all([
    fetchAll<ExpenseRow>((a, b) =>
      supabase
        .from("expenses")
        .select("amount, amount_usd, currency, category, expense_date, merchant, trip_id")
        .eq("user_id", user?.id)
        .gte("expense_date", `${year - 1}-01-01`)
        .lte("expense_date", `${year}-12-31`)
        .order("expense_date", { ascending: false })
        .order("id")
        .range(a, b)
    ).catch(() => [] as ExpenseRow[]),
    supabase.from("trips").select("id, name, destination, start_date, end_date, status").eq("user_id", user?.id).order("start_date", { ascending: false }),
  ]);

  const allTrips = (tripsRes.data || []) as Trip[];
  const s = summarize(expenses, year, today.slice(0, 7));

  // Trips that overlap the year or have expenses in it
  const yStart = `${year}-01-01`;
  const yEnd = `${year}-12-31`;
  const tripRows: TripReportRow[] = allTrips
    .filter((t) => (t.start_date <= yEnd && (t.end_date || t.start_date) >= yStart) || s.tripTotals[t.id])
    .map((t) => ({ ...t, total: s.tripTotals[t.id]?.total || 0, count: s.tripTotals[t.id]?.count || 0 }));

  const years = Array.from(new Set([currentYear, year, ...allTrips.map((t) => Number(t.start_date.slice(0, 4)))])).sort((a, b) => b - a).slice(0, 6);
  const fmt = (n: number) => formatCurrency(n, "USD");
  const isCurrent = year === currentYear;
  const activeMonths = s.monthly.filter((v) => v > 0).length;
  const empty = s.expenseCount === 0 && tripRows.length === 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 pb-28 md:p-8">
      <div className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">Business travel spending in USD, using the rate saved with each expense</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <nav className="flex items-center gap-1 rounded-full border bg-card p-1" aria-label="Report year">
            {years.map((y) => (
              <Link
                key={y}
                href={y === currentYear ? "/reports" : `/reports?year=${y}`}
                aria-current={y === year ? "page" : undefined}
                className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${y === year ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
              >
                {y}
              </Link>
            ))}
          </nav>
          <a href={`/api/export/year/${year}/excel`} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90">
            <Download className="h-4 w-4" /> Export {year}
          </a>
        </div>
      </div>

      {s.missingUsd > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {s.missingUsd} expense{s.missingUsd !== 1 ? "s were" : " was"} saved in another currency without a USD value, so {s.missingUsd !== 1 ? "they are" : "it is"} not counted in these totals. Open the trip and add the exchange rate to include {s.missingUsd !== 1 ? "them" : "it"}.
          </p>
        </div>
      )}

      {empty ? (
        <div className="rounded-xl border bg-card py-20 text-center shadow-sm">
          <Receipt className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <p className="font-medium">No expenses in {year}</p>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">Add a trip and scan a receipt to see your reports here.</p>
          <Link href="/trips/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">New trip</Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
            <Tile icon={Wallet} label={`${year} total`} value={fmt(s.total)}>
              <Delta pct={s.yearChangePct} suffix={s.prevYearTotal > 0 ? `vs ${year - 1}` : `no ${year - 1} data`} />
            </Tile>
            <Tile icon={CalendarRange} label={isCurrent ? "This month" : "Peak month"} value={fmt(s.focusMonthTotal)}>
              {isCurrent ? <Delta pct={s.focusMonthChangePct} suffix="vs last month" /> : <span className="text-xs text-muted-foreground">{MONTH_LONG[s.focusMonthIndex]}</span>}
            </Tile>
            <Tile icon={Plane} label="Trips" value={String(tripRows.length)}>
              <span className="text-xs text-muted-foreground">{s.expenseCount} expense{s.expenseCount !== 1 ? "s" : ""}</span>
            </Tile>
            <Tile icon={TrendingUp} label="Average per month" value={fmt(s.avgPerActiveMonth)}>
              <span className="text-xs text-muted-foreground">{activeMonths} active month{activeMonths !== 1 ? "s" : ""}</span>
            </Tile>
          </div>

          <Section title="Monthly spending" subtitle={`${year}, by expense date. Highlighted: ${MONTH_LONG[s.focusMonthIndex]}`}>
            <MonthlyBars values={s.monthly} focusIndex={s.focusMonthIndex} fmt={fmt} futureFrom={isCurrent ? Number(today.slice(5, 7)) : undefined} />
          </Section>

          <div className="grid gap-4 lg:grid-cols-5">
            <Section title="Spending by category" subtitle={`Share of ${year} total`} className="lg:col-span-3">
              <CategoryDonut slices={s.categories} total={s.total} fmt={fmt} />
            </Section>
            <Section title="Top merchants" subtitle={`Where the most money went in ${year}`} className="lg:col-span-2">
              {s.merchants.length === 0 ? <p className="text-sm text-muted-foreground">No merchant names recorded yet.</p> : <Bars rows={s.merchants.map((m) => ({ label: `${m.name}${m.count > 1 ? ` (${m.count}x)` : ""}`, value: m.total }))} format={fmt} />}
            </Section>
          </div>
        </>
      )}

      <Section title="Export a month" subtitle="One Excel with every expense in that month: same columns as a trip report, plus trip name and destination">
        <div className="flex items-start gap-4">
          <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:flex"><FileSpreadsheet className="h-5 w-5" /></span>
          <MonthlyDownload defaultMonth={today.slice(0, 7)} />
        </div>
      </Section>

      <Section title="Trip reports" subtitle={`Trips in ${year}. Download Excel, or a ZIP with the Excel and receipt images`}>
        <TripReportList trips={tripRows} year={year} />
      </Section>
    </div>
  );
}
