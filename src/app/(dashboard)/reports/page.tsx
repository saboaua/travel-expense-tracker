import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Download, Calendar } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export default async function ReportsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const currentYear = new Date().getFullYear();

  // Fetch trips for current year
  const { data: trips } = await supabase
    .from("trips")
    .select("*, expenses(amount, category)")
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

  // Category breakdown
  const categoryTotals: Record<string, number> = {};
  trips?.forEach((trip) => {
    trip.expenses?.forEach((e: { amount: number; category: string | null }) => {
      const cat = e.category || "Other";
      categoryTotals[cat] = (categoryTotals[cat] || 0) + Number(e.amount);
    });
  });

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Reports</h1>
        <p className="text-muted-foreground mt-1">
          Generate expense reports for accounting
        </p>
      </div>

      {/* Yearly Summary */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                {currentYear} Yearly Summary
              </CardTitle>
              <CardDescription>
                All business travel expenses this year
              </CardDescription>
            </div>
            <Button variant="outline" className="gap-2" disabled>
              <Download className="h-4 w-4" />
              Export (soon)
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold">{formatCurrency(yearlyTotal)}</span>
            <span className="text-muted-foreground">total</span>
          </div>

          {Object.keys(categoryTotals).length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">By Category</p>
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

      {/* Per-trip reports */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Trip Reports
          </CardTitle>
          <CardDescription>
            Download individual trip reports with receipts
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
                    className="flex items-center justify-between p-4 rounded-lg border"
                  >
                    <div>
                      <p className="font-medium">{trip.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {trip.expenses?.length || 0} expenses ·{" "}
                        {formatCurrency(total, trip.currency)}
                      </p>
                    </div>
                    <Link href={`/trips/${trip.id}/report`}>
                      <Button variant="outline" size="sm" className="gap-2">
                        <Download className="h-4 w-4" />
                        Report
                      </Button>
                    </Link>
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