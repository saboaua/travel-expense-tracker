"use client";

import { useBrand } from "@/lib/use-brand";
import { useCallback, useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { friendlyAuthError } from "@/lib/password-policy";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AccordionSection } from "@/components/ui/accordion";

const SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** What went wrong, in words a person can act on. */
export function emailChangeProblem(e: unknown): string {
  const m = ((e as { message?: string; code?: string } | null)?.message ?? "") + " " + ((e as { code?: string } | null)?.code ?? "");
  if (/already|registered|exists|taken/i.test(m)) return "That email is already used. Try another address, or ask an admin to help.";
  if (/rate|too many|seconds|limit/i.test(m)) return "Too many tries. Wait a few minutes and try again.";
  return friendlyAuthError(e, "Could not start the change. Please try again.");
}

/** Profile > Sign-in email: change the email you sign in with. The new address must confirm with a link; until then the old one keeps working. */
export function EmailCard() {
  const { appName } = useBrand();
  const [current, setCurrent] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    setCurrent(user.email ?? "");
    setPending(user.new_email ?? null);
    // keep the profile's copy of the email in step with the sign-in email (the nightly lists and the admin list read it)
    if (user.email) {
      const { data: p } = await sb.from("profiles").select("email").eq("id", user.id).maybeSingle();
      if (p && p.email !== user.email) await sb.from("profiles").update({ email: user.email }).eq("id", user.id);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setMsg(null);
    const to = next.trim().toLowerCase();
    if (!SHAPE.test(to)) return setErr("Type a full email address, like name@example.com.");
    if (to === current.toLowerCase()) return setErr("That is already your email.");
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ email: to }, { emailRedirectTo: `${window.location.origin}/auth/email-changed` });
    setBusy(false);
    if (error) return setErr(emailChangeProblem(error));
    setPending(to); setNext("");
    setMsg(`Check ${to}. We sent a link. Until you tap it you still sign in with ${current}.`);
  };

  const resend = async () => {
    if (!pending) return;
    setErr(null); setMsg(null); setBusy(true);
    const { error } = await createClient().auth.resend({ type: "email_change", email: pending });
    setBusy(false);
    if (error) return setErr(emailChangeProblem(error));
    setMsg(`We sent the link to ${pending} again.`);
  };

  return (
    <AccordionSection id="email" title="Sign-in email" icon={<Mail />} tone="mail" summary={current} description={`The email you sign in with and where ${appName} writes to you.`}>
      <form onSubmit={submit} noValidate className="space-y-4" data-testid="email-card">
        {err && <Alert variant="error">{err}</Alert>}
        {msg && <Alert variant="success">{msg}</Alert>}
        <div>
          <p className="text-sm font-medium">Email</p>
          <p className="mt-1 break-all text-base" data-testid="email-current">{current || "…"}</p>
        </div>
        {pending && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100" data-testid="email-pending">
            <b>Waiting for {pending}.</b> Tap the link we sent there. It works for 24 hours.
            <button type="button" onClick={resend} disabled={busy} className="ml-2 font-bold underline">Send it again</button>
          </div>
        )}
        <div className="space-y-1">
          <label htmlFor="new-email" className="text-sm font-medium">New email</label>
          <Input id="new-email" type="email" autoComplete="email" value={next} onChange={(e) => setNext(e.target.value)} placeholder="name@example.com" data-testid="email-new" />
          <p className="text-xs text-muted-foreground">We send a link to the new address. Your email changes when you tap it.</p>
        </div>
        <Button type="submit" className="h-11 w-full" disabled={busy || !next.trim()} data-testid="email-change">{busy ? "Sending…" : "Change email"}</Button>
      </form>
    </AccordionSection>
  );
}
