import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plus, Download, Camera } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ExpenseList } from "@/components/expenses/expense-list";

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

  if (!trip) {
    notFound();
  }

  const { data: expenses } = await supabase
    .from("expenses")
    .select("*")
    .eq("trip_id", id)
    .order("expense_date", { ascending: false });

  const total =
    expenses?.reduce((sum, e) => sum + Number(e.amount), 0) || 0;

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <Link
        href="/trips"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to trips
      </Link>

      {/* Trip Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl md:text-3xl font-bold">{trip.name}</h1>
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                trip.status === "active"
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {trip.status}
            </span>
          </div>
          <p className="text-muted-foreground">
            {formatDate(trip.start_date)}
            {trip.end_date && ` – ${formatDate(trip.end_date)}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/trips/${id}/report`}>
            <Button variant="outline" className="gap-2">
              <Download className="h-4 w-4" />
              Report
            </Button>
          </Link>
          <Link href={`/trips/${id}/add-expense`}>
            <Button className="gap-2">
              <Camera className="h-4 w-4" />
              Add Expense
            </Button>
          </Link>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <p className="text-sm text-muted-foreground">Total Spent</p>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatCurrency(total, trip.currency)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <p className="text-sm text-muted-foreground">Expenses</p>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{expenses?.length || 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Expenses List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Expenses</CardTitle>
          <Link href={`/trips/${id}/add-expense`}>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          <ExpenseList expenses={expenses || []} currency={trip.currency} tripId={id} />
        </CardContent>
      </Card>
    </div>
  );
}