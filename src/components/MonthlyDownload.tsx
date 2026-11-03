"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export function MonthlyDownload({ defaultMonth }: { defaultMonth: string }) {
  const [month, setMonth] = useState(defaultMonth);

  return (
    <div className="flex flex-col sm:flex-row sm:items-end gap-3">
      <div className="space-y-1.5">
        <label htmlFor="month" className="text-sm font-medium">
          Month
        </label>
        <input
          id="month"
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
      <a href={`/api/export/month/${month}/excel`}>
        <Button variant="outline" className="gap-2 w-full sm:w-auto">
          <Download className="h-4 w-4" />
          Download Excel
        </Button>
      </a>
    </div>
  );
}
