"use client";

import { useState } from "react";
import { ArrowRight, Mail, Phone, User } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { cleanRequest } from "@/lib/account-requests";
import { NETWORK_MESSAGE } from "@/lib/password-policy";

/** Sign-in screen > "Request one": name and an email or phone number go to the administrators. */
export function RequestAccountForm({ primaryColor, inputCls, refCode, onBack }: { primaryColor: string; inputCls: string; refCode?: string | null; onBack: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState(""); // hidden trap for bots
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const missingContact = !!error && /email or a phone/i.test(error);
  const bad = (on: boolean) => (on ? " !border-red-400" : "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const checked = cleanRequest({ name, email, phone });
    if (!checked.ok) return setError(checked.error);
    setBusy(true);
    try {
      const res = await fetch("/api/request-account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, phone, website, ref: refCode || undefined }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "Could not send your request. Please try again."); setBusy(false); return; }
      setSent(checked.value.email || checked.value.phone || "");
    } catch {
      setError(NETWORK_MESSAGE);
    }
    setBusy(false);
  }

  if (sent !== null) {
    return (
      <div className="flex flex-col items-center gap-3 py-3 text-center" data-testid="request-sent">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 12.5 4 4 8-8.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
        <h1 className="font-[family-name:var(--font-login-display)] text-2xl font-extrabold tracking-tight">Request sent</h1>
        <p className="text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">Thank you, {name.trim().split(" ")[0]}. An administrator will contact you on {sent} to set up your account.</p>
        <button type="button" onClick={onBack} className="mt-2 flex h-[50px] w-full items-center justify-center rounded-[15px] border-[1.5px] border-[#D5E2EE] text-[15px] font-bold dark:border-slate-700">Back to sign in</button>
      </div>
    );
  }

  return (
    <>
      <h1 className="font-[family-name:var(--font-login-display)] text-[22px] font-extrabold tracking-tight lg:text-4xl">Request an account</h1>
      <p className="mt-1 hidden text-base text-slate-500 dark:text-slate-400 lg:block">Tell us how to reach you. We will set you up.</p>
      <form onSubmit={submit} className="mt-4 space-y-4 lg:mt-6" noValidate>
        {error && <Alert className="border border-red-100">{error}</Alert>}
        <div className="space-y-1.5">
          <label htmlFor="req-name" className="block text-sm font-semibold text-slate-800 dark:text-slate-200">Full name</label>
          <div className="relative"><User className="absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" /><input id="req-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" maxLength={80} className={`${inputCls} pr-4`} /></div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="req-email" className="block text-sm font-semibold text-slate-800 dark:text-slate-200">Email</label>
          <div className="relative"><Mail className="absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" /><input id="req-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" className={`${inputCls} pr-4${bad(missingContact)}`} /></div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="req-phone" className="block text-sm font-semibold text-slate-800 dark:text-slate-200">Phone number</label>
          <div className="relative"><Phone className="absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" /><input id="req-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+297 000 0000" autoComplete="tel" maxLength={30} className={`${inputCls} pr-4${bad(missingContact)}`} /></div>
          <p className="text-[12.5px] text-slate-500 dark:text-slate-400">Add an email, a phone number, or both.</p>
        </div>
        <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" value={website} onChange={(e) => setWebsite(e.target.value)} className="absolute -left-[9999px] h-0 w-0 opacity-0" name="website" />
        <button type="submit" disabled={busy} className="flex h-[52px] w-full items-center justify-center gap-2 rounded-[15px] text-base font-bold text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60" style={{ backgroundColor: primaryColor, boxShadow: `0 10px 22px ${primaryColor}52, inset 0 1px 0 rgba(255,255,255,.35)` }}>
          {busy ? "Sending..." : <>Request account<ArrowRight className="h-[18px] w-[18px]" /></>}
        </button>
        <p className="text-[12.5px] leading-relaxed text-slate-500 dark:text-slate-400">An administrator reviews every request and contacts you. Your details are used only to set up your account.</p>
        <button type="button" onClick={onBack} className="w-full text-center text-sm font-semibold" style={{ color: primaryColor }}>Back to sign in</button>
      </form>
    </>
  );
}
