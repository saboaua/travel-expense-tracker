"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function TripStatusToggle({
  tripId,
  status,
}: {
  tripId: string;
  status: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [completed, setCompleted] = useState(status === "completed");
  const [saving, setSaving] = useState(false);

  const onChange = async (next: boolean) => {
    setCompleted(next);
    setSaving(true);
    const { error } = await supabase
      .from("trips")
      .update({
        status: next ? "completed" : "active",
        updated_at: new Date().toISOString(),
      })
      .eq("id", tripId);
    setSaving(false);
    if (error) {
      setCompleted(!next);
      window.alert(error.message);
      return;
    }
    router.refresh();
  };

  return (
    <label className="flex items-center justify-between gap-4 rounded-lg border p-4 bg-card">
      <div className="min-w-0">
        <p className="font-medium">Trip complete</p>
        <p className="text-sm text-muted-foreground">
          {completed
            ? "All invoices are in. This trip is closed."
            : "Turn on when every receipt has been uploaded."}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={completed}
        disabled={saving}
        onClick={() => onChange(!completed)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
          completed ? "bg-green-600" : "bg-muted"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
            completed ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </label>
  );
}
