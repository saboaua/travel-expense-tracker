import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ArrowLeft, Archive, Camera, CalendarDays, Clock, Download, MapPin, Pencil, Plus, Tag } from "lucide-react";
import { daysBetween, formatCurrency, formatDate, formatDateRange, todayISO } from "@/lib/utils";
import { getDestinationInfo } from "@/lib/destination";
import { categorySlices } from "@/lib/reports";
import { ExpenseList } from "@/components/expenses/expense-list";
import { TripStatusToggle } from "@/components/trips/trip-status-toggle";
import { CategoryDonut } from "@/components/reports/CategoryDonut";
import { DocumentsManager } from "@/components/documents/DocumentsManager";
import { currentPassport, tripPassportCheck } from "@/lib/documents";

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1.5 truncate text-2xl font-bold tracking-tight sm:text-3xl">{value}</p>
      <p className="mt-1 min-h-[1rem] truncate text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

const actionBtn = "inline-flex h-10 items-center justify-center gap-2 rounded-lg border bg-background px-3 text-sm font-medium transition-colors hover:bg-accent";

export default async function TripDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ docs_failed?: string }> }) {
  const { id } = await params;
  const { docs_failed } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: trip } = await supabase.from("trips").select("*").eq("id", id).eq("user_id", user?.id).single();
  if (!trip) notFound();

  const { data: expenses } = await supabase.from("expenses").select("*").eq("trip_id", id).order("expense_date", { ascending: false });
  const list = expenses || [];

  const { data: passportDocs } = await supabase.from("travel_documents").select("kind, expiry_date").eq("user_id", user?.id).eq("kind", "passport");
  const passport = currentPassport(passportDocs || []);
  const passportCheck = passport?.expiry_date ? tripPassportCheck(passport.expiry_date, trip.end_date || trip.start_date) : null;

  const today = todayISO();
  const endDate: string = trip.end_date || trip.start_date;
  const completed = trip.status === "completed";
  const upcoming = trip.start_date > today;
  const passed = endDate < today;

  // Full converted total in USD (uses the frozen amount_usd when present)
  const usdOf = (e: (typeof list)[number]) =>
    e.amount_usd != null ? Number(e.amount_usd) : e.currency === "USD" || !e.currency ? Number(e.amount) : null;
  const usdTotal = list.reduce((sum, e) => sum + (usdOf(e) ?? 0), 0);

  // Original-currency totals for non-USD expenses
  const otherByCurrency: Record<string, number> = {};
  list.forEach((e) => {
    const code = (e.currency || trip.currency || "USD").toUpperCase();
    if (code !== "USD") otherByCurrency[code] = (otherByCurrency[code] || 0) + Number(e.amount);
  });
  const otherCurrencies = Object.entries(otherByCurrency);
  const primaryOther = otherCurrencies.length ? otherCurrencies.reduce((best, cur) => (cur[1] > best[1] ? cur : best)) : null;

  const withReceipts = list.filter((e) => e.receipt_path).length;
  const biggest = list.reduce<(typeof list)[number] | null>((b, e) => ((usdOf(e) ?? 0) > (b ? usdOf(b) ?? 0 : -1) ? e : b), null);

  // Average per day while travelling (days elapsed, capped at the trip length)
  const elapsedDays = upcoming ? 0 : daysBetween(trip.start_date, passed ? endDate : today) + 1;
  const perDay = elapsedDays > 0 ? usdTotal / elapsedDays : null;

  const cats = new Map<string, number>();
  list.forEach((e) => {
    const v = usdOf(e);
    if (v != null) cats.set(e.category || "Other", (cats.get(e.category || "Other") || 0) + v);
  });
  const slices = categorySlices(cats, usdTotal);

  const info = await getDestinationInfo(trip.destination);

  // Badge on the photo
  let badge: { label: string; cls: string };
  if (completed) badge = { label: "Completed", cls: "bg-slate-600 text-white" };
  else if (upcoming) {
    const d = daysBetween(today, trip.start_date);
    badge = { label: `Upcoming \u00b7 ${d} day${d !== 1 ? "s" : ""} left`, cls: "bg-emerald-500 text-white" };
  } else if (!passed) {
    const total = daysBetween(trip.start_date, endDate) + 1;
    badge = { label: `In progress \u00b7 Day ${elapsedDays} of ${total}`, cls: "bg-blue-500 text-white" };
  } else badge = { label: "Passed \u00b7 still active", cls: "bg-amber-500 text-white" };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 pb-28 md:p-8">
      <Link href="/trips" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Back to trips
      </Link>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="relative h-44 bg-gradient-to-br from-slate-800 to-slate-600 md:h-56">
          {info?.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={info.imageUrl} alt={trip.destination || trip.name} className="absolute inset-0 h-full w-full object-cover" referrerPolicy="no-referrer" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/75" />
          <span className={`absolute right-3 top-3 inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold shadow ${badge.cls}`}>
            <Clock className="h-3 w-3" />
            {badge.label}
          </span>
          <div className="absolute inset-x-0 bottom-0 p-4 text-white md:p-5">
            {trip.destination && (
              <p className="flex items-center gap-1 text-sm opacity-90">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{trip.destination}</span>
              </p>
            )}
            <h1 className="mt-0.5 text-2xl font-bold leading-tight md:text-3xl">{trip.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm opacity-90">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                {formatDateRange(trip.start_date, trip.end_date)}
              </span>
              {trip.category && (
                <span className="inline-flex items-center gap-1.5">
                  <Tag className="h-3.5 w-3.5" />
                  {trip.category}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="space-y-3 p-3 md:p-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Link href={`/trips/${id}/add-expense`} className="col-span-2 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 sm:col-span-1">
              <Camera className="h-4 w-4" /> Add expense
            </Link>
            <Link href={`/trips/${id}/edit`} className={actionBtn}>
              <Pencil className="h-4 w-4" /> Edit
            </Link>
            <a href={`/api/export/trip/${id}/excel`} className={actionBtn}>
              <Download className="h-4 w-4" /> Excel
            </a>
            <a href={`/api/export/trip/${id}/zip`} className={actionBtn} title="Excel plus all receipt images">
              <Archive className="h-4 w-4" /> ZIP
            </a>
          </div>
          {trip.notes && <p className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">{trip.notes}</p>}
          {info?.summary && (
            <p className="line-clamp-2 px-1 text-xs text-muted-foreground">
              {info.summary} <span className="opacity-70">(Wikipedia)</span>
            </p>
          )}
        </div>
      </div>

      <TripStatusToggle tripId={id} status={trip.status} ended={passed} endLabel={formatDateRange(endDate)} />

      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <Tile label="Total in USD" value={formatCurrency(usdTotal, "USD")} sub={biggest && list.length > 1 ? `Biggest: ${formatCurrency(usdOf(biggest) ?? 0, "USD")}${biggest.merchant ? ` \u00b7 ${biggest.merchant}` : ""}` : undefined} />
        {primaryOther ? (
          <Tile
            label={otherCurrencies.length > 1 ? "Other currencies" : `In ${primaryOther[0]}`}
            value={formatCurrency(primaryOther[1], primaryOther[0])}
            sub={otherCurrencies.length > 1 ? otherCurrencies.map(([c, a]) => `${c} ${formatCurrency(a, c)}`).join(" \u00b7 ") : undefined}
          />
        ) : (
          <Tile label={`In ${trip.currency || "USD"}`} value={formatCurrency(list.reduce((s, e) => s + Number(e.amount), 0), trip.currency || "USD")} />
        )}
        <Tile label="Expenses" value={String(list.length)} sub={list.length ? `${withReceipts} with receipt photo${withReceipts !== 1 ? "s" : ""}` : "None yet"} />
        <Tile label="Average per day" value={perDay != null ? formatCurrency(perDay, "USD") : "\u2014"} sub={upcoming ? "Starts soon" : `${elapsedDays} day${elapsedDays !== 1 ? "s" : ""}`} />
      </div>

      {slices.length > 0 && (
        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-base font-semibold">Spending by category</h2>
            <p className="text-xs text-muted-foreground">Share of this trip&apos;s total in USD</p>
          </div>
          <CategoryDonut slices={slices} total={usdTotal} fmt={(n) => formatCurrency(n, "USD")} />
        </section>
      )}

      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="mb-3">
          <h2 className="text-base font-semibold">Documents</h2>
          <p className="text-xs text-muted-foreground">Tickets, bookings, visa and insurance for this trip, kept private.</p>
        </div>
        {Number(docs_failed) > 0 && (
          <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            {docs_failed} document{Number(docs_failed) !== 1 ? "s" : ""} could not be uploaded when the trip was created. Add {Number(docs_failed) !== 1 ? "them" : "it"} below.
          </p>
        )}
        {passportCheck && !passportCheck.ok && !completed && (
          <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            Your passport expires {formatDate(passport!.expiry_date as string)}. Most destinations want it valid until {formatDate(passportCheck.mustBeValidUntil)} for this trip.{" "}
            <Link href="/documents" className="font-medium underline">Check my passport</Link>
          </p>
        )}
        <DocumentsManager tripId={id} />
      </section>

      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Expenses</h2>
          <Link href={`/trips/${id}/add-expense`} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
            <Plus className="h-3.5 w-3.5" /> Add
          </Link>
        </div>
        <ExpenseList expenses={list} currency={trip.currency} tripId={id} />
      </section>
    </div>
  );
}
