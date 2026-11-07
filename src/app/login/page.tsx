"use client";

import { Alert } from "@/components/ui/alert";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Turnstile } from "@/components/Turnstile";
import { Mail, Lock, Eye, EyeOff, ArrowRight, Plane } from "lucide-react";
import { NETWORK_MESSAGE } from "@/lib/password-policy";

const EXPIRED_MESSAGE =
  "Your temporary password has expired. Please ask an administrator to generate a new one.";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  // False until the page scripts have loaded, so a tap on Sign In can never submit the form the plain browser way
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [error, setError] = useState<string | null>(null);
  // Optional security check, shown only after repeated failures for this email
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";
  const [captchaNeeded, setCaptchaNeeded] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaRound, setCaptchaRound] = useState(0);
  const onCaptchaToken = useCallback((t: string | null) => setCaptchaToken(t), []);
  const onCaptchaError = useCallback(() => setError("The security check could not load. Please refresh and try again."), []);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [appName, setAppName] = useState("Travel Expense Tracker");
  const [primaryColor, setPrimaryColor] = useState("#4f46e5");
  const [logoSize, setLogoSize] = useState(56);
  const supabase = createClient();

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("expired") === "1") setError(EXPIRED_MESSAGE);
  }, []);

  useEffect(() => {
    async function loadBranding() {
      let { data } = await supabase
        .from("app_settings")
        .select("app_name, logo_url, primary_color, login_logo_size")
        .eq("id", 1)
        .single();

      if (!data) {
        // login_logo_size column missing (migration not run yet): fall back to the basics
        const basic = await supabase.from("app_settings").select("app_name, logo_url, primary_color").eq("id", 1).single();
        data = basic.data as typeof data;
      }

      if (data) {
        if (data.app_name) setAppName(data.app_name);
        if (data.logo_url) setLogoUrl(data.logo_url);
        if (data.primary_color) setPrimaryColor(data.primary_color);
        if (data.login_logo_size) setLogoSize(Number(data.login_logo_size));
      }
    }
    loadBranding();
  }, [supabase]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, ...(captchaToken ? { captchaToken } : {}) }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (data.captcha_required && siteKey) {
          setCaptchaNeeded(true);
          setCaptchaRound((n) => n + 1); // tokens are single-use: get a fresh widget
        }
        setCaptchaToken(null);
        setError(data.error || "Could not sign in. Please try again.");
        setLoading(false);
        return;
      }

      // The sign-in screen can now be shown at "/" itself, so a soft navigation to "/" would not swap the page: reload it
      window.location.replace("/");
    } catch {
      setError(NETWORK_MESSAGE);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-4">
      <div className="w-full max-w-[420px]">
        <div className="bg-white rounded-xl shadow-xl shadow-blue-900/5 border border-slate-100 p-8 sm:p-10">
          <div className="flex justify-center mb-6">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt={appName}
                style={{ height: logoSize, width: "auto", maxWidth: "100%" }}
                className="object-contain"
              />
            ) : (
              <div
                className="rounded-xl flex items-center justify-center shadow-lg"
                style={{
                  height: logoSize,
                  width: logoSize,
                  backgroundColor: primaryColor,
                  boxShadow: `0 10px 15px -3px ${primaryColor}40`,
                }}
              >
                <Plane className="text-white" style={{ height: logoSize * 0.5, width: logoSize * 0.5 }} strokeWidth={2} />
              </div>
            )}
          </div>

          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              {appName}
            </h1>
            <p className="text-slate-500 mt-2 text-sm">
              Sign in to manage your business travel expenses
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full h-11 pl-10 pr-4 rounded-lg border border-slate-200 bg-slate-50/50 text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-offset-0 transition-all"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full h-11 pl-10 pr-11 rounded-lg border border-slate-200 bg-slate-50/50 text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                  style={{ accentColor: primaryColor }}
                />
                <span className="text-sm text-slate-600">Remember me</span>
              </label>
              <Link
                href="/forgot-password"
                className="text-sm font-medium hover:opacity-80 transition-opacity"
                style={{ color: primaryColor }}
              >
                Forgot password?
              </Link>
            </div>

            {captchaNeeded && siteKey && (
              <Turnstile key={captchaRound} siteKey={siteKey} onToken={onCaptchaToken} onError={onCaptchaError} />
            )}

            {error && (
              <Alert className="border border-red-100">
                {error}
              </Alert>
            )}

            <button
              type="submit"
              disabled={!ready || loading || (captchaNeeded && !captchaToken)}
              className="w-full h-11 rounded-lg text-white font-medium text-sm flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed hover:brightness-110"
              style={{
                backgroundColor: primaryColor,
                boxShadow: `0 10px 15px -3px ${primaryColor}40`,
              }}
            >
              {loading ? (
                "Signing in..."
              ) : (
                <>
                  Sign In
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-100 text-center">
            <p className="text-sm text-slate-500">
              Need an account? Contact your administrator.
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-center gap-3 text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                clipRule="evenodd"
              />
            </svg>
            256-bit SSL Encrypted
          </span>
          <span>·</span>
          <Link href="/privacy" className="hover:text-slate-600 transition-colors">
            Privacy Policy
          </Link>
          <span>·</span>
          <Link href="/contact" className="hover:text-slate-600 transition-colors">
            Contact Support
          </Link>
        </div>
      </div>
    </div>
  );
}
