"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Crown, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";

type Share = { shared_with: string; can_complete: boolean; name: string | null };

/** Share one reminder. Free people see what Pro adds; Pro people invite by the other person's account email. */
export function ShareSheet({ reminderId, pro, onClose }: { reminderId: string; pro: boolean; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [may, setMay] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [shares, setShares] = useState<Share[]>([]);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.from("reminder_shares").select("shared_with, can_complete").eq("reminder_id", reminderId);
    const rows = (data ?? []) as { shared_with: string; can_complete: boolean }[];
    const names = rows.length ? await supabase.from("profiles").select("id, full_name").in("id", rows.map((r) => r.shared_with)) : { data: [] };
    const byId = new Map(((names.data ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name]));
    setShares(rows.map((r) => ({ ...r, name: byId.get(r.shared_with) ?? null })));
  }, [reminderId]);
  useEffect(() => { if (pro) load(); }, [pro, load]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true); setMsg(null);
    const { data, error } = await createClient().rpc("share_reminder", { rid: reminderId, person_email: email.trim(), may_complete: may });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: "Could not share. Try again." });
    if (data === "not_found") return setMsg({ ok: false, text: "No Lifolio account uses that email. Ask them to sign up first." });
    if (data === "self") return setMsg({ ok: false, text: "That is your own email." });
    setEmail(""); setMsg({ ok: true, text: "Shared. They get an alert when it is due." });
    load();
  }
  async function stop(uid: string) {
    await createClient().from("reminder_shares").delete().eq("reminder_id", reminderId).eq("shared_with", uid);
    load();
  }

  return (
    <BottomSheet title="Share this reminder" onClose={onClose} testId="share-sheet">
      {!pro ? (
        <div className="space-y-3" data-testid="share-locked">
          <p className="flex items-center gap-2 font-semibold"><Crown className="h-5 w-5 text-amber-600" aria-hidden="true" />Sharing is a Pro feature</p>
          <p className="text-sm text-muted-foreground">Share a reminder with a partner or family member. They get the alert too, and can mark it done.</p>
          <Link href="/personal/pro" className="flex min-h-12 items-center justify-center rounded-xl bg-primary px-4 font-bold text-primary-foreground">Get Pro</Link>
        </div>
      ) : (
        <div className="space-y-4">
          <form onSubmit={invite} className="space-y-3">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Their email" aria-label="Their email" data-testid="share-email" className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm" />
            <div className="flex gap-2" role="radiogroup" aria-label="What they can do">
              {[{ v: true, t: "Can mark done" }, { v: false, t: "View only" }].map((o) => (
                <button key={o.t} type="button" role="radio" aria-checked={may === o.v} onClick={() => setMay(o.v)} className={`min-h-10 flex-1 rounded-full border text-sm font-medium ${may === o.v ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{o.t}</button>
              ))}
            </div>
            <Button type="submit" className="w-full" disabled={busy || !email.trim()} data-testid="share-send">{busy ? "Sharing…" : "Share"}</Button>
            {msg && <p role="status" className={`text-sm ${msg.ok ? "text-green-700 dark:text-green-400" : "text-red-600"}`}>{msg.text}</p>}
          </form>
          {shares.length > 0 && (
            <ul className="divide-y rounded-xl border" data-testid="share-list">
              {shares.map((s) => (
                <li key={s.shared_with} className="flex items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{s.name || "A Lifolio user"}</span><span className="text-xs text-muted-foreground">{s.can_complete ? "Can mark done" : "View only"}</span></span>
                  <button type="button" onClick={() => stop(s.shared_with)} aria-label={`Stop sharing with ${s.name || "this person"}`} className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><Trash2 className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
