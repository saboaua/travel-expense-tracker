"use client";

import { useConfirm } from "@/components/ui/confirm";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";

type Receipt = { id: string; store: string; purchase_date: string; total: number; currency: string; receipt_path: string | null; notes: string | null };
type Item = { id: string; name: string; category: string; quantity: number; unit_price: number; line_total: number; unit: string | null };

export function GroceryReceiptDetail({ id }: { id: string }) {
  const router = useRouter();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const [r, i] = await Promise.all([
        supabase.from("grocery_receipts").select("*").eq("id", id).single(),
        supabase.from("grocery_items").select("id, name, category, quantity, unit_price, unit, line_total").eq("receipt_id", id).order("created_at"),
      ]);
      if (!r.data) return setError(r.error?.message || "Receipt not found");
      setReceipt({ ...r.data, total: Number(r.data.total) });
      setItems((i.data || []).map((x) => ({ ...x, quantity: Number(x.quantity), unit_price: Number(x.unit_price), line_total: Number(x.line_total) })));
      if (r.data.receipt_path) {
        const { data } = await supabase.storage.from("receipts").createSignedUrl(r.data.receipt_path, 3600);
        if (data?.signedUrl) setImage(data.signedUrl);
      }
    })();
  }, [id]);

  const confirm = useConfirm();
  const remove = async () => {
    if (!receipt || !(await confirm({ title: "Delete receipt?", message: `Delete the ${receipt.store} receipt and its ${items.length} items?`, destructive: true }))) return;
    const supabase = createClient();
    if (receipt.receipt_path) await supabase.storage.from("receipts").remove([receipt.receipt_path]).catch(() => {});
    const { error } = await supabase.from("grocery_receipts").delete().eq("id", id);
    if (error) return setError(error.message);
    router.push("/personal/groceries");
    router.refresh();
  };

  if (error) return <div className="p-8 text-sm text-red-600">{error}</div>;
  if (!receipt) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  const fmt = (n: number) => formatCurrency(n, receipt.currency);
  const itemsSum = items.reduce((s, i) => s + i.line_total, 0);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 pb-28 md:p-8">
      <Link href="/personal/groceries" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Groceries</Link>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{receipt.store}</h1>
          <p className="text-sm text-muted-foreground">{formatDate(receipt.purchase_date)}</p>
          <p className="mt-2 text-3xl font-bold">{fmt(receipt.total)}</p>
          {items.length > 0 && Math.abs(receipt.total - itemsSum) > 0.05 && (
            <p className="text-xs text-muted-foreground">Items add up to {fmt(itemsSum)}; the difference is tax, discounts or items not listed.</p>
          )}
        </div>
        <div className="flex gap-2">
          <Link href={`/personal/groceries/${id}/edit`}><Button variant="outline" size="icon" aria-label="Edit"><Pencil className="h-4 w-4" /></Button></Link>
          <Button variant="outline" size="icon" className="text-red-600" onClick={remove} aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Items ({items.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {items.length === 0 ? <p className="text-sm text-muted-foreground">No items saved for this receipt.</p> : items.map((it) => (
            <div key={it.id} className="flex items-center justify-between gap-3 border-b py-2 last:border-0">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{it.name}</p>
                <p className="text-xs text-muted-foreground">{it.category}{it.unit ? ` · ${it.quantity} ${it.unit} × ${fmt(it.unit_price)}/${it.unit}` : it.quantity !== 1 ? ` · ${it.quantity} × ${fmt(it.unit_price)}` : ""}</p>
              </div>
              <p className="text-sm font-semibold tabular-nums">{fmt(it.line_total)}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {receipt.notes && <p className="text-sm text-muted-foreground">{receipt.notes}</p>}
      {image && (
        <Card><CardHeader><CardTitle className="text-base">Receipt photo</CardTitle></CardHeader><CardContent>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="Receipt" className="w-full rounded-lg border" />
        </CardContent></Card>
      )}
    </div>
  );
}
