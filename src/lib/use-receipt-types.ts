"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCachedQuery } from "@/lib/use-cached-query";
import { fetchReceiptTypes, seedStarterTypes, typesKey, wasSeeded } from "@/lib/receipt-types-data";
import type { ReceiptType } from "@/lib/receipt-types";

/** Your receipt types, kept on the phone. Offers the starter types once when you have none. */
export function useReceiptTypes() {
  const q = useCachedQuery<{ types: ReceiptType[]; missing: boolean }>(typesKey, fetchReceiptTypes, []);
  const { data, userId, reload } = q;
  useEffect(() => {
    if (!data || data.missing || data.types.length || !userId || wasSeeded(userId)) return;
    seedStarterTypes(createClient(), userId).then((ok) => { if (ok) reload(); });
  }, [data, userId, reload]);
  return { ...q, types: data?.types ?? [], missing: data?.missing ?? false };
}
