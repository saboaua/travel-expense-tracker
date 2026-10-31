import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, FileSpreadsheet, Archive } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function TripReportPage({
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

  if (!trip) {
    notFound();
  }

  const { data: expenses } = await supabase
    .from("expenses")
    .select("*")
    .eq("trip_id", id)
    .order("expense_date", { ascending: true });

  const total =
    expenses?.reduce((sum, e) => sum + Number(e.amount), 0) || 0;

  // Category breakdown
  const byCategory: Record<string, number> = {};
  expenses?.forEach((e) => {
    const cat = e.category || "Other";
    byCategory[cat] = (byCategory[cat] || 0) + Number(e.amount);
  });

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <Link
        href={`/trips/${id}`}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to trip
      </Link>

      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Trip Report</h1>
        <p className="text-muted-foreground mt-1">{trip.name}</p>
      </div>

      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
          <CardDescription>
            {formatDate(trip.start_date)}
            {trip.end_date && ` – ${formatDate(trip.end_date)}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between items-baseline">
            <span className="text-muted-foreground">Total Expenses</span>
            <span className="text-2xl font-bold">
              {formatCurrency(total, trip.currency)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Number of receipts</span>
            <span>{expenses?.length || 0}</span>
          </div>

          {Object.keys(byCategory).length > 0 && (
            <div className="pt-4 border-t space-y-2">
              <p className="text-sm font-medium">Breakdown by category</p>
              {Object.entries(byCategory)
                .sort(([, a], [, b]) => b - a)
                .map(([cat, amount]) => (
                  <div key={cat} className="flex justify-between text-sm">
                    <span>{cat}</span>
                    <span className="font-medium">
                      {formatCurrency(amount, trip.currency)}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Expense table preview */}
      <Card>
        <CardHeader>
          <CardTitle>Expenses</CardTitle>
        </CardHeader>
        <CardContent>
          {!expenses || expenses.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">No expenses</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4">Date</th>
                    <th className="pb-2 pr-4">Merchant</th>
                    <th className="pb-2 pr-4">Category</th>
                    <th className="pb-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((e) => (
                    <tr key={e.id} className="border-b last:border-0">
                      <td className="py-2.5 pr-4">{formatDate(e.expense_date)}</td>
                      <td className="py-2.5 pr-4">{e.merchant || "—"}</td>
                      <td className="py-2.5 pr-4">{e.category || "—"}</td>
                      <td className="py-2.5 text-right font-medium">
                        {formatCurrency(Number(e.amount), trip.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Download actions */}
      <Card>
        <CardHeader>
          <CardTitle>Download for Accounting</CardTitle>
          <CardDescription>
            Export this trip for your accounting folder
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-3">
          <Button className="gap-2 flex-1" disabled>
            <FileSpreadsheet className="h-4 w-4" />
            Download Excel
            <span className="text-xs opacity-70">(coming soon)</span>
          </Button>
          <Button variant="outline" className="gap-2 flex-1" disabled>
            <Archive className="h-4 w-4" />
            Download ZIP (Excel + Receipts)
            <span className="text-xs opacity-70">(coming soon)</span>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}