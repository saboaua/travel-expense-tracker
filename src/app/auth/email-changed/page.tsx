"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Phase = "checking" | "done" | "invalid";

/** Where the link in the "confirm your new email" message lands. The browser turns the link into a session, then the email is changed. */
export default function EmailChangedPage() {
  const [phase, setPhase] = useState<Phase>("checking");
  const [email, setEmail] = useState("");
  useEffect(() => {
    const sb = createClient();
    const link = `${window.location.search}&${window.location.hash.replace(/^#/, "")}`;
    if (/(^|&)error(_code|_description)?=/.test(link)) { setPhase("invalid"); return; }
    let off = false;
    const look = async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (off || !user) return false;
      setEmail(user.email ?? "");
      setPhase("done");
      // the profile keeps a copy of the email; keep it in step
      if (user.email) await sb.from("profiles").update({ email: user.email }).eq("id", user.id);
      return true;
    };
    const { data: sub } = sb.auth.onAuthStateChange(() => { look(); });
    look();
    const timer = setTimeout(() => setPhase((p) => (p === "checking" ? "invalid" : p)), 8000);
    return () => { off = true; sub.subscription.unsubscribe(); clearTimeout(timer); };
  }, []);
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6" data-testid="email-changed">
      {phase === "checking" && <p className="text-center text-muted-foreground">Confirming your email…</p>}
      {phase === "done" && (
        <>
          <h1 className="text-2xl font-extrabold">Email confirmed</h1>
          <p className="text-base">You sign in with <b className="break-all">{email}</b> from now on.</p>
          <p className="text-sm text-muted-foreground">If your account asked you to confirm from both addresses, tap the link in the other email too.</p>
          <Link href="/profile" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-4 font-bold text-primary-foreground">Back to Profile</Link>
        </>
      )}
      {phase === "invalid" && (
        <>
          <h1 className="text-2xl font-extrabold">This link did not work</h1>
          <p className="text-base">It may have been used already or it expired. Open Profile and tap Send it again.</p>
          <Link href="/profile" className="inline-flex min-h-12 items-center justify-center rounded-xl border px-4 font-bold">Go to Profile</Link>
        </>
      )}
    </main>
  );
}
