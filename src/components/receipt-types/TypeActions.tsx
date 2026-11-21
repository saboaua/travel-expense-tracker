"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { deleteReceiptType } from "@/lib/receipt-types-data";
import { NewTypeForm } from "@/components/receipt-types/NewTypeForm";
import type { ReceiptType } from "@/lib/receipt-types";

/** On a type's own page: change its name, icon, colour, dashboard switch and limit, or delete it (its receipts go back to Groceries). */
export function TypeActions({ type, all, onChanged }: { type: ReceiptType; all: ReceiptType[]; onChanged: () => void }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = async () => {
    if (!window.confirm(`Delete "${type.name}"? Its receipts are kept and move back to Groceries.`)) return;
    const e = await deleteReceiptType(createClient(), type.id);
    if (e) return setError(e);
    onChanged();
    router.push("/personal/types");
  };
  if (editing) {
    return <Card><CardContent className="p-4"><p className="mb-3 text-base font-bold">Edit {type.name}</p><NewTypeForm existing={all} editing={type} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); onChanged(); }} /></CardContent></Card>;
  }
  return (
    <div className="flex gap-2" data-testid="type-actions">
      <button type="button" onClick={() => setEditing(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold hover:bg-muted"><Pencil className="h-4 w-4" aria-hidden="true" />Edit type</button>
      <button type="button" onClick={remove} className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"><Trash2 className="h-4 w-4" aria-hidden="true" />Delete type</button>
      {error && <p role="alert" className="self-center text-sm text-destructive">{error}</p>}
    </div>
  );
}
