"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Circle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useConfirm } from "@/components/ui/confirm";
import { makeRowApi, saveRow } from "@/lib/row-outbox";
import { browserOutbox } from "@/lib/outbox";

/**
 * Close/reopen a trip. The tone tells the story: a trip whose dates have passed but is still open
 * is highlighted, because receipts may still be arriving.
 */
export function TripStatusToggle({
  tripId,
  status,
  ended,
  endLabel,
}: {
  tripId: string;
  status: string;
  /** The trip's end date is in the past */
  ended?: boolean;
  endLabel?: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const supabase = createClient();
  const [completed, setCompleted] = useState(status === "completed");
  const [saving, setSaving] = useState(false);

  const onChange = async (next: boolean) => {
    setCompleted(next);
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sign in again to update the trip.");
      await saveRow({
        api: makeRowApi(supabase), store: browserOutbox, userId: session.user.id, table: "trips", id: tripId,
        row: { status: next ? "completed" : "active", updated_at: new Date().toISOString() },
        waiting: (await browserOutbox.list().catch(() => [])).find((i) => i.id === tripId) ?? null,
        label: next ? "Trip complete" : "Trip reopened", summary: "Trip · status",
      });
    } catch (err) {
      setSaving(false);
      setCompleted(!next);
      await confirm({ title: "Could not update the trip", message: err instanceof Error ? err.message : "Could not update the trip.", confirmLabel: "OK", hideCancel: true });
      return;
    }
    setSaving(false);
    router.refresh();
  };

  const pastOpen = !completed && !!ended;
  const tone = completed
    ? "border-emerald-200 bg-emerald-50/60"
    : pastOpen
      ? "border-amber-200 bg-amber-50/60"
      : "bg-card";
  const Icon = completed ? CheckCircle2 : pastOpen ? AlertTriangle : Circle;
  const iconTone = completed ? "text-emerald-600" : pastOpen ? "text-amber-600" : "text-muted-foreground";

  const title = completed ? "Trip complete" : pastOpen ? `Trip ended ${endLabel || ""}`.trim() : "Mark trip complete";
  const text = completed
    ? "All invoices are in. This trip is closed."
    : pastOpen
      ? "Still open so late receipts can be added. Turn this on when every receipt has been uploaded."
      : "Turn on when every receipt has been uploaded.";

  return (
    <div className={`flex items-center justify-between gap-4 rounded-xl border p-4 ${tone}`}>
      <div className="flex min-w-0 items-start gap-3">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${iconTone}`} aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-medium">{title}</p>
          <p className="text-sm text-muted-foreground">{text}</p>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={completed}
        aria-label="Trip complete"
        disabled={saving}
        onClick={() => onChange(!completed)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60 ${completed ? "bg-emerald-600" : "bg-muted-foreground/30"}`}
      >
        <span className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${completed ? "translate-x-5" : "translate-x-0"}`} />
      </button>
    </div>
  );
}
