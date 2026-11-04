"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CloudOff, Download, RefreshCw, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { browserStore, type QueuedExpense } from "@/lib/offline-queue";
import { useExpenseQueue } from "@/lib/use-expense-queue";
import { SYNC_NOW_EVENT } from "@/components/OfflineSync";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { DuplicateList } from "@/components/DuplicateList";
import { formatCurrency } from "@/lib/utils";

function Thumb({ blob }: { blob: Blob }) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  // eslint-disable-next-line @next/next/no-img-element -- a local blob URL, not a remote image
  return <img src={url} alt="Receipt photo" className="h-16 w-16 shrink-0 rounded-lg border object-cover" />;
}

export default function PendingPage() {
  const supabase = useMemo(() => createClient(), []);
  const confirm = useConfirm();
  const [userId, setUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(true);
  const [tripNames, setTripNames] = useState<Record<string, string>>({});
  const { items } = useExpenseQueue(userId);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
      setReady(true);
    });
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, [supabase]);

  useEffect(() => {
    const ids = [...new Set(items.map((i) => i.tripId))];
    if (ids.length === 0 || !navigator.onLine) return;
    supabase.from("trips").select("id, name").in("id", ids).then(({ data }) => {
      if (data) setTripNames(Object.fromEntries(data.map((t: { id: string; name: string }) => [t.id, t.name])));
    });
  }, [items, supabase]);

  const retry = async (item: QueuedExpense, keepDuplicate = false) => {
    await browserStore.put({ ...item, status: "pending", attempts: 0, error: null, duplicates: undefined, duplicateOk: keepDuplicate || item.duplicateOk });
    window.dispatchEvent(new Event(SYNC_NOW_EVENT));
  };

  const discard = async (item: QueuedExpense) => {
    const ok = await confirm({
      title: "Discard this receipt?",
      message: "It has not been saved to your account yet, so it will be gone for good.",
      confirmLabel: "Discard",
      destructive: true,
    });
    if (ok) await browserStore.remove(item.id);
  };

  const download = (item: QueuedExpense) => {
    if (!item.image) return;
    const url = URL.createObjectURL(item.image);
    const a = document.createElement("a");
    a.href = url;
    a.download = item.imageName || `receipt-${item.expenseDate}.jpg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 pb-28 md:p-8">
      <div>
        <h1 className="text-2xl font-bold">Waiting to sync</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Receipts saved on this device while offline. They upload automatically when you are connected.
        </p>
      </div>

      {!online && (
        <Alert variant="warning">
          <span className="inline-flex items-center gap-2"><CloudOff className="h-4 w-4" /> You are offline. Nothing is lost; these will upload when your connection returns.</span>
        </Alert>
      )}

      {ready && items.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Nothing is waiting. All your receipts are saved to your account.
          </CardContent>
        </Card>
      )}

      {items.map((item) => (
        <Card key={item.id}>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-start gap-3">
              {item.image && <Thumb blob={item.image} />}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{item.merchant || "Receipt"}</p>
                <p className="text-sm text-muted-foreground">
                  {formatCurrency(item.amount, item.currency)} · {item.category} · {item.expenseDate}
                </p>
                <p className="truncate text-xs text-muted-foreground">Trip: {tripNames[item.tripId] ?? "…"}</p>
              </div>
              <span
                className={`shrink-0 rounded-md px-2 py-1 text-xs font-medium ${
                  item.status === "pending" ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100" : "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100"
                }`}
              >
                {item.status === "pending" ? "Pending" : item.status === "duplicate" ? "Possible duplicate" : item.status === "conflict" ? "Needs attention" : "Failed"}
              </span>
            </div>

            {item.status === "duplicate" && item.duplicates ? (
              <Alert variant="warning" className="space-y-3">
                <p className="font-medium">This looks like a receipt you already saved.</p>
                <DuplicateList matches={item.duplicates} />
              </Alert>
            ) : (
              item.error && <Alert>{item.error}</Alert>
            )}

            <div className="flex flex-wrap gap-2">
              {item.status === "duplicate" && (
                <Button type="button" size="sm" variant="outline" className="gap-1" disabled={!online} onClick={() => retry(item, true)}>
                  <RefreshCw className="h-4 w-4" /> Keep it anyway
                </Button>
              )}
              {item.status !== "conflict" && item.status !== "duplicate" && (
                <Button type="button" size="sm" variant="outline" className="gap-1" disabled={!online} onClick={() => retry(item)}>
                  <RefreshCw className="h-4 w-4" /> {item.status === "failed" ? "Try again" : "Sync now"}
                </Button>
              )}
              {item.status === "conflict" && item.image && (
                <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => download(item)}>
                  <Download className="h-4 w-4" /> Save photo
                </Button>
              )}
              <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => discard(item)}>
                <Trash2 className="h-4 w-4" /> Discard
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      <Link href="/" className="inline-block text-sm text-muted-foreground hover:text-foreground">
        Back to dashboard
      </Link>
    </div>
  );
}
