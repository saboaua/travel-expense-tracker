import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Download, Calendar, Archive } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export default async function ReportsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

  const { data: trips } = await supabase
    .from("trips")
    .select("*, expenses(amount, category, expense_date)")
    .eq("user_id", user?.id)
    .gte("start_date", `${currentYear}-01-01`)
    .lte("start_date", `${currentYear}-12-31`)
    .order("start_date", { ascending: false });

  const yearlyTotal =
    trips?.reduce((sum, trip) => {
      const tripTotal =
        trip.expenses?.reduce(
          (s: number, e: { amount: number }) => s + Number(e.amount),
          0
        ) || 0;
      return sum + tripTotal;
    }, 0) || 0;

  // Monthly totals
  const monthlyTotals: Record<string, number> = {};
  trips?.forEach((trip) => {
    trip.expenses?.forEach(
      (e: { amount: number; expense_date: string }) => {
        const m = e.expense_date?.slice(0, 7);
        if (m) monthlyTotals[m] = (monthlyTotals[m] || 0) + Number(e.amount);
      }
    );
  });

  const thisMonthTotal = monthlyTotals[currentMonth] || 0;

  const categoryTotals: Record<string, number> = {};
  trips?.forEach((trip) => {
    trip.expenses?.forEach((e: { amount: number; category: string | null }) => {
      const cat = e.category || "Other";
      categoryTotals[cat] = (categoryTotals[cat] || 0) + Number(e.amount);
    });
  });

  const sortedMonths = Object.keys(monthlyTotals).sort().reverse();

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Reports</h1>
        <p className="text-muted-foreground mt-1">
          Yearly, monthly, and per-trip expense reports for accounting
        </p>
      </div>

      {/* Yearly */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                {currentYear} Yearly Summary
              </CardTitle>
              <CardDescription>All business travel this year</CardDescription>
            </div>
            <a href={`/api/export/year/${currentYear}/excel`}>
              <Button variant="outline" className="gap-2">
                <Download className="h-4 w-4" />
                Export Excel
              </Button>
            </a>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Year total</p>
              <p className="text-3xl font-bold">{formatCurrency(yearlyTotal)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">This month</p>
              <p className="text-3xl font-bold">{formatCurrency(thisMonthTotal)}</p>
            </div>
          </div>

          {Object.keys(categoryTotals).length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">By category</p>
              {Object.entries(categoryTotals)
                .sort(([, a], [, b]) => b - a)
                .map(([cat, total]) => (
                  <div
                    key={cat}
                    className="flex justify-between text-sm py-1 border-b last:border-0"
                  >
                    <span>{cat}</span>
                    <span className="font-medium">{formatCurrency(total)}</span>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Monthly breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly breakdown ({currentYear})</CardTitle>
          <CardDescription>Totals by expense date month</CardDescription>
        </CardHeader>
        <CardContent>
          {sortedMonths.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">
              No expenses this year yet
            </p>
          ) : (
            <div className="space-y-2">
              {sortedMonths.map((m) => (
                <div
                  key={m}
                  className="flex justify-between text-sm py-2 border-b last:border-0"
                >
                  <span className="font-medium">{m}</span>
                  <span>{formatCurrency(monthlyTotals[m])}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-trip */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Trip reports
          </CardTitle>
          <CardDescription>
            Download Excel or ZIP (Excel + receipt images) per trip
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!trips || trips.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No trips this year yet
            </p>
          ) : (
            <div className="space-y-3">
              {trips.map((trip) => {
                const total =
                  trip.expenses?.reduce(
                    (s: number, e: { amount: number }) => s + Number(e.amount),
                    0
                  ) || 0;

                return (
                  <div
                    key={trip.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border"
                  >
                    <div>
                      <p className="font-medium">{trip.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {trip.expenses?.length || 0} expenses ·{" "}
                        {formatCurrency(total, trip.currency)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <a href={`/api/export/trip/${trip.id}/excel`}>
                        <Button variant="outline" size="sm" className="gap-2">
                          <Download className="h-4 w-4" />
                          Excel
                        </Button>
                      </a>
                      <a href={`/api/export/trip/${trip.id}/zip`}>
                        <Button variant="outline" size="sm" className="gap-2">
                          <Archive className="h-4 w-4" />
                          ZIP
                        </Button>
                      </a>
                      <Link href={`/trips/${trip.id}`}>
                        <Button variant="ghost" size="sm">
                          Open
                        </Button>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
