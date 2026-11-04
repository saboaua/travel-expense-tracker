"use client";

import { Alert } from "@/components/ui/alert";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Lock, Eye, EyeOff, ShieldCheck } from "lucide-react";

export default function ChangePasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const passwordStrength = (pw: string) => {
    if (pw.length < 8) return { ok: false, msg: "At least 8 characters" };
    if (!/[A-Z]/.test(pw)) return { ok: false, msg: "Include an uppercase letter" };
    if (!/[a-z]/.test(pw)) return { ok: false, msg: "Include a lowercase letter" };
    if (!/[0-9]/.test(pw)) return { ok: false, msg: "Include a number" };
    return { ok: true, msg: "Strong password" };
  };

  const strength = passwordStrength(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!strength.ok) {
      setError(strength.msg);
      return;
    }

    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) throw updateError;

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { error: clearErr } = await supabase
          .from("profiles")
          .update({
            must_change_password: false,
            temp_password_expires_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", user.id);
        if (clearErr) {
          // Expiry column missing (migration not run yet): clear the flag alone
          const { error: flagErr } = await supabase
            .from("profiles")
            .update({ must_change_password: false, updated_at: new Date().toISOString() })
            .eq("id", user.id);
          // Without this the person would be sent straight back to this page after a "successful" change
          if (flagErr) throw flagErr;
        }
      }

      fetch("/api/auth/password-changed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "first_login" }),
      }).catch(() => {});

      router.push("/");
      router.refresh();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to update password";
      setError(message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-4">
      <div className="w-full max-w-[420px]">
        <div className="bg-white rounded-xl shadow-xl shadow-blue-900/5 border border-slate-100 p-8 sm:p-10">
          <div className="flex justify-center mb-6">
            <div className="h-14 w-14 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/30">
              <ShieldCheck className="h-7 w-7 text-white" strokeWidth={2} />
            </div>
          </div>

          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Create a new password
            </h1>
            <p className="text-slate-500 mt-2 text-sm">
              For security, you must set a new password before continuing
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                New password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="w-full h-11 pl-10 pr-11 rounded-lg border border-slate-200 bg-slate-50/50 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {password && (
                <p
                  className={`text-xs mt-1 ${
                    strength.ok ? "text-green-600" : "text-amber-600"
                  }`}
                >
                  {strength.msg}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="confirm" className="block text-sm font-medium text-slate-700">
                Confirm password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  id="confirm"
                  type={showPassword ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="w-full h-11 pl-10 pr-4 rounded-lg border border-slate-200 bg-slate-50/50 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all"
                />
              </div>
            </div>

            {error && (
              <Alert className="border border-red-100">
                {error}
              </Alert>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm transition-all disabled:opacity-60"
            >
              {loading ? "Updating..." : "Set new password & continue"}
            </button>
          </form>

          <p className="mt-6 text-xs text-slate-400 text-center">
            Use a unique password you don&apos;t use elsewhere.
          </p>
        </div>
      </div>
    </div>
  );
}
