"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_PREFS, normalizePrefs, type NotifyPrefs } from "@/lib/telegram-notify";

const hours = Array.from({ length: 24 }, (_, h) => h);
const label = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** Message settings for a linked Telegram account: master switch and quiet hours. Hidden until the migration has run. */
export function TelegramPrefs() {
  const [prefs, setPrefs] = useState<NotifyPrefs>(DEFAULT_PREFS);
  const [available, setAvailable] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error: err } = await supabase.from("telegram_notify_prefs").select("enabled, trip_reminders, admin_alerts, quiet_start, quiet_end, tz, last_choice").eq("user_id", user.id).maybeSingle();
      if (err) return setAvailable(false); // migration_telegram_v2.sql has not been run yet
      setPrefs(normalizePrefs(data as Partial<NotifyPrefs> | null));
    })();
  }, []);

  const save = async (patch: Partial<NotifyPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    setError(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error: err } = await supabase.from("telegram_notify_prefs").upsert({ user_id: user.id, ...next, updated_at: new Date().toISOString() });
    if (err) setError("Could not save. Please try again.");
  };

  if (!available) return null;
  const select = "h-11 rounded-lg border bg-background px-3 text-sm";
  return (
    <div className="space-y-3 rounded-lg border p-3">
      <label className="flex min-h-11 items-center justify-between gap-3 text-sm font-medium">
        <span>Messages from the app<span className="block text-xs font-normal text-muted-foreground">Reminders and alerts in Telegram. Receipts you send still work.</span></span>
        <input type="checkbox" checked={prefs.enabled} onChange={(e) => save({ enabled: e.target.checked })} className="h-5 w-5" />
      </label>
      <div className={`flex flex-wrap items-center gap-2 text-sm ${prefs.enabled ? "" : "opacity-50"}`}>
        <span className="font-medium">Quiet hours</span>
        <select aria-label="Quiet hours start" value={prefs.quiet_start} disabled={!prefs.enabled} onChange={(e) => save({ quiet_start: Number(e.target.value) })} className={select}>
          {hours.map((h) => <option key={h} value={h}>{label(h)}</option>)}
        </select>
        <span>to</span>
        <select aria-label="Quiet hours end" value={prefs.quiet_end} disabled={!prefs.enabled} onChange={(e) => save({ quiet_end: Number(e.target.value) })} className={select}>
          {hours.map((h) => <option key={h} value={h}>{label(h)}</option>)}
        </select>
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
