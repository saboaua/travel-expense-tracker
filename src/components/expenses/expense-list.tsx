"use client";

import { formatCurrency, formatDate } from "@/lib/utils";
import { Receipt } from "lucide-react";

interface Expense {
  id: string;
  merchant: string | null;
  amount: number;
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

export function ExpenseList({ expenses, currency }: ExpenseListProps) {
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
      {expenses.map((expense) => (
        <div
          key={expense.id}
          className="flex items-center justify-between p-4 rounded-lg border"
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
                {expense.category && ` · ${expense.category}`}
              </p>
            </div>
          </div>
          <p className="font-semibold shrink-0 ml-4">
            {formatCurrency(Number(expense.amount), currency)}
          </p>
        </div>
      ))}
    </div>
  );
}