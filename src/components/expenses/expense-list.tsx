"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, Paperclip, Receipt, Search, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDayHeading, todayISO } from "@/lib/utils";
import { iconFor } from "@/lib/category-icons";
import { useExpenseCategories } from "@/lib/use-categories";

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

type Sort = "newest" | "oldest" | "highest";

const usdOf = (e: Expense, fallbackCurrency: string) => {
  if (e.amount_usd != null) return Number(e.amount_usd);
  const code = e.currency || fallbackCurrency || "USD";
  return code === "USD" ? Number(e.amount) : null;
};

export function ExpenseList({ expenses, currency, tripId }: ExpenseListProps) {
  const router = useRouter();
  const supabase = createClient();
  const categories = useExpenseCategories();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("newest");
  const today = todayISO();

  const iconByCategory = useMemo(() => new Map(categories.map((c) => [c.name, c.icon])), [categories]);
  const present = useMemo(() => [...new Set(expenses.map((e) => e.category || "Other"))], [expenses]);

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
    if (expense.receipt_path) await supabase.storage.from("receipts").remove([expense.receipt_path]).catch(() => {});
    router.refresh();
    setBusyId(null);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = expenses.filter(
      (e) => (!cat || (e.category || "Other") === cat) && (!q || `${e.merchant || ""} ${e.notes || ""} ${e.category || ""}`.toLowerCase().includes(q))
    );
    const byDate = (a: Expense, b: Expense) => a.expense_date.localeCompare(b.expense_date);
    if (sort === "highest") return list.sort((a, b) => (usdOf(b, currency) ?? 0) - (usdOf(a, currency) ?? 0));
    return list.sort((a, b) => (sort === "oldest" ? byDate(a, b) : byDate(b, a)));
  }, [expenses, query, cat, sort, currency]);

  // Group by day (not when sorting by amount)
  const groups = useMemo(() => {
    if (sort === "highest") return [{ date: "", items: filtered }];
    const map = new Map<string, Expense[]>();
    for (const e of filtered) map.set(e.expense_date, [...(map.get(e.expense_date) || []), e]);
    return [...map.entries()].map(([date, items]) => ({ date, items }));
  }, [filtered, sort]);

  if (expenses.length === 0) {
    return (
      <div className="py-12 text-center">
        <Receipt className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
        <p className="font-medium">No expenses yet</p>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">Take a photo of a receipt and we will read it for you</p>
        <Link href={`/trips/${tripId}/add-expense`} className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
          <Camera className="h-4 w-4" /> Add the first expense
        </Link>
      </div>
    );
  }

  const chip = (value: string | null, label: string) => (
    <button
      key={label}
      type="button"
      onClick={() => setCat(value)}
      aria-pressed={cat === value}
      className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${cat === value ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      {(expenses.length > 5 || present.length > 1) && (
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            {expenses.length > 5 && (
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search merchant or notes" aria-label="Search expenses" className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm" />
              </div>
            )}
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort expenses" className="h-9 rounded-md border border-input bg-background px-2 text-xs">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="highest">Highest amount</option>
            </select>
          </div>
          {present.length > 1 && (
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {chip(null, "All")}
              {present.map((p) => chip(p, p))}
            </div>
          )}
        </div>
      )}

      {filtered.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No expenses match.</p>}

      {groups.map((g) => {
        const known = g.items.map((e) => usdOf(e, currency)).filter((v): v is number => v != null);
        const dayTotal = known.reduce((s, v) => s + v, 0);
        return (
          <div key={g.date || "all"} className="space-y-2">
            {g.date && (
              <div className="flex items-center justify-between px-1 pt-1 text-xs font-medium text-muted-foreground">
                <span>{formatDayHeading(g.date, today)}</span>
                {known.length > 0 && <span className="tabular-nums">{formatCurrency(dayTotal, "USD")}</span>}
              </div>
            )}
            {g.items.map((expense) => {
              const code = expense.currency || currency || "USD";
              const usd = expense.amount_usd != null ? Number(expense.amount_usd) : null;
              const Icon = iconFor(iconByCategory.get(expense.category || "Other"), Receipt);
              return (
                <div key={expense.id} className="group flex items-center gap-1 rounded-xl border bg-card transition-colors hover:bg-accent/50">
                  <Link href={`/trips/${tripId}/expenses/${expense.id}`} className="flex min-w-0 flex-1 items-center justify-between gap-3 p-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{expense.merchant || "Unknown merchant"}</p>
                        <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                          {!g.date && <span>{formatDayHeading(expense.expense_date, today)} ·</span>}
                          <span className="truncate">{expense.category || "Other"}</span>
                          {expense.receipt_path && (
                            <span className="inline-flex items-center gap-0.5 text-emerald-600" title="Receipt attached">
                              <Paperclip className="h-3 w-3" aria-hidden="true" />
                              <span className="sr-only">Receipt attached</span>
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold tabular-nums">{formatCurrency(Number(expense.amount), code)}</p>
                      {usd != null && code !== "USD" && <p className="text-xs text-muted-foreground tabular-nums">{formatCurrency(usd, "USD")}</p>}
                    </div>
                  </Link>
                  <button
                    type="button"
                    disabled={busyId === expense.id}
                    aria-label={`Delete ${expense.merchant || "expense"}`}
                    onClick={() => remove(expense)}
                    className="mr-2 shrink-0 rounded-md p-2 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
