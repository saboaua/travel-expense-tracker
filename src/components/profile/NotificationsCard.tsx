"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { AccordionSection } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAccess } from "@/lib/use-access";
import { currentSubscription, keyToBytes, pushSupport, type PushSupport } from "@/lib/push-client";
import { DEFAULT_PUSH_SETTINGS, hourLabel, type PushDetail, type PushPref, type PushSettings } from "@/lib/push-prefs";
import { Select } from "@/components/ui/select";

type Prefs = PushSettings;
const DEFAULTS: Prefs = DEFAULT_PUSH_SETTINGS;
type Row = { key: PushPref; title: string; hint: string; example?: string; isNew?: boolean };
type Group = { title: string; rows: Row[] };
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const post = (path: string, body: unknown) => fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** Profile > Notifications: alerts on this device, how much a message shows, which kinds, and quiet hours. Messages never contain amounts, card or document numbers or confirmation codes. */
function testFailure(httpStatus: number | undefined, d: { reason?: string; status?: number; detail?: string }): string {
  if (httpStatus === 503 || d.reason === "not_configured") return "Alerts are not set up on the server yet. An admin needs to add the push keys.";
  if (d.reason === "no_database") return "The server cannot reach its database for alerts (the service key is missing).";
  if (d.reason === "no_devices") return "The server has no saved device for you. Turn alerts off and on again to save this device.";
  if (d.reason === "rejected") return `The phone's alert service refused the message${d.status ? ` (code ${d.status})` : ""}. Turn alerts off and on again; if it repeats, the push keys on the server may not match.`;
  if (d.reason === "error") return `The server could not send the alert: ${d.detail || "unknown error"}. ${/^vapid /i.test(d.detail || "") ? "The push keys in Vercel (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT) are not valid." : ""}`.trim();
  return "Nothing was sent. Please try again.";
}

export function NotificationsCard() {
  const { role } = useAccess();
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
  /** Saves one change; the screen shows it at once and goes back if it could not be saved. */
  async function change(patch: Partial<Prefs>) {
    const before = prefs;
    setPrefs({ ...prefs, ...patch });
    const r = await post("/api/push/prefs", { prefs: patch }).catch(() => null);
    if (!r?.ok) { setPrefs(before); setMsg({ tone: "bad", text: "Could not save. Please try again." }); }
  }
  async function test() {
    setBusy(true);
    setMsg(null);
    const r = await post("/api/push/test", {}).catch(() => null);
    const d = r?.ok ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    setMsg(r?.ok && d.sent > 0 ? { tone: "ok", text: "Sent. It should arrive in a few seconds." } : { tone: "bad", text: testFailure(r?.status, d) });
  }

  const GROUPS: Group[] = [
    { title: "Trips and travel", rows: [
      { key: "trips", title: "Trip coming up", hint: "3 days and 1 day before a trip starts.", example: "\u201cWinlott Meeting starts tomorrow (Nov 17). Flight CM 312 leaves AUA at 9:45 AM.\u201d" },
      { key: "flights", title: "Flight changes", hint: "Tells you a flight on your trip changed. Wording unchanged for now.", example: "\u201cA flight on your trip changed. Open the app to check it.\u201d" },
      { key: "flightTomorrow", title: "Flight tomorrow", hint: "One reminder the day before you fly.", example: "\u201cFlight tomorrow: CM 312 AUA to PTY, 9:45 AM.\u201d", isNew: true },
      { key: "afterTrip", title: "After the trip", hint: "One reminder to add the last receipts and mark the trip completed.", example: "\u201cWinlott Meeting ended. Add your last receipts.\u201d", isNew: true },
    ] },
    { title: "Money and papers", rows: [
      { key: "reminders", title: "Subscription payments", hint: "Before a payment is due, in the days you chose.", example: "\u201cNetflix is due in 3 days (Nov 14).\u201d" },
      { key: "documents", title: "Document expiry", hint: "Passport, visa and ID, well before they expire.", example: "\u201cYour passport expires in 60 days (Jan 9, 2027).\u201d", isNew: true },
    ] },
    { title: "Sharing", rows: [
      { key: "invites", title: "Invites and replies", hint: "Someone invites you, or answers your invite.", example: "\u201cAlice invited you to share.\u201d" },
      { key: "shared", title: "Shared with me changed", hint: "A partner shares, updates or stops sharing.", example: "\u201cAlice shared the trip Winlott Meeting with you.\u201d" },
      { key: "views", title: "When someone opens what I shared", hint: "Off by default. The history always has it." },
    ] },
    ...(role === "admin" ? [{ title: "Admin only", rows: [
      { key: "support" as const, title: "Support requests", hint: "A message from the contact form." },
      { key: "iptv" as const, title: "IPTV clients expiring", hint: "Within 15 days.", example: "\u201c3 IPTV clients expire within 15 days. First: Nov 20.\u201d" },
    ] }] : []),
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

        <Section title="What the message shows">
          <div className="grid gap-2.5 md:grid-cols-2" role="radiogroup" aria-label="What the message shows">
            <StyleChoice id="details" current={prefs.detail} onPick={(d) => change({ detail: d })} title="Show details" sub="Names, dates and times. Easier to act on." sample="CM 312 leaves AUA tomorrow at 9:45 AM." />
            <StyleChoice id="private" current={prefs.detail} onPick={(d) => change({ detail: d })} title="Keep it private" sub="Only says that something happened. Nothing on the lock screen." sample="You have a flight tomorrow. Open the app to check it." />
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">Either way, messages never show amounts, card numbers, document numbers or confirmation codes.</p>
        </Section>

        {GROUPS.map((g) => (
          <Section key={g.title} title={g.title}>
            <ul className="divide-y rounded-2xl border px-4" data-testid={`push-group-${g.title.toLowerCase().replace(/\W+/g, "-")}`}>
              {g.rows.map((r) => (
                <li key={r.key} className="flex items-start gap-3 py-3.5">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2"><span className="text-[15px] font-semibold">{r.title}</span>{r.isNew && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-900 dark:bg-blue-500/20 dark:text-blue-200">New</span>}</span>
                    <span className="mt-0.5 block text-[13px] text-muted-foreground">{r.hint}</span>
                    {r.example && <span className="mt-1.5 block rounded-lg bg-muted px-2.5 py-1.5 text-[13px] leading-snug text-foreground/80">{r.example}</span>}
                  </span>
                  <Switch checked={prefs[r.key]} label={r.title} onChange={(v) => change({ [r.key]: v } as Partial<Prefs>)} />
                </li>
              ))}
            </ul>
          </Section>
        ))}

        <Section title="Quiet hours">
          <div className="space-y-3 rounded-2xl border p-4" data-testid="push-quiet">
            <div className="flex items-start gap-3">
              <span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold">Pause alerts at night</span><span className="block text-[13px] text-muted-foreground">Held until morning, then sent with the daily check.</span></span>
              <Switch checked={prefs.quiet.on} label="Pause alerts at night" onChange={(v) => change({ quiet: { ...prefs.quiet, on: v } })} />
            </div>
            {prefs.quiet.on && (
              <div className="grid grid-cols-2 gap-2.5">
                <label className="block text-[13px] text-muted-foreground">From
                  <Select className="mt-1 h-11" value={prefs.quiet.start} onChange={(e) => change({ quiet: { ...prefs.quiet, start: Number(e.target.value) } })} aria-label="Quiet hours from">{HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}</Select>
                </label>
                <label className="block text-[13px] text-muted-foreground">Until
                  <Select className="mt-1 h-11" value={prefs.quiet.end} onChange={(e) => change({ quiet: { ...prefs.quiet, end: Number(e.target.value) } })} aria-label="Quiet hours until">{HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}</Select>
                </label>
              </div>
            )}
          </div>
        </Section>
      </div>
    </AccordionSection>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="pb-2 pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

function StyleChoice({ id, current, onPick, title, sub, sample }: { id: PushDetail; current: PushDetail; onPick: (d: PushDetail) => void; title: string; sub: string; sample: string }) {
  const on = current === id;
  return (
    <button type="button" role="radio" aria-checked={on} onClick={() => onPick(id)} data-testid={`push-style-${id}`}
      className={`rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${on ? "border-2 border-primary bg-primary/5" : "bg-card hover:bg-accent"}`}>
      <span className="flex items-center gap-2.5">
        <span className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 ${on ? "border-primary" : "border-muted-foreground/60"}`} aria-hidden="true">{on && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}</span>
        <span><span className="block text-[15px] font-bold">{title}</span><span className="block text-[13px] text-muted-foreground">{sub}</span></span>
      </span>
      <span className="mt-2.5 flex items-start gap-2 rounded-2xl border bg-muted/60 p-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground" aria-hidden="true"><Bell className="h-4 w-4" /></span>
        <span className="text-[13px] leading-snug"><span className="block font-semibold">Lifolio</span>{sample}</span>
      </span>
    </button>
  );
}
