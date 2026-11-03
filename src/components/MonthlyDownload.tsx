"use client";

import { useState } from "react";
import { Download } from "lucide-react";

export function MonthlyDownload({ defaultMonth }: { defaultMonth: string }) {
  const [month, setMonth] = useState(defaultMonth);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="space-y-1.5">
        <label htmlFor="month" className="text-sm font-medium">
          Month
        </label>
        <input
          id="month"
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm sm:w-auto"
        />
      </div>
      <a
        href={month ? `/api/export/month/${month}/excel` : undefined}
        aria-disabled={!month}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 aria-disabled:pointer-events-none aria-disabled:opacity-50"
      >
        <Download className="h-4 w-4" />
        Download Excel
      </a>
    </div>
  );
}
