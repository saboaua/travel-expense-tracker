"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CreditCard, Loader2, Plane, Share2, UserPlus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AccordionSection } from "@/components/ui/accordion";
import { useConfirm } from "@/components/ui/confirm";
import { Modal } from "@/components/sharing/Modal";
import { InviteAnswer } from "@/components/sharing/InviteAnswer";
import { INVITE_SENT_MESSAGE, SHARING_LIMITS, isValidEmail, normalizeEmail, type Partner, type ShareRow } from "@/lib/sharing";
import { sharingAction, useSharing } from "@/lib/use-sharing";

type Names = Record<string, string>;

/** Profile > Sharing: turn sharing on, add a partner, answer invites, see what is shared and stop it. Hidden when the role does not have sharing. */
export function SharingCard() {
  const { overview, refresh } = useSharing();
  const router = useRouter();
  const confirm = useConfirm();
  const [adding, setAdding] = useState<"email" | "confirm" | "done" | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [names, setNames] = useState<Names>({});

  const shares: ShareRow[] = useMemo(() => (overview && overview.available ? overview.shares : []), [overview]);

  // Names of my own shared items (I own them, so ordinary row level security lets me read them)
  const loadNames = useCallback(async () => {
    if (shares.length === 0) return setNames({});
    const supabase = createClient();
    const ids = (k: string) => shares.filter((s) => s.kind === k).map((s) => s.item_id);
    const [c, t, p] = await Promise.all([
      ids("loyalty_card").length ? supabase.from("loyalty_cards").select("id, store_name").in("id", ids("loyalty_card")) : null,
      ids("trip").length ? supabase.from("trips").select("id, name").in("id", ids("trip")) : null,
      ids("personal_trip").length ? supabase.from("personal_projects").select("id, name").in("id", ids("personal_trip")) : null,
    ]);
    const out: Names = {};
    for (const r of (c?.data || []) as { id: string; store_name: string }[]) out[r.id] = r.store_name;
    for (const r of [...(t?.data || []), ...(p?.data || [])] as { id: string; name: string }[]) out[r.id] = r.name;
    setNames(out);
  }, [shares]);
  useEffect(() => { loadNames(); }, [loadNames]);

  if (!overview || !overview.available) return null;
  const o = overview;

  const change = async (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, success?: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) { setError(r.error); return false; }
    await refresh();
    router.refresh();
    if (success) setNotice(success);
    return true;
  };

  async function turnOn() {
    await change(() => sharingAction("enable", { enabled: true }));
  }
  async function turnOff() {
    const ok = await confirm({
      title: "Turn sharing off?",
      message: "All your partnerships end and everything you shared is removed. Your cards and trips are not deleted.",
      confirmLabel: "Turn off",
      destructive: true,
    });
    if (ok) await change(() => sharingAction("enable", { enabled: false }), "Sharing is off.");
  }
  async function endPartner(p: Partner) {
    const who = p.name || p.email || "this person";
    const pending = p.status === "pending";
    const ok = await confirm({
      title: pending ? "Cancel this invite?" : `Stop sharing with ${who}?`,
      message: pending ? `The invite to ${who} will be withdrawn.` : "Everything you shared will be removed. They will no longer see your cards or trips.",
      confirmLabel: pending ? "Cancel invite" : "Stop sharing",
      destructive: true,
    });
    if (ok) await change(() => sharingAction("end", { id: p.id }), pending ? "Invite cancelled." : "Sharing stopped.");
  }
  async function unshare(s: ShareRow) {
    const ok = await confirm({ title: `Stop sharing this ${s.kind === "loyalty_card" ? "card" : "trip"}?`, message: `${names[s.item_id] || "It"} will no longer be visible to them.`, confirmLabel: "Stop sharing", destructive: true });
    if (ok) await change(() => sharingAction("unshare", { share_id: s.id }));
  }

  async function sendInvite() {
    setBusy(true);
    setError(null);
    const r = await sharingAction("invite", { email: normalizeEmail(email) });
    setBusy(false);
    if (!r.ok) { setAdding("email"); return setError(r.error); }
    await refresh();
    router.refresh();
    setAdding("done");
  }
  const closeAdd = () => { setAdding(null); setEmail(""); setError(null); };

  const active = o.partners.filter((p) => p.status === "active");
  const waiting = o.partners.filter((p) => p.status === "pending");
  const atLimit = active.length >= SHARING_LIMITS.partners;

  return (
    <>
    <AccordionSection
      id="sharing"
      title="Sharing"
      icon={<Share2 />}
      summary={!o.enabled ? "Off" : `${active.length} of ${SHARING_LIMITS.partners} partners`}
      badge={o.incoming.length > 0 ? { text: o.incoming.length === 1 ? "1 invite waiting" : `${o.incoming.length} invites waiting`, tone: "attention" } : null}
      description="Show a loyalty card or a trip to someone you trust. They can only look: they cannot change or delete anything, and they never see expenses, receipts or notes. Nothing is shared unless you pick it."
    >
        {error && <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p>}
        {notice && <p className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm" role="status">{notice}</p>}

        {o.enabled && (
          <Link href="/profile/sharing-activity" data-testid="sharing-activity-link" className="flex min-h-[44px] items-center justify-between rounded-xl border px-4 text-sm font-semibold hover:bg-muted">
            Sharing activity <span className="text-xs font-normal text-muted-foreground">Who looked, and every change</span>
          </Link>
        )}

        {o.incoming.length > 0 && (
          <div className="space-y-3">
            {o.incoming.map((i) => (
              <div key={i.id} className="rounded-xl border border-primary/40 bg-primary/5 p-3">
                <p className="text-sm font-semibold">Sharing invite</p>
                <div className="mt-1"><InviteAnswer invite={i} /></div>
              </div>
            ))}
          </div>
        )}

        {!o.enabled ? (
          <div className="rounded-xl border-2 border-dashed p-4 text-center">
            <p className="text-sm text-muted-foreground">Sharing is off. Turn it on to add a partner.</p>
            <Button type="button" className="mt-3" onClick={turnOn} disabled={busy}>{busy ? "Turning on…" : "Turn on sharing"}</Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">{active.length} of {SHARING_LIMITS.partners} partners</p>
              <Button type="button" onClick={() => { setError(null); setAdding("email"); }} disabled={busy || atLimit}><UserPlus className="h-4 w-4" /> Add a partner</Button>
            </div>
            {atLimit && <p className="text-xs text-muted-foreground">You have reached the limit of {SHARING_LIMITS.partners} partners. Stop sharing with someone to add another.</p>}

            {active.length === 0 && waiting.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">No partners yet.</p>
            ) : (
              <ul className="divide-y rounded-xl border">
                {[...active, ...waiting].map((p) => {
                  const mine = shares.filter((s) => s.partnership_id === p.id);
                  return (
                    <li key={p.id} className="space-y-2 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{p.name || p.email}</p>
                          {p.name && p.email && <p className="truncate text-xs text-muted-foreground">{p.email}</p>}
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${p.status === "active" ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"}`}>
                          {p.status === "active" ? "Approved" : "Pending"}
                        </span>
                      </div>
                      {p.status === "active" && (
                        mine.length === 0 ? (
                          <p className="text-xs text-muted-foreground">You have not shared anything with them yet. Open a card or a trip and turn on “Share with”.</p>
                        ) : (
                          <ul className="space-y-1">
                            {mine.map((s) => (
                              <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5 text-sm">
                                <span className="flex min-w-0 items-center gap-2">
                                  {s.kind === "loyalty_card" ? <CreditCard className="h-4 w-4 shrink-0" aria-hidden="true" /> : <Plane className="h-4 w-4 shrink-0" aria-hidden="true" />}
                                  <span className="truncate">{names[s.item_id] || (s.kind === "loyalty_card" ? "Card" : "Trip")}</span>
                                </span>
                                <button type="button" onClick={() => unshare(s)} disabled={busy} className="shrink-0 text-xs font-semibold text-destructive hover:underline" aria-label={`Stop sharing ${names[s.item_id] || "this item"}`}>Stop</button>
                              </li>
                            ))}
                          </ul>
                        )
                      )}
                      {p.status === "pending" && <p className="text-xs text-muted-foreground">Waiting for them to accept. The invite stays open for {SHARING_LIMITS.inviteDays} days.</p>}
                      <div className="flex justify-end">
                        <Button type="button" variant="outline" size="sm" onClick={() => endPartner(p)} disabled={busy}>
                          <X className="h-3.5 w-3.5" /> {p.status === "pending" ? "Cancel invite" : "Stop sharing with all"}
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="border-t pt-3">
              <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={turnOff} disabled={busy}>Turn sharing off</Button>
            </div>
          </>
        )}
    </AccordionSection>

      {adding === "email" && (
        <Modal title="Add a partner" onClose={closeAdd}>
          <form onSubmit={(e) => { e.preventDefault(); if (isValidEmail(normalizeEmail(email))) { setError(null); setAdding("confirm"); } else setError("Enter a valid email address."); }}>
            <label htmlFor="partner-email" className="text-sm text-muted-foreground">Their email address</label>
            <Input id="partner-email" type="email" inputMode="email" autoComplete="off" autoCapitalize="none" className="mt-1" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
            {error && <p className="mt-2 text-sm text-destructive" role="alert">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeAdd}>Cancel</Button>
              <Button type="submit">Next</Button>
            </div>
          </form>
        </Modal>
      )}
      {adding === "confirm" && (
        <Modal title="Send an invite?" onClose={closeAdd}>
          <p className="text-sm text-muted-foreground">Send an invite to <span className="font-semibold text-foreground">{normalizeEmail(email)}</span>? They choose whether to accept, and nothing is shared until they do.</p>
          {error && <p className="mt-2 text-sm text-destructive" role="alert">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setAdding("email")} disabled={busy}>Back</Button>
            <Button type="button" onClick={sendInvite} disabled={busy}>{busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : "Send invite"}</Button>
          </div>
        </Modal>
      )}
      {adding === "done" && (
        <Modal title="Invite sent" onClose={closeAdd}>
          <p className="text-sm text-muted-foreground">{INVITE_SENT_MESSAGE}</p>
          <div className="mt-4 flex justify-end"><Button type="button" onClick={closeAdd}>OK</Button></div>
        </Modal>
      )}
    </>
  );
}
