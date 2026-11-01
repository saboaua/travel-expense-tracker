"use client";

import { useState } from "react";
import { CheckCircle } from "lucide-react";

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2";

export function ContactForm({ primaryColor, supportEmail }: { primaryColor: string; supportEmail: string | null }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, subject, message, website }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not send your message.");
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not send your message.");
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="space-y-3 py-6 text-center">
        <CheckCircle className="mx-auto h-12 w-12 text-emerald-500" />
        <p className="text-lg font-semibold text-slate-900">Message sent</p>
        <p className="text-sm text-slate-500">Thanks for reaching out. We will reply to {email}.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="c-name" className="text-sm font-medium text-slate-700">
            Name
          </label>
          <input id="c-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} autoComplete="name" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="c-email" className="text-sm font-medium text-slate-700">
            Email
          </label>
          <input id="c-email" type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={200} autoComplete="email" />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="c-subject" className="text-sm font-medium text-slate-700">
          Subject <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <input id="c-subject" className={inputClass} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="c-message" className="text-sm font-medium text-slate-700">
          How can we help?
        </label>
        <textarea id="c-message" className={`${inputClass} min-h-[140px] resize-y`} value={message} onChange={(e) => setMessage(e.target.value)} required minLength={10} maxLength={4000} />
      </div>

      {/* Honeypot: hidden from people, bots tend to fill it */}
      <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
      </div>

      {error && <p className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={sending}
        className="h-11 w-full rounded-xl text-sm font-medium text-white shadow-lg transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        style={{ backgroundColor: primaryColor, boxShadow: `0 10px 15px -3px ${primaryColor}40` }}
      >
        {sending ? "Sending..." : "Send message"}
      </button>

      {supportEmail && (
        <p className="text-center text-xs text-slate-500">
          Or email us at{" "}
          <a href={`mailto:${supportEmail}`} className="font-medium underline">
            {supportEmail}
          </a>
        </p>
      )}
    </form>
  );
}
