"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft } from "lucide-react";
import { AuthShell, NewPasswordForm } from "@/components/auth/NewPasswordForm";
import { retryOnNetwork } from "@/lib/password-policy";

type Phase = "checking" | "ready" | "invalid";

/** Where the link in the "forgot password" email lands. The browser client turns the link into a short session; then a new password can be set. */
export default function ResetPasswordPage() {
  const [phase, setPhase] = useState<Phase>("checking");
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  useEffect(() => {
    const link = `${window.location.search}&${window.location.hash.replace(/^#/, "")}`;
    if (/(^|&)error(_code|_description)?=/.test(link)) {
      setPhase("invalid"); // the link was used already, or it expired
      return;
    }
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "INITIAL_SESSION")) setPhase("ready");
    });
    supabase.auth.getSession().then(({ data }) => data.session && setPhase("ready")).catch(() => {});
    // The link is exchanged in the background: give it a few seconds before calling it bad
    const timer = setTimeout(() => setPhase((p) => (p === "checking" ? "invalid" : p)), 8000);
    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, [supabase]);

  const save = async (password: string) => {
    const { error: updateError } = await retryOnNetwork(() => supabase.auth.updateUser({ password }));
    if (updateError) throw updateError;
    fetch("/api/auth/password-changed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "reset" }),
    }).catch(() => {});
    router.push("/");
    router.refresh();
  };

  return (
    <AuthShell>
          {phase === "checking" && <p className="text-center text-sm text-slate-500 dark:text-slate-400" role="status">Checking your reset link…</p>}

          {phase === "invalid" && (
            <div className="space-y-4 text-center">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">This link no longer works</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">Reset links can only be used once and expire after a while. Ask for a new one and use it right away.</p>
              <Link href="/forgot-password" className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary text-sm font-medium text-white hover:bg-primary/90">Send a new link</Link>
              <Link href="/login" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80"><ArrowLeft className="h-4 w-4" />Back to sign in</Link>
            </div>
          )}

          {phase === "ready" && (
            <NewPasswordForm
              title="Choose a new password"
              subtitle="You will be signed in once it is saved"
              submitLabel="Save new password"
              busyLabel="Saving..."
              onSave={save}
            />
          )}
    </AuthShell>
  );
}
