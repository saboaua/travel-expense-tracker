"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateState } from "@/lib/about";

/** "Check for updates": asks the server which release is live and compares it with the one running on this phone. */
export function CheckForUpdates() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<"latest" | "behind" | "unknown" | "offline" | null>(null);

  const check = async () => {
    setBusy(true); setResult(null);
    try {
      const res = await fetch("/api/version", { cache: "no-store" });
      const { version } = (await res.json()) as { version?: string };
      setResult(updateState(process.env.NEXT_PUBLIC_BUILD_ID, version));
    } catch {
      setResult("offline");
    }
    setBusy(false);
  };

  return (
    <div className="space-y-2 text-center">
      <Button variant="outline" onClick={() => void check()} disabled={busy} className="h-11 w-full" data-testid="check-updates">
        <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> {busy ? "Checking…" : "Check for updates"}
      </Button>
      <div role="status" aria-live="polite" className="text-sm text-muted-foreground" data-testid="update-result">
        {result === "latest" && "You are on the latest version."}
        {result === "unknown" && "You are running a test version, so there is nothing to compare."}
        {result === "offline" && "Could not check. Connect to the internet and try again."}
        {result === "behind" && (
          <span className="flex flex-col items-center gap-2">
            <span className="font-medium text-foreground">A newer version is available.</span>
            <Button size="sm" onClick={() => window.location.reload()}>Update now</Button>
          </span>
        )}
      </div>
    </div>
  );
}
