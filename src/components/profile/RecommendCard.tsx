"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Share2, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AccordionSection } from "@/components/ui/accordion";
import { inviteMessage, inviteUrl } from "@/lib/invite";

type Invite = { code: string; show_name: boolean; friends: number };

/** Profile > Recommend Lifolio: a personal link to copy or share, and how many friends asked for an account with it. */
export function RecommendCard() {
  const [invite, setInvite] = useState<Invite | null>(null);
  const [available, setAvailable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);
  const [canShare, setCanShare] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await createClient().rpc("my_invite");
    if (error) { setAvailable(false); return; } // migration_invites.sql has not been run
    const row = (Array.isArray(data) ? data[0] : data) as Invite | undefined;
    if (row) setInvite({ code: row.code, show_name: row.show_name, friends: Number(row.friends) || 0 });
  }, []);
  useEffect(() => { load(); setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function"); }, [load]);

  const url = invite ? inviteUrl(window.location.origin, invite.code) : "";

  const copy = async () => {
    setErr(null);
    try { await navigator.clipboard.writeText(url); setMsg("Link copied. Paste it in a message."); }
    catch { setErr("Could not copy. Press and hold the link to copy it."); }
  };
  const share = async () => {
    setErr(null);
    try { await navigator.share({ title: "Lifolio", text: inviteMessage(url), url }); }
    catch (e) { if ((e as Error)?.name !== "AbortError") setErr("Could not open the share menu. Use Copy instead."); }
  };
  const toggleName = async () => {
    if (!invite) return;
    setBusy(true); setErr(null); setMsg(null);
    const next = !invite.show_name;
    const { error } = await createClient().rpc("set_invite_show_name", { show: next });
    setBusy(false);
    if (error) return setErr("Could not save that. Please try again.");
    setInvite({ ...invite, show_name: next });
  };
  const newLink = async () => {
    setBusy(true); setErr(null); setMsg(null);
    const { error } = await createClient().rpc("reset_my_invite");
    setBusy(false); setConfirmNew(false);
    if (error) return setErr("Could not make a new link. Please try again.");
    setMsg("New link made. The old one no longer works.");
    await load();
  };

  if (!available) {
    return (
      <AccordionSection id="recommend" title="Recommend Lifolio" icon={<Users />} summary="Not set up yet" description="Share a link with a friend.">
        <Alert variant="info">Recommend is not set up yet. An admin needs to run supabase/migration_invites.sql.</Alert>
      </AccordionSection>
    );
  }
  return (
    <AccordionSection id="recommend" title="Recommend Lifolio" icon={<Users />} summary={invite ? (invite.friends ? `${invite.friends} friend${invite.friends === 1 ? "" : "s"} asked` : "Share a link") : ""} description="Send your link. Your friend sees what Lifolio does and can ask for an account.">
      <div className="space-y-4" data-testid="recommend-card">
        {err && <Alert variant="error">{err}</Alert>}
        {msg && <Alert variant="success">{msg}</Alert>}
        <p className="text-sm text-muted-foreground">Your friend sees what Lifolio does and can ask for an account. An administrator then sets it up.</p>
        <div className="flex items-center gap-2 rounded-xl border bg-slate-50 p-1.5 pl-3 dark:bg-slate-800/50">
          <span className="min-w-0 flex-1 break-all text-sm" data-testid="invite-link">{url || "…"}</span>
          <Button type="button" variant="outline" className="h-10 shrink-0 gap-1.5" onClick={copy} disabled={!url} data-testid="invite-copy"><Copy className="h-4 w-4" aria-hidden="true" />Copy</Button>
        </div>
        {canShare && <Button type="button" className="h-12 w-full gap-2 text-base" onClick={share} disabled={!url}><Share2 className="h-5 w-5" aria-hidden="true" />Share with a friend</Button>}
        {canShare && <p className="text-center text-xs text-muted-foreground">Opens your phone share menu: WhatsApp, Messages, email and more.</p>}
        <div>
          <p className="text-sm font-bold">What your friend receives</p>
          <p className="mt-1.5 rounded-xl bg-slate-100 p-3 text-sm leading-relaxed dark:bg-slate-800">{url ? inviteMessage(url) : "…"}</p>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div><label htmlFor="invite-show-name" className="text-base font-semibold">Show my first name</label><p className="text-sm text-muted-foreground">The invite page says &quot;{"{first name}"} recommends Lifolio&quot;</p></div>
          <button id="invite-show-name" type="button" role="switch" aria-checked={invite?.show_name === true} disabled={busy || !invite} onClick={toggleName} data-testid="invite-show-name" className={`relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-60 ${invite?.show_name ? "bg-emerald-600" : "bg-slate-300 dark:bg-slate-600"}`}>
            <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${invite?.show_name ? "left-7" : "left-1"}`} />
            <span className="sr-only">{invite?.show_name ? "On" : "Off"}</span>
          </button>
        </div>
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100" data-testid="invite-count"><b>{invite?.friends ?? 0} friend{invite?.friends === 1 ? "" : "s"}</b> asked for an account with your link.</p>
        <p className="text-xs leading-relaxed text-muted-foreground">You only see how many. Their names and contact details go to the administrators only.</p>
        {confirmNew ? (
          <div className="flex gap-2">
            <Button type="button" variant="destructive" className="h-11 flex-1" onClick={newLink} disabled={busy}>Yes, make a new link</Button>
            <Button type="button" variant="outline" className="h-11 flex-1" onClick={() => setConfirmNew(false)}>Keep this one</Button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmNew(true)} className="text-xs underline text-muted-foreground" data-testid="invite-new">Make a new link (the old one stops working)</button>
        )}
      </div>
    </AccordionSection>
  );
}
