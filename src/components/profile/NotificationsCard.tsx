"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { AccordionSection } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { currentSubscription, keyToBytes, pushSupport, type PushSupport } from "@/lib/push-client";

type Prefs = { invites: boolean; shared: boolean; views: boolean; reminders: boolean };
const DEFAULTS: Prefs = { invites: true, shared: true, views: false, reminders: true };
const post = (path: string, body: unknown) => fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** Profile > Notifications: alerts on this device, and which kinds. The messages never contain card, trip or amount details. */
function testFailure(httpStatus: number | undefined, d: { reason?: string; status?: number; detail?: string }): string {
  if (httpStatus === 503 || d.reason === "not_configured") return "Alerts are not set up on the server yet. An admin needs to add the push keys.";
  if (d.reason === "no_database") return "The server cannot reach its database for alerts (the service key is missing).";
  if (d.reason === "no_devices") return "The server has no saved device for you. Turn alerts off and on again to save this device.";
  if (d.reason === "rejected") return `The phone's alert service refused the message${d.status ? ` (code ${d.status})` : ""}. Turn alerts off and on again; if it repeats, the push keys on the server may not match.`;
  if (d.reason === "error") return `The server could not send the alert: ${d.detail || "unknown error"}. ${/vapid/i.test(d.detail || "") ? "The push keys in Vercel (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT) are not valid." : ""}`.trim();
  return "Nothing was sent. Please try again.";
}

export function NotificationsCard() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [on, setOn] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  // Decided in the browser after the page loads (the server cannot know), so the first paint matches on both sides
  const [support, setSupport] = useState<PushSupport | null>(null);
  useEffect(() => { setSupport(pushSupport()); }, []);

  const load = useCallback(async () => {
    if (!support) return;
    const k = await fetch("/api/push/key", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ configured: false }));
    setConfigured(Boolean(k.configured));
    const p = await fetch("/api/push/prefs", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (p?.prefs) setPrefs({ ...DEFAULTS, ...p.prefs });
    if (support === "ok") setOn(Boolean(await currentSubscription()) && Notification.permission === "granted");
  }, [support]);
  useEffect(() => { load(); }, [load]);

  async function turnOn() {
    setBusy(true);
    setMsg(null);
    try {
      const k = await fetch("/api/push/key", { cache: "no-store" }).then((r) => r.json());
      if (!k.configured) throw new Error("Alerts are not set up on the server yet.");
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error("Alerts are blocked for this app. Switch them on in your phone's Settings, then try again.");
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(k.key) as BufferSource }));
      const r = await post("/api/push/subscribe", { subscription: sub.toJSON() });
      if (!r.ok) throw new Error("Could not save this device. Please try again.");
      setOn(true);
      setMsg({ tone: "ok", text: "Alerts are on for this device." });
    } catch (e) {
      setMsg({ tone: "bad", text: e instanceof Error ? e.message : "Could not turn alerts on." });
    } finally {
      setBusy(false);
    }
  }
  async function turnOff() {
    setBusy(true);
    setMsg(null);
    try {
      const sub = await currentSubscription();
      if (sub) { await post("/api/push/unsubscribe", { endpoint: sub.endpoint }); await sub.unsubscribe(); }
      setOn(false);
    } catch {
      setMsg({ tone: "bad", text: "Could not turn alerts off. Please try again." });
    } finally {
      setBusy(false);
    }
  }
  async function setPref(key: keyof Prefs, v: boolean) {
    const next = { ...prefs, [key]: v };
    setPrefs(next);
    const r = await post("/api/push/prefs", { prefs: next }).catch(() => null);
    if (!r?.ok) { setPrefs(prefs); setMsg({ tone: "bad", text: "Could not save. Please try again." }); }
  }
  async function test() {
    setBusy(true);
    setMsg(null);
    const r = await post("/api/push/test", {}).catch(() => null);
    const d = r?.ok ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    setMsg(r?.ok && d.sent > 0 ? { tone: "ok", text: "Sent. It should arrive in a few seconds." } : { tone: "bad", text: testFailure(r?.status, d) });
  }

  const ROWS: { key: keyof Prefs; title: string; hint: string }[] = [
    { key: "invites", title: "Invites and replies", hint: "Someone invites you, or answers your invite." },
    { key: "shared", title: "Shared with me changed", hint: "A partner shares, updates or stops sharing something with you." },
    { key: "reminders", title: "Payment and expiry reminders", hint: "A subscription is due soon, or (for admins) IPTV clients are about to expire." },
    { key: "views", title: "When someone opens my shared items", hint: "Off by default. The history always has it." },
  ];
  const status = !support ? "" : support === "ok" ? (on ? "On for this device" : "Off") : support === "needs-install" ? "Add to Home Screen first" : "Not available here";

  return (
    <AccordionSection id="notifications" title="Notifications" icon={<Bell />} summary={configured === false ? "Not set up yet" : status} description="Get a message on this device when something needs you, even when the app is closed.">
      <div className="space-y-4" data-testid="notifications-card">
        {configured === false && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">Alerts are not set up on the server yet, so they cannot be turned on. An admin needs to add the push keys.</p>}
        {support === "needs-install" && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"><strong className="font-semibold">On iPhone or iPad,</strong> add the app to your Home Screen first, then open it from there and turn alerts on.</p>}
        {support === "unsupported" && <p className="text-sm text-muted-foreground">This browser cannot show alerts. Try the installed app on your phone.</p>}

        <div className="flex items-center gap-3">
          <span className="flex-1"><span className="block font-semibold">Alerts on this device</span><span className={on ? "text-sm font-medium text-green-700 dark:text-green-400" : "text-sm text-muted-foreground"}>{status}</span></span>
          <Switch checked={on} label="Alerts on this device" disabled={busy || support !== "ok" || configured === false} onChange={(v) => (v ? turnOn() : turnOff())} />
        </div>
        {on && <Button type="button" variant="outline" className="min-h-[44px]" onClick={test} disabled={busy}>Send a test alert</Button>}
        {msg && <p role={msg.tone === "bad" ? "alert" : "status"} className={msg.tone === "bad" ? "text-sm text-destructive" : "text-sm text-green-700 dark:text-green-400"}>{msg.text}</p>}

        <p className="pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tell me about</p>
        <ul className="divide-y rounded-2xl border px-4">
          {ROWS.map((r) => (
            <li key={r.key} className="flex min-h-[72px] items-center gap-3">
              <span className="flex-1"><span className="block text-[15px] font-semibold">{r.title}</span><span className="text-[13px] text-muted-foreground">{r.hint}</span></span>
              <Switch checked={prefs[r.key]} label={r.title} onChange={(v) => setPref(r.key, v)} />
            </li>
          ))}
        </ul>
        <p className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-[13px] leading-relaxed">Messages never show card numbers, trip details or amounts. They only say that something happened.</p>
      </div>
    </AccordionSection>
  );
}
