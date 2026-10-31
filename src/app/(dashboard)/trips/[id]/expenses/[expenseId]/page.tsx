"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Trash2 } from "lucide-react";
import { CURRENCIES, toUsd } from "@/lib/currencies";
import { formatCurrency } from "@/lib/utils";

const CATEGORIES = [
  "Meals",
  "Transport",
  "Lodging",
  "Fuel",
  "Office Supplies",
  "Entertainment",
  "Other",
];

export default function EditExpensePage() {
  const params = useParams();
  const tripId = params.id as string;
  const expenseId = params.expenseId as string;
  const router = useRouter();
  const supabase = createClient();

  const [loaded, setLoaded] = useState(false);
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [rate, setRate] = useState("1");
  const [category, setCategory] = useState("Other");
  const [expenseDate, setExpenseDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("expenses")
      .select("*")
      .eq("id", expenseId)
      .eq("trip_id", tripId)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          setError(error?.message || "Expense not found");
          setLoaded(true);
          return;
        }
        setMerchant(data.merchant || "");
        setAmount(String(data.amount ?? ""));
        setCurrency(data.currency || "USD");
        setRate(data.exchange_rate != null ? String(data.exchange_rate) : "1");
        setCategory(data.category || "Other");
        setExpenseDate(data.expense_date || "");
        setNotes(data.notes || "");
        setLoaded(true);
      });
  }, [supabase, expenseId, tripId]);

  const usd =
    amount && !Number.isNaN(Number(amount)) && !Number.isNaN(Number(rate))
      ? toUsd(Number(amount), Number(rate))
      : null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const rateNum = Number(rate) || (currency === "USD" ? 1 : 0);
    const amountNum = parseFloat(amount);
    const { error } = await supabase
      .from("expenses")
      .update({
        merchant: merchant || null,
        amount: amountNum,
        currency,
        exchange_rate: rateNum,
        amount_usd: toUsd(amountNum, rateNum),
        category,
        expense_date: expenseDate,
        notes: notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", expenseId);

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }
    router.push(`/trips/${tripId}`);
    router.refresh();
  };

  const remove = async () => {
    if (!window.confirm("Delete this expense? This cannot be undone.")) return;
    setSaving(true);
    const { error } = await supabase.from("expenses").delete().eq("id", expenseId);
    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }
    router.push(`/trips/${tripId}`);
    router.refresh();
  };

  return (
    <div className="p-4 md:p-8 max-w-lg mx-auto">
      <Link
        href={`/trips/${tripId}`}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to trip
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Edit Expense</CardTitle>
          <CardDescription>Change the details or delete this entry</CardDescription>
        </CardHeader>
        <CardContent>
          {!loaded ? (
            <p className="text-sm text-muted-foreground">Loading\u2026</p>
          ) : (
            <form onSubmit={save} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Merchant</label>
                <Input value={merchant} onChange={(e) => setMerchant(e.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Amount *</label>
                  <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Currency</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>{c.code}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Rate to USD</label>
                <Input type="number" step="0.000001" min="0" value={rate} onChange={(e) => setRate(e.target.value)} />
                <p className="text-xs text-muted-foreground">
                  1 {currency} = {rate || "0"} USD
                  {usd != null && ` \u00b7 ${formatCurrency(usd, "USD")}`}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Date *</label>
                  <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Notes</label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>

              {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</p>}

              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? "Saving\u2026" : "Save changes"}
              </Button>
              <Button type="button" variant="outline" className="w-full gap-2 text-red-600" disabled={saving} onClick={remove}>
                <Trash2 className="h-4 w-4" />
                Delete expense
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
