"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Pencil, Receipt, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

interface Expense {
  id: string;
  merchant: string | null;
  amount: number;
  currency?: string | null;
  exchange_rate?: number | null;
  amount_usd?: number | null;
  category: string | null;
  expense_date: string;
  notes: string | null;
  receipt_path: string | null;
}

interface ExpenseListProps {
  expenses: Expense[];
  currency: string;
  tripId: string;
}

export function ExpenseList({ expenses, currency, tripId }: ExpenseListProps) {
  const router = useRouter();
  const supabase = createClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const remove = async (expense: Expense) => {
    const label = expense.merchant || "this expense";
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    setBusyId(expense.id);
    const { error } = await supabase.from("expenses").delete().eq("id", expense.id);
    if (error) {
      window.alert(error.message);
      setBusyId(null);
      return;
    }
    router.refresh();
    setBusyId(null);
  };

  if (expenses.length === 0) {
    return (
      <div className="text-center py-12">
        <Receipt className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground">No expenses yet</p>
        <p className="text-sm text-muted-foreground mt-1">
          Take a photo of a receipt to get started
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {expenses.map((expense) => {
        const code = expense.currency || currency || "USD";
        const usd = expense.amount_usd != null ? Number(expense.amount_usd) : null;
        return (
          <div key={expense.id} className="flex items-center gap-2 p-3 rounded-lg border">
            <Link
              href={`/trips/${tripId}/expenses/${expense.id}`}
              className="flex flex-1 items-center justify-between min-w-0 gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Receipt className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium truncate">
                    {expense.merchant || "Unknown merchant"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(expense.expense_date)}
                    {expense.category && ` \u00b7 ${expense.category}`}
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="font-semibold">
                  {formatCurrency(Number(expense.amount), code)}
                </p>
                {usd != null && code !== "USD" && (
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(usd, "USD")}
                  </p>
                )}
              </div>
            </Link>
            <div className="flex flex-col sm:flex-row shrink-0">
              <Link
                href={`/trips/${tripId}/expenses/${expense.id}`}
                className="p-2 text-muted-foreground hover:text-foreground"
                aria-label="Edit"
              >
                <Pencil className="h-4 w-4" />
              </Link>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-red-600 hover:text-red-600"
                disabled={busyId === expense.id}
                aria-label="Delete"
                onClick={() => remove(expense)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
