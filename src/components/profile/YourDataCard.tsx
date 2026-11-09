"use client";

import { useCallback, useEffect, useState } from "react";
import { DatabaseBackup, Download, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AccordionSection } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/sharing/Modal";
import { buildAccountZip } from "@/lib/account-export";
import { sharingAction } from "@/lib/use-sharing";

const DAY = 86_400_000;
const niceDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
type Counts = { trips: number; expenses: number; cards: number; documents: number };

/** Profile > Your data: download everything as one ZIP, or schedule the account for deletion (7 days, cancellable). */
export function YourDataCard() {
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [ready, setReady] = useState<{ url: string; size: number; name: string; missing: number } | null>(null);
  const [scheduled, setScheduled] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [email, setEmail] = useState("");
  const [myEmail, setMyEmail] = useState("");
  const [counts, setCounts] = useState<Counts | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadScheduled = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setMyEmail((user.email || "").toLowerCase());
    const { data, error: e } = await supabase.from("account_deletions").select("delete_after").eq("user_id", user.id).maybeSingle();
    if (!e) setScheduled((data?.delete_after as string | undefined) ?? null);
  }, []);
  useEffect(() => { loadScheduled(); }, [loadScheduled]);
  useEffect(() => () => { if (ready) URL.revokeObjectURL(ready.url); }, [ready]);

  async function exportAll() {
    setBusy("export");
    setError(null);
    setReady(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Please sign in again.");
      const { blob, missingFiles } = await buildAccountZip(supabase, user.id, (p) => setProgress(p.total > 1 ? `${p.step} (${p.done} of ${p.total})` : p.step));
      const name = `lifolio-data-${new Date().toLocaleDateString("en-CA")}.zip`;
      setReady({ url: URL.createObjectURL(blob), size: blob.size, name, missing: missingFiles });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not prepare your download.");
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  async function openSheet() {
    setSheet(true);
    setEmail("");
    setError(null);
    const supabase = createClient();
    const n = async (t: string) => (await supabase.from(t).select("id", { count: "exact", head: true })).count ?? 0;
    const [trips, expenses, cards, documents] = await Promise.all([n("trips"), n("expenses"), n("loyalty_cards"), n("travel_documents")]);
    setCounts({ trips, expenses, cards, documents });
  }

  async function schedule() {
    setBusy("delete");
    setError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Please sign in again.");
      if (email.trim().toLowerCase() !== (user.email || "").toLowerCase()) throw new Error("That is not the email of this account.");
      // The database sets the date (7 days from now); a repeat tap finds it already scheduled
      const { error: e } = await supabase.from("account_deletions").insert({ user_id: user.id });
      if (e && e.code !== "23505") throw new Error("Could not schedule the deletion. Please try again.");
      const { data: row } = await supabase.from("account_deletions").select("delete_after").eq("user_id", user.id).maybeSingle();
      const when = (row?.delete_after as string | undefined) ?? new Date(Date.now() + 7 * DAY).toISOString();
      await sharingAction("enable", { enabled: false }); // partners lose access straight away
      setScheduled(when);
      setSheet(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not schedule the deletion.");
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    setBusy("cancel");
    setError(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { error: e } = user ? await supabase.from("account_deletions").delete().eq("user_id", user.id) : { error: new Error("x") };
    setBusy(null);
    if (e) return setError("Could not cancel. Please try again.");
    setScheduled(null);
  }

  const mb = (b: number) => (b >= 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
  return (
    <AccordionSection
      id="your-data"
      title="Your data"
      icon={<DatabaseBackup />}
      summary={scheduled ? `Deletion on ${niceDate(scheduled)}` : "Download a copy, or delete your account"}
      badge={scheduled ? { text: "Deletion scheduled", tone: "attention" } : null}
      description="Take a copy of everything you have stored here, or remove it for good."
    >
      <div className="space-y-5" data-testid="your-data">
        {error && !sheet && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

        <section className="space-y-3 rounded-2xl border p-4">
          <h3 className="font-semibold">Export my data</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>Profile and settings</li><li>Trips and receipts, with the photos</li><li>Personal spending, projects and grocery receipts</li><li>Loyalty cards and document details</li><li>Your sharing history</li>
          </ul>
          <Button type="button" className="min-h-[48px] w-full" onClick={exportAll} disabled={busy !== null}>{busy === "export" ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> {progress || "Preparing…"}</> : "Prepare my download"}</Button>
          <p className="text-[13px] text-muted-foreground">One ZIP file you can keep. Large accounts take a minute; keep this page open.</p>
        </section>

        {ready && (
          <div className="flex items-center gap-3 rounded-xl border border-green-300 bg-green-50 p-3 text-sm text-green-950 dark:border-green-800 dark:bg-green-950/40 dark:text-green-100" role="status">
            <span className="flex-1"><strong className="font-semibold">Your export is ready.</strong> {mb(ready.size)}{ready.missing > 0 ? ` · ${ready.missing} file(s) could not be included` : ""}</span>
            <a href={ready.url} download={ready.name} className="inline-flex min-h-[44px] items-center gap-1 font-bold underline"><Download className="h-4 w-4" aria-hidden="true" /> Download</a>
          </div>
        )}

        <section className="space-y-3 rounded-2xl border border-red-300 p-4 dark:border-red-900">
          <h3 className="font-semibold text-red-800 dark:text-red-300">Delete account and all data</h3>
          {scheduled ? (
            <>
              <p className="text-sm">Your account will be deleted on <strong className="font-semibold">{niceDate(scheduled)}</strong>. Until then it works as normal. Sharing has been switched off.</p>
              <Button type="button" variant="outline" className="min-h-[48px] w-full" onClick={cancel} disabled={busy !== null}>{busy === "cancel" ? "Cancelling…" : "Cancel deletion"}</Button>
            </>
          ) : (
            <>
              <p className="text-sm">This removes your trips, receipts, photos, personal spending, grocery receipts, loyalty cards, documents and everything you shared. Your partners lose access straight away. Export first if you want a copy.</p>
              <p className="text-sm">Nothing is deleted for 7 days. You can cancel any time before that.</p>
              <Button type="button" variant="outline" className="min-h-[48px] w-full border-red-700 text-red-700 hover:bg-red-50 dark:text-red-300" onClick={openSheet}>Delete my account…</Button>
            </>
          )}
        </section>
      </div>

      {sheet && (
        <Modal title="Delete your account?" onClose={() => (busy ? undefined : setSheet(false))} labelledBy="delete-account-title">
          <div className="space-y-3">
            <p className="text-sm">On <strong className="font-semibold">{niceDate(new Date(Date.now() + 7 * DAY).toISOString())}</strong> we will permanently remove:</p>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              <li>{counts ? `${counts.trips} trips and ${counts.expenses} receipts, with photos` : "Your trips and receipts, with photos"}</li>
              <li>Personal spending and grocery receipts</li>
              <li>{counts ? `${counts.cards} loyalty cards and ${counts.documents} documents` : "Loyalty cards and documents"}</li>
              <li>Everything shared with your partners</li>
            </ul>
            <p className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-[13px]">Until then your account works as normal. Cancel any time from Profile → Your data. Sharing is switched off now and stays off.</p>
            <label className="block text-[13px] font-semibold text-muted-foreground">Type your email to confirm
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={myEmail || "you@example.com"} autoComplete="off" className="mt-1.5 min-h-[48px]" data-testid="delete-confirm-email" />
            </label>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="button" className="min-h-[52px] w-full bg-red-700 text-white hover:bg-red-800" disabled={busy !== null || email.trim().toLowerCase() !== myEmail} onClick={schedule}>{busy === "delete" ? "Scheduling…" : "Schedule deletion"}</Button>
            <Button type="button" variant="ghost" className="min-h-[48px] w-full" onClick={() => setSheet(false)} disabled={busy !== null}>Keep my account</Button>
          </div>
        </Modal>
      )}
    </AccordionSection>
  );
}
