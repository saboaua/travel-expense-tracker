"use client";

import { useEffect, useState } from "react";
import { useBrand } from "@/lib/use-brand";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAccess } from "@/lib/use-access";
import { useTelegramKinds } from "@/components/profile/use-telegram-kinds";
import { copyPhoneChoices, countOn } from "@/lib/telegram-kinds";
import { DEFAULT_PUSH_SETTINGS, type PushSettings } from "@/lib/push-prefs";

const hours = Array.from({ length: 24 }, (_, h) => h);
const label = (h: number) => `${String(h).padStart(2, "0")}:00`;
const post = (body: unknown) => fetch("/api/push/prefs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prefs: body }) });

/** Message settings for a linked Telegram account: master switch, quiet hours (the phone's), how many alerts are on and where to choose them. */
export function TelegramPrefs() {
  const { appName } = useBrand();
  const { role } = useAccess();
  const tg = useTelegramKinds();
  const [phone, setPhone] = useState<PushSettings>(DEFAULT_PUSH_SETTINGS);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/push/prefs", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.prefs) setPhone({ ...DEFAULT_PUSH_SETTINGS, ...d.prefs }); }).catch(() => {});
  }, []);

  async function saveQuiet(quiet: PushSettings["quiet"]) {
    const before = phone;
    setPhone({ ...phone, quiet });
    setError(null);
    const r = await post({ quiet }).catch(() => null);
    if (!r?.ok) { setPhone(before); setError("Could not save. Please try again."); }
  }
  async function copyChoices() {
    await tg.saveKinds(copyPhoneChoices(phone, tg.kinds));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const { on, total } = countOn(tg.kinds, role === "admin");
  const select = "h-11 rounded-lg border bg-background px-3 text-sm";
  return (
    <div className="space-y-3 rounded-lg border p-3" data-testid="telegram-prefs">
      <div className="flex min-h-11 items-center justify-between gap-3 text-sm font-medium">
        <span>Messages from the app<span className="block text-xs font-normal text-muted-foreground">Reminders, your weekly summary (Mondays) and alerts in Telegram. Receipts you send still work.</span></span>
        <Switch checked={tg.enabled} label="Messages from the app" onChange={(v) => tg.setMaster(v)} />
      </div>
      <div className={`space-y-3 ${tg.enabled ? "" : "pointer-events-none opacity-50"}`}>
        <div className="rounded-lg bg-muted p-3 text-sm" data-testid="telegram-count">
          <span className="font-semibold">{on} of {total} alerts are on for Telegram</span>
          <span className="mt-2 flex flex-wrap gap-2">
            <a href="#notifications" className="inline-flex min-h-11 items-center rounded-md border bg-background px-3 text-sm font-semibold hover:bg-accent">Choose in Notifications</a>
            <Button type="button" variant="outline" className="min-h-11" onClick={copyChoices} data-testid="telegram-copy-phone">{copied ? "Copied from your phone" : "Copy my phone choices"}</Button>
          </span>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium">Quiet hours<span className="block text-xs font-normal text-muted-foreground">Shared with your phone alerts.</span></span>
            <Switch checked={phone.quiet.on} label="Quiet hours" onChange={(v) => saveQuiet({ ...phone.quiet, on: v })} />
          </div>
          {phone.quiet.on && (
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label="Quiet hours start" value={phone.quiet.start} onChange={(e) => saveQuiet({ ...phone.quiet, start: Number(e.target.value) })} className={select}>
                {hours.map((h) => <option key={h} value={h}>{label(h)}</option>)}
              </select>
              <span>to</span>
              <select aria-label="Quiet hours end" value={phone.quiet.end} onChange={(e) => saveQuiet({ ...phone.quiet, end: Number(e.target.value) })} className={select}>
                {hours.map((h) => <option key={h} value={h}>{label(h)}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="rounded-2xl border bg-muted/60 p-3 text-[13px] leading-snug" data-testid="telegram-sample">
          <span className="block font-semibold">{appName}</span>
          {phone.detail === "private" ? "You have a flight tomorrow. Open the app to check it." : "CM 312 leaves AUA tomorrow at 9:45 AM."}
          <span className="mt-1 block text-xs text-muted-foreground">{phone.detail === "private" ? "Private mode is on: messages only say that something happened." : "Private mode in Notifications keeps names and dates out of these messages."}</span>
        </div>
      </div>
      {(error || tg.error) && <p role="alert" className="text-sm text-red-600">{error || tg.error}</p>}
    </div>
  );
}
