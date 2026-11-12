"use client";

import { useConfirm } from "@/components/ui/confirm";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, CloudOff, Pencil, Trash2 } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { fetchReceiptBundle, itemsWithWaiting, receiptKey, type ReceiptBundle } from "@/lib/offline-grocery";
import { useCachedQuery } from "@/lib/use-cached-query";
import { useOutbox } from "@/lib/use-outbox";
import { applyRows, deleteRow, makeRowApi } from "@/lib/row-outbox";
import { browserBlobs } from "@/lib/offline-store";
import { browserOutbox } from "@/lib/outbox";
import { OfflineNotice } from "@/components/OfflineNotice";

export function GroceryReceiptDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data: bundle, loading, error: loadError, savedAt, userId } = useCachedQuery<ReceiptBundle>((uid) => receiptKey(uid, id), (sb) => fetchReceiptBundle(sb, id), [id]);
  const { items: pending } = useOutbox(userId);
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const receipt = useMemo(() => (bundle ? applyRows([bundle.receipt], pending, "grocery_receipts").map((r) => ({ ...r, total: Number(r.total) }))[0] ?? null : null), [bundle, pending]);
  const items = useMemo(() => itemsWithWaiting(id, bundle?.items ?? [], pending).map((x) => ({ ...x, quantity: Number(x.quantity), unit_price: Number(x.unit_price), line_total: Number(x.line_total) })), [bundle, pending, id]);
  const waiting = pending.some((i) => i.id === id);
  const path = receipt?.receipt_path ?? null;

  useEffect(() => {
    if (!path) { setImage(null); return; }
    let made: string | null = null;
    let live = true;
    (async () => {
      const kept = await browserBlobs.get(`receipts/${path}`).catch(() => null);
      if (kept) { made = URL.createObjectURL(kept); if (live) setImage(made); return; }
      if (!navigator.onLine) return;
      const { data } = await createClient().storage.from("receipts").createSignedUrl(path, 3600);
      if (live && data?.signedUrl) setImage(data.signedUrl);
    })();
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [path]);

  const confirm = useConfirm();
  const remove = async () => {
    if (!receipt || !(await confirm({ title: "Delete receipt?", message: `Delete the ${receipt.store} receipt and its ${items.length} items?`, destructive: true }))) return;
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sign in again to delete.");
      await deleteRow({
        api: makeRowApi(supabase), store: browserOutbox, userId: session.user.id, table: "grocery_receipts", id, bucket: "receipts", paths: [bundle?.receipt.receipt_path],
        waiting: pending.find((i) => i.id === id) ?? null, label: receipt.store, summary: "Grocery receipt · delete",
      });
    } catch (err) {
      return setError(err instanceof Error ? err.message : "Could not delete.");
    }
    router.push("/personal/groceries");
    router.refresh();
  };

  if (error || (loadError && !receipt)) return <div className="p-8 text-sm text-red-600">{error || loadError}</div>;
  if (loading || !receipt) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  const fmt = (n: number) => formatCurrency(n, receipt.currency);
  const itemsSum = items.reduce((s, i) => s + i.line_total, 0);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 pb-28 md:p-8">
      <Link href="/personal/groceries" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Groceries</Link>
      <OfflineNotice savedAt={savedAt} writable />
      {waiting && <p className="flex items-center gap-1 text-xs font-medium text-amber-600"><CloudOff className="h-3.5 w-3.5" aria-hidden="true" /> Waiting to sync</p>}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{receipt.store}</h1>
          <p className="text-sm text-muted-foreground">{formatDate(receipt.purchase_date)}</p>
          <p className={`mt-2 text-3xl font-bold ${receipt.prices_only ? "text-muted-foreground" : ""}`}>{fmt(receipt.total)}</p>
          {receipt.prices_only && <p className="mt-1 text-xs text-muted-foreground" data-testid="prices-only-detail"><span className="mr-1.5 rounded-full bg-muted px-2 py-0.5 font-semibold">Prices only</span>Kept for its prices. Not counted in your spending.</p>}
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
          <img src={image} alt="Receipt" decoding="async" className="w-full rounded-lg border" />
        </CardContent></Card>
      )}
    </div>
  );
}
