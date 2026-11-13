"use client";

import { openSigned } from "@/lib/open-signed";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Image as ImageIcon, Pencil, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Alert } from "@/components/ui/alert";
import { useConfirm } from "@/components/ui/confirm";
import { useUtilityBills, type ListedBill } from "@/lib/personal/use-utility-bills";
import { history, isKind, kindLabel, monthLabel, monthShort, monthStart } from "@/lib/personal/utilities";
import { formatCurrency, formatDate, todayISO } from "@/lib/utils";
import { browserOutbox } from "@/lib/outbox";
import { deleteRow, makeRowApi } from "@/lib/row-outbox";

/** One utility over time: the last six months, the average and the highest, and every bill with when you paid it. */
export function UtilityHistory() {
  const confirm = useConfirm();
  const { rows, error, reload, setError } = useUtilityBills();
  const [kind, setKind] = useState("water");
  useEffect(() => { const k = new URLSearchParams(window.location.search).get("kind"); if (isKind(k)) setKind(k); }, []);

  const mine = useMemo(() => (rows ?? []).filter((r) => r.kind === kind), [rows, kind]);
  const h = useMemo(() => history(mine, kind, monthStart(todayISO())), [mine, kind]);
  const max = Math.max(1, ...h.bars.map((b) => b.usd));

  const openPhoto = async (path: string) => {
    const ok = await openSigned(async () => (await createClient().storage.from("receipts").createSignedUrl(path, 3600)).data?.signedUrl);
    if (!ok) setError("The photo opens when you are online.");
  };
  const remove = async (b: ListedBill) => {
    if (!(await confirm({ title: "Delete this bill?", message: `${kindLabel(b.kind)}, ${monthLabel(b.bill_month)}, ${formatCurrency(Number(b.amount), b.currency)}`, destructive: true }))) return;
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sign in again to delete.");
      await deleteRow({
        api: makeRowApi(supabase), store: browserOutbox, userId: session.user.id, table: "utility_bills", id: b.id, bucket: "receipts", paths: [b.receipt_path],
        waiting: (await browserOutbox.list().catch(() => [])).find((i) => i.id === b.id) ?? null, label: `${kindLabel(b.kind)} bill`, summary: "Utility bill · delete",
      });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete.");
    }
  };

  return (
    <div className="mx-auto max-w-lg p-4 pb-28 md:p-8">
      <Link href="/personal/utilities" className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Utilities</Link>
      <h1 className="text-[26px] font-bold leading-tight">{kindLabel(kind)}</h1>
      <p className="mt-0.5 text-[13px] text-muted-foreground">{mine.length} bill{mine.length === 1 ? "" : "s"}</p>
      {error && <Alert className="mt-3">{error}</Alert>}

      <div className="mt-4 rounded-2xl border bg-card p-4" data-testid="util-stats">
        <div className="flex gap-6">
          <div><p className="text-xs text-muted-foreground">Average</p><p className="text-xl font-bold tabular-nums" data-testid="util-average">{formatCurrency(h.average, "USD")}</p></div>
          <div><p className="text-xs text-muted-foreground">Highest</p><p className="text-xl font-bold tabular-nums" data-testid="util-highest">{formatCurrency(h.highest, "USD")}</p></div>
        </div>
        <div className="mt-4 flex h-24 items-end gap-2" role="img" aria-label="Last six months">
          {h.bars.map((b) => (
            <div key={b.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <div className={`w-full rounded-t ${b.usd > 0 ? "bg-blue-600" : "bg-slate-200 dark:bg-slate-700"}`} style={{ height: `${b.usd > 0 ? Math.max(8, (b.usd / max) * 100) : 4}%` }} />
              <span className="text-[11px] text-muted-foreground">{monthShort(b.month)}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Shown in USD so different currencies add up.</p>
      </div>

      <h2 className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bills</h2>
      <div className="mt-2 rounded-2xl border bg-card px-4" data-testid="util-history">
        {rows === null ? <p className="py-4 text-sm text-muted-foreground">&nbsp;</p> : mine.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No bills for this utility yet.</p>
        ) : (
          <ul className="divide-y">
            {mine.map((b) => (
              <li key={b.id} className="flex min-h-14 items-center gap-2 py-2" data-testid="util-bill">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{monthLabel(b.bill_month)}{b.provider ? <span className="font-normal text-muted-foreground"> · {b.provider}</span> : null}</span>
                  <span className="block text-[13px] text-muted-foreground">{b.paid_on ? `Paid ${formatDate(b.paid_on)}` : b.due_date ? `Not paid yet · due ${formatDate(b.due_date)}` : "Not paid yet"}{b.notes ? ` · ${b.notes}` : ""}{b.waiting ? " · waiting to send" : ""}</span>
                </span>
                {b.receipt_path && <button type="button" onClick={() => openPhoto(b.receipt_path!)} aria-label="Open the photo of this bill" className="flex h-11 w-11 items-center justify-center rounded-lg text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:text-blue-300 dark:hover:bg-blue-950"><ImageIcon className="h-4 w-4" aria-hidden="true" /></button>}
                <span className="text-[15px] font-bold tabular-nums">{formatCurrency(Number(b.amount), b.currency)}</span>
                <Link href={`/personal/utilities/add?id=${b.id}`} aria-label={`Change ${monthLabel(b.bill_month)} bill`} className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Pencil className="h-4 w-4" aria-hidden="true" /></Link>
                <button type="button" onClick={() => remove(b)} aria-label={`Delete ${monthLabel(b.bill_month)} bill`} className="flex h-11 w-11 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:hover:bg-red-950"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Link href={`/personal/utilities/add?kind=${kind}`} className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Add a {kindLabel(kind).toLowerCase()} bill</Link>
    </div>
  );
}
