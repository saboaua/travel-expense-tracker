import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plus, Download, Camera, Archive, Pencil, MapPin, Tag } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ExpenseList } from "@/components/expenses/expense-list";
import { TripStatusToggle } from "@/components/trips/trip-status-toggle";

export default async function TripDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: trip } = await supabase
    .from("trips")
    .select("*")
    .eq("id", id)
    .eq("user_id", user?.id)
    .single();

  if (!trip) notFound();

  const { data: expenses } = await supabase
    .from("expenses")
    .select("*")
    .eq("trip_id", id)
    .order("expense_date", { ascending: false });

  const list = expenses || [];

  // Full converted total in USD (uses frozen amount_usd when present)
  const usdTotal = list.reduce((sum, e) => {
    const usd =
      e.amount_usd != null
        ? Number(e.amount_usd)
        : e.currency === "USD" || !e.currency
          ? Number(e.amount)
          : 0;
    return sum + usd;
  }, 0);

  // Original-currency totals for non-USD expenses
  const otherByCurrency: Record<string, number> = {};
  list.forEach((e) => {
    const code = (e.currency || trip.currency || "USD").toUpperCase();
    if (code !== "USD") {
      otherByCurrency[code] = (otherByCurrency[code] || 0) + Number(e.amount);
    }
  });

  const otherCurrencies = Object.entries(otherByCurrency);
  // Prefer the largest other-currency total for the second card
  const primaryOther = otherCurrencies.length
    ? otherCurrencies.reduce((best, cur) => (cur[1] > best[1] ? cur : best))
    : null;

  return (
    <div className="p-4 md:p-8 pb-24 max-w-4xl mx-auto space-y-6">
      <Link href="/trips" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Back to trips
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl md:text-3xl font-bold">{trip.name}</h1>
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              trip.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
            }`}>
              {trip.status}
            </span>
          </div>
          {trip.destination && (
            <p className="text-muted-foreground flex items-center gap-1 mb-0.5">
              <MapPin className="h-4 w-4" />
              {trip.destination}
            </p>
          )}
          {trip.category && (
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <Tag className="h-3.5 w-3.5" />
              {trip.category}
            </p>
          )}
          <p className="text-muted-foreground mt-1">
            {formatDate(trip.start_date)}
            {trip.end_date && ` \u2013 ${formatDate(trip.end_date)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/trips/${id}/edit`}>
            <Button variant="outline" className="gap-2"><Pencil className="h-4 w-4" /> Edit</Button>
          </Link>
          <a href={`/api/export/trip/${id}/excel`}>
            <Button variant="outline" className="gap-2"><Download className="h-4 w-4" /> Excel</Button>
          </a>
          <a href={`/api/export/trip/${id}/zip`}>
            <Button variant="outline" className="gap-2"><Archive className="h-4 w-4" /> ZIP</Button>
          </a>
          <Link href={`/trips/${id}/add-expense`}>
            <Button className="gap-2"><Camera className="h-4 w-4" /> Add Expense</Button>
          </Link>
        </div>
      </div>

      <TripStatusToggle tripId={id} status={trip.status} />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <p className="text-sm text-muted-foreground">Total in USD</p>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(usdTotal, "USD")}</p>
          </CardContent>
        </Card>

        {primaryOther ? (
          <Card>
            <CardHeader className="pb-2">
              <p className="text-sm text-muted-foreground">
                {otherCurrencies.length > 1 ? "Other currencies" : `In ${primaryOther[0]}`}
              </p>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {formatCurrency(primaryOther[1], primaryOther[0])}
              </p>
              {otherCurrencies.length > 1 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {otherCurrencies.map(([c, a]) => `${c} ${formatCurrency(a, c)}`).join(" \u00b7 ")}
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-2">
              <p className="text-sm text-muted-foreground">In {trip.currency || "USD"}</p>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {formatCurrency(
                  list.reduce((s, e) => s + Number(e.amount), 0),
                  trip.currency || "USD"
                )}
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <p className="text-sm text-muted-foreground">Expenses</p>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{list.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Expenses</CardTitle>
          <Link href={`/trips/${id}/add-expense`}>
            <Button size="sm" className="gap-2"><Plus className="h-4 w-4" /> Add</Button>
          </Link>
        </CardHeader>
        <CardContent>
          <ExpenseList expenses={list} currency={trip.currency} tripId={id} />
        </CardContent>
      </Card>
    </div>
  );
}
