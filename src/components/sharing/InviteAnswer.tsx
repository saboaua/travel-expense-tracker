"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { loadSharing, sharingAction } from "@/lib/use-sharing";
import type { IncomingInvite } from "@/lib/sharing";

/** Accept, Decline, Block for one invite. Used in the popup and on the profile screen. */
export function InviteAnswer({ invite, onDone, onLater }: { invite: IncomingInvite; onDone?: () => void; onLater?: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function answer(action: "accept" | "decline" | "block") {
    setBusy(action);
    setError(null);
    const r = await sharingAction("respond", { id: invite.id, action });
    setBusy(null);
    if (!r.ok) return setError(r.error);
    await loadSharing(true);
    router.refresh(); // the bell is worked out on the server
    onDone?.();
  }

  return (
    <div>
      <p className="text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{invite.from_name}</span>{invite.from_email ? ` (${invite.from_email})` : ""} wants to share with you. Turn on sharing to accept. Nothing is shared until you accept.
      </p>
      {error && <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive" role="alert">{error}</p>}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {onLater && <Button type="button" variant="ghost" onClick={onLater} disabled={!!busy}>Later</Button>}
        <Button type="button" variant="outline" onClick={() => answer("block")} disabled={!!busy}>{busy === "block" ? "Blocking…" : "Block"}</Button>
        <Button type="button" variant="outline" onClick={() => answer("decline")} disabled={!!busy}>{busy === "decline" ? "Declining…" : "Decline"}</Button>
        <Button type="button" onClick={() => answer("accept")} disabled={!!busy}>{busy === "accept" ? "Accepting…" : "Accept"}</Button>
      </div>
    </div>
  );
}
