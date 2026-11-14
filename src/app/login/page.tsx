"use client";

import { Alert } from "@/components/ui/alert";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Turnstile } from "@/components/Turnstile";
import { Mail, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";
import { NETWORK_MESSAGE } from "@/lib/password-policy";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import { FEATURES, IconTile, Waves } from "@/components/login/LoginArt";
import { RequestAccountForm } from "@/components/login/RequestAccountForm";

const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-login-display" });
const body = Figtree({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-login-body" });

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
  const [requesting, setRequesting] = useState(false);
  const [refCode, setRefCode] = useState<string | null>(null);
  // Optional security check, shown only after repeated failures for this email
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";
  const [captchaNeeded, setCaptchaNeeded] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaRound, setCaptchaRound] = useState(0);
  const onCaptchaToken = useCallback((t: string | null) => setCaptchaToken(t), []);
  const onCaptchaError = useCallback(() => setError("The security check could not load. Please refresh and try again."), []);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [appName, setAppName] = useState("Lifolio");
  const [primaryColor, setPrimaryColor] = useState("#4f46e5");
  const [logoSize, setLogoSize] = useState(56);
  const supabase = createClient();

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("expired") === "1") setError(EXPIRED_MESSAGE);
    // Coming from a friend's invite page: open the request form and remember who recommended us
    if (q.get("request") === "1") setRequesting(true);
    const ref = q.get("ref");
    if (ref && /^[A-Z0-9]{10}$/.test(ref)) setRefCode(ref);
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

  const inputCls =
    "w-full h-[50px] pl-11 rounded-[14px] border-[1.5px] border-[#D5E2EE] dark:border-slate-700 bg-white dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 text-base placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-all";
  const brand = (size: number, light: boolean) =>
    logoUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoUrl} alt={appName} style={{ height: Math.min(logoSize, 72), width: "auto", maxWidth: "100%" }} className="object-contain" />
    ) : (
      <span className="flex items-center gap-3">
        <svg className="shrink-0" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
          <defs>
            <linearGradient id="lg-logo" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#0B63CE" />
              <stop offset="1" stopColor="#22D3EE" />
            </linearGradient>
          </defs>
          <path d="M14 4 34 12V46L14 56z" fill="url(#lg-logo)" />
          <path d="M34 30 60 40 34 58 20 52z" fill="#22D3EE" opacity=".9" />
        </svg>
        <span className={`font-[family-name:var(--font-login-display)] font-bold tracking-tight ${light ? "text-white" : "text-slate-900"}`} style={{ fontSize: size * 0.62 }}>
          {appName}
        </span>
      </span>
    );

  return (
    <div className={`${display.variable} ${body.variable} flex min-h-screen font-[family-name:var(--font-login-body)] text-slate-900 dark:text-slate-100`}>
      {/* Ocean panel, desktop only */}
      <aside className="relative hidden w-[46%] max-w-[640px] shrink-0 overflow-hidden bg-gradient-to-b from-[#0A2540] via-[#0B4F8A] to-[#0E7FA8] lg:block">
        <Waves />
        <div className="relative flex h-full flex-col px-12 py-12 xl:px-14">
          {brand(38, true)}
          <h2 className="mt-14 max-w-[470px] font-[family-name:var(--font-login-display)] text-[44px] font-extrabold leading-[1.05] tracking-tight text-white xl:text-5xl">
            Every trip, receipt and bill, in one place.
          </h2>
          <p className="mt-4 max-w-[430px] text-[17px] leading-relaxed text-white/85">
            From the flight to the groceries. {appName} keeps your travel and your household in order.
          </p>
          <ul className="mt-8 grid max-w-[520px] grid-cols-2 gap-3">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex items-center gap-3 rounded-[18px] border border-white/20 bg-white/10 p-3 backdrop-blur-sm">
                <IconTile kind={f.kind} size={44} />
                <span>
                  <span className="block text-[15px] font-bold text-white">{f.title}</span>
                  <span className="mt-px block text-[12.5px] leading-snug text-white/80">{f.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="relative flex flex-1 flex-col bg-white dark:bg-slate-950">
        {/* Sea header, phone and tablet */}
        <div className="relative h-[330px] shrink-0 overflow-hidden bg-gradient-to-b from-[#0A2540] via-[#0B4F8A] to-[#0E7FA8] lg:hidden">
          <Waves />
          <div className="absolute left-5 top-12 -rotate-[8deg]"><IconTile kind="trip" size={54} /></div>
          <div className="absolute right-5 top-11 rotate-[8deg]"><IconTile kind="receipt" size={50} /></div>
          <div className="absolute left-8 top-[124px] rotate-6"><IconTile kind="basket" size={44} /></div>
          <div className="absolute right-8 top-[120px] -rotate-6"><IconTile kind="bolt" size={44} /></div>
          <div className="absolute inset-x-0 top-14 flex justify-center">{brand(40, true)}</div>
          <h2 className="absolute inset-x-6 top-[184px] text-center font-[family-name:var(--font-login-display)] text-[26px] font-extrabold leading-[1.1] tracking-tight text-white">
            Every trip, receipt and bill, in one place.
          </h2>
        </div>

        <div className="relative z-10 -mt-12 flex flex-1 flex-col items-center px-4 pb-6 lg:mt-0 lg:justify-center lg:px-10">
          <div className="w-full max-w-[420px] rounded-[26px] bg-white p-5 shadow-[0_18px_44px_rgba(10,37,64,.18)] dark:bg-slate-900 sm:p-6 lg:rounded-none lg:bg-transparent lg:p-0 lg:shadow-none lg:dark:bg-transparent">
            {requesting ? (
              <RequestAccountForm primaryColor={primaryColor} inputCls={inputCls} refCode={refCode} onBack={() => setRequesting(false)} />
            ) : (
              <>
            <h1 className="font-[family-name:var(--font-login-display)] text-[22px] font-extrabold tracking-tight lg:text-4xl">Welcome back</h1>
            <p className="mt-1 hidden text-base text-slate-500 dark:text-slate-400 lg:block">Sign in to pick up where you left off.</p>

            <form onSubmit={handleLogin} className="mt-4 space-y-4 lg:mt-6 lg:space-y-5">
              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-sm font-semibold text-slate-800 dark:text-slate-200">Email</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
                  <input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className={`${inputCls} pr-4`} />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="password" className="block text-sm font-semibold text-slate-800 dark:text-slate-200">Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
                  <input id="password" type={showPassword ? "text" : "password"} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" className={`${inputCls} pr-12`} />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    className="absolute right-1.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-300"
                  >
                    {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <label className="flex cursor-pointer select-none items-center gap-2.5">
                  <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="h-5 w-5 rounded-md border-slate-300" style={{ accentColor: primaryColor }} />
                  <span className="text-sm text-slate-700 dark:text-slate-300">Remember me</span>
                </label>
                <Link href="/forgot-password" className="text-sm font-semibold transition-opacity hover:opacity-80" style={{ color: primaryColor }}>
                  Forgot password?
                </Link>
              </div>

              {captchaNeeded && siteKey && (
                <Turnstile key={captchaRound} siteKey={siteKey} onToken={onCaptchaToken} onError={onCaptchaError} />
              )}

              {error && <Alert className="border border-red-100">{error}</Alert>}

              <button
                type="submit"
                disabled={!ready || loading || (captchaNeeded && !captchaToken)}
                className="flex h-[52px] w-full items-center justify-center gap-2 rounded-[15px] text-base font-bold text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                style={{ backgroundColor: primaryColor, boxShadow: `0 10px 22px ${primaryColor}52, inset 0 1px 0 rgba(255,255,255,.35)` }}
              >
                {loading ? (
                  "Signing in..."
                ) : (
                  <>
                    Sign In
                    <ArrowRight className="h-[18px] w-[18px]" />
                  </>
                )}
              </button>
            </form>

            <p className="mt-6 hidden border-t border-slate-200 pt-4 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400 lg:block">
              Want an account? <button type="button" onClick={() => setRequesting(true)} className="font-semibold" style={{ color: primaryColor }}>Request one</button>
            </p>
              </>
            )}
          </div>

          {!requesting && <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400 lg:hidden">Want an account? <button type="button" onClick={() => setRequesting(true)} className="font-semibold" style={{ color: primaryColor }}>Request one</button></p>}

          <div className="mt-auto flex items-center justify-center gap-3 pt-8 text-[12.5px] text-slate-500 lg:mt-8 lg:pt-0">
            <span className="flex items-center gap-1"><Lock className="h-3 w-3" />Encrypted</span>
            <span>·</span>
            <Link href="/privacy" className="transition-colors hover:text-slate-700 dark:hover:text-slate-300">Privacy Policy</Link>
            <span>·</span>
            <Link href="/contact" className="transition-colors hover:text-slate-700 dark:hover:text-slate-300">Contact Support</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
