"use client";

import { Alert } from "@/components/ui/alert";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Lock, ShieldCheck, ArrowLeft } from "lucide-react";
import { PasswordHints, PasswordInput } from "@/components/auth/PasswordInput";
import { PASSWORD_RULE, friendlyAuthError, passwordFormProblem, retryOnNetwork } from "@/lib/password-policy";

type Phase = "checking" | "ready" | "invalid";

/** Where the link in the "forgot password" email lands. The browser client turns the link into a short session; then a new password can be set. */
export default function ResetPasswordPage() {
  const [phase, setPhase] = useState<Phase>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const problem = passwordFormProblem(password, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    setLoading(true);
    try {
      const { error: updateError } = await retryOnNetwork(() => supabase.auth.updateUser({ password }));
      if (updateError) throw updateError;
      fetch("/api/auth/password-changed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "reset" }),
      }).catch(() => {});
      router.push("/");
      router.refresh();
    } catch (err: unknown) {
      setError(friendlyAuthError(err, "Failed to update password"));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 p-4">
      <div className="w-full max-w-[420px]">
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl shadow-blue-900/5 dark:shadow-black/40 border border-slate-100 dark:border-slate-800 p-8 sm:p-10">
          <div className="flex justify-center mb-6">
            <div className="h-14 w-14 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/30">
              <ShieldCheck className="h-7 w-7 text-white" strokeWidth={2} />
            </div>
          </div>

          {phase === "checking" && <p className="text-center text-sm text-slate-500 dark:text-slate-400" role="status">Checking your reset link…</p>}

          {phase === "invalid" && (
            <div className="space-y-4 text-center">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">This link no longer works</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">Reset links can only be used once and expire after a while. Ask for a new one and use it right away.</p>
              <Link href="/forgot-password" className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-700">Send a new link</Link>
              <Link href="/login" className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"><ArrowLeft className="h-4 w-4" />Back to sign in</Link>
            </div>
          )}

          {phase === "ready" && (
            <>
              <div className="text-center mb-8">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Choose a new password</h1>
                <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm">You will be signed in once it is saved</p>
              </div>
              <form onSubmit={handleSubmit} noValidate className="space-y-5">
                <div className="space-y-1.5">
                  <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-200">New password</label>
                  <PasswordInput
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    left={<Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />}
                    inputClassName="w-full h-11 pl-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all"
                  />
                  <p className="text-xs text-slate-400">{PASSWORD_RULE}</p>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="confirm" className="block text-sm font-medium text-slate-700 dark:text-slate-200">Confirm password</label>
                  <PasswordInput
                    id="confirm"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    left={<Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />}
                    inputClassName="w-full h-11 pl-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all"
                  />
                  <PasswordHints password={password} confirm={confirm} />
                </div>
                {error && <Alert className="border border-red-100">{error}</Alert>}
                <button type="submit" disabled={loading} className="w-full h-11 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm transition-all disabled:opacity-60">
                  {loading ? "Saving..." : "Save new password"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
