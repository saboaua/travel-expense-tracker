"use client";

import { useState } from "react";
import { Lock, ShieldCheck } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { PasswordHints, PasswordInput } from "@/components/auth/PasswordInput";
import { PASSWORD_RULE, friendlyAuthError, passwordFormProblem } from "@/lib/password-policy";

const INPUT = "w-full h-11 pl-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all";

/** The page frame of the password screens: the gradient, the white card and the shield. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 p-4">
      <div className="w-full max-w-[420px]">
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl shadow-blue-900/5 dark:shadow-black/40 border border-slate-100 dark:border-slate-800 p-8 sm:p-10">
          <div className="flex justify-center mb-6">
            <div className="h-14 w-14 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
              <ShieldCheck className="h-7 w-7 text-white" strokeWidth={2} />
            </div>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * New password + confirm, with the rule, the live hints and the same error wording on every screen that sets a password.
 * `onSave` does the saving and the redirect; if it throws, the error is shown here.
 */
export function NewPasswordForm({ title, subtitle, submitLabel, busyLabel, onSave, footer }: {
  title: string;
  subtitle: string;
  submitLabel: string;
  busyLabel: string;
  onSave: (password: string) => Promise<void>;
  footer?: React.ReactNode;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      await onSave(password);
    } catch (err: unknown) {
      setError(friendlyAuthError(err, "Failed to update password"));
      setLoading(false);
    }
  };

  return (
    <>
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">{title}</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm">{subtitle}</p>
      </div>
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <div className="space-y-1.5">
          <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-200">New password</label>
          <PasswordInput id="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password"
            left={<Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />} inputClassName={INPUT} />
          <p className="text-xs text-slate-400">{PASSWORD_RULE}</p>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="confirm" className="block text-sm font-medium text-slate-700 dark:text-slate-200">Confirm password</label>
          <PasswordInput id="confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} autoComplete="new-password"
            left={<Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />} inputClassName={INPUT} />
          <PasswordHints password={password} confirm={confirm} />
        </div>
        {error && <Alert className="border border-red-100">{error}</Alert>}
        <button type="submit" disabled={loading} className="w-full h-11 rounded-lg bg-primary hover:bg-primary/90 text-white font-medium text-sm transition-all disabled:opacity-60">
          {loading ? busyLabel : submitLabel}
        </button>
      </form>
      {footer}
    </>
  );
}
