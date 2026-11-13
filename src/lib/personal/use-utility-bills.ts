"use client";

import { setupNeeded } from "@/lib/setup-message";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { UTILITY_BILL_COLS, UTILITY_BILL_COLS_EMAIL, withColumnFallback } from "@/lib/columns";
import { browserOutbox } from "@/lib/outbox";
import { applyRows, waitingRowIds } from "@/lib/row-outbox";
import type { BillRow } from "@/lib/personal/utilities";

export type ListedBill = BillRow & { waiting?: boolean };

/** Your bills (newest month first) with anything still waiting to send applied. `error` is set when the table is missing. */
export function useUtilityBills() {
  const [rows, setRows] = useState<ListedBill[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error: e } = await withColumnFallback((cols) => supabase.from("utility_bills").select(cols).order("bill_month", { ascending: false }).order("created_at", { ascending: false }).limit(1000), UTILITY_BILL_COLS_EMAIL, UTILITY_BILL_COLS);
    const items = await browserOutbox.list().catch(() => []);
    if (e && /relation|schema cache|does not exist/i.test(e.message)) { setError(setupNeeded("Utilities","migration_utilities.sql")); setRows(applyRows([], items, "utility_bills")); return; }
    if (e && !items.length) { setError("Could not load your bills. Check your connection."); setRows([]); return; }
    setError(null);
    const waiting = waitingRowIds(items, "utility_bills");
    const merged = applyRows(((data ?? []) as unknown as BillRow[]), items, "utility_bills");
    setRows(merged.map((r) => ({ ...r, waiting: waiting.has(r.id) })).sort((a, b) => b.bill_month.localeCompare(a.bill_month)));
  }, []);
  useEffect(() => { load(); }, [load]);
  return { rows, error, reload: load, setError };
}
