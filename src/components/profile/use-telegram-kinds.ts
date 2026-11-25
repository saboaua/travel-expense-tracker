"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { legacyFlags, normalizeKinds, type TelegramKey, type TelegramKinds } from "@/lib/telegram-kinds";

const COLS = "enabled, trip_reminders, admin_alerts";
const CHANGED = "telegram-kinds-changed";

/**
 * Which alerts go to Telegram, and whether Telegram is connected. The Notifications card and the Telegram card both use it and
 * stay in step: a change in one reloads the other.
 */
export function useTelegramKinds() {
  const [featureOn, setFeatureOn] = useState(false);
  const [linked, setLinked] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [kinds, setKinds] = useState<TelegramKinds>(() => normalizeKinds(null, { trip_reminders: true, admin_alerts: true }));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const link = await fetch("/api/telegram/link", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (!link || link.enabled === false) { setFeatureOn(false); return; }
    setFeatureOn(true);
    setLinked(Boolean(link.linked));
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    // `kinds` exists only after migration_telegram_kinds.sql; without it the old switches decide
    let res = await supabase.from("telegram_notify_prefs").select(`${COLS}, kinds`).eq("user_id", user.id).maybeSingle();
    if (res.error) res = await supabase.from("telegram_notify_prefs").select(COLS).eq("user_id", user.id).maybeSingle();
    const row = (res.error ? null : res.data) as { enabled?: boolean; trip_reminders?: boolean; admin_alerts?: boolean; kinds?: unknown } | null;
    setEnabled(row?.enabled ?? true);
    setKinds(normalizeKinds(row?.kinds, { trip_reminders: row?.trip_reminders ?? true, admin_alerts: row?.admin_alerts ?? true }));
  }, []);

  useEffect(() => {
    void load();
    const again = () => void load();
    window.addEventListener(CHANGED, again);
    return () => window.removeEventListener(CHANGED, again);
  }, [load]);

  /** Saves the new choices; the screen shows them at once and goes back if they could not be saved. */
  const saveKinds = useCallback(async (next: TelegramKinds) => {
    const before = kinds;
    setKinds(next);
    setError(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error: err } = await supabase.from("telegram_notify_prefs").upsert({ user_id: user.id, enabled, ...legacyFlags(next), kinds: next, updated_at: new Date().toISOString() });
    if (err) {
      setKinds(before);
      setError(/kinds|column|schema/i.test(err.message) ? "Telegram choices are not set up yet. Run the latest migration in Supabase." : "Could not save. Please try again.");
      return;
    }
    window.dispatchEvent(new Event(CHANGED));
  }, [kinds, enabled]);

  const setKind = useCallback((key: TelegramKey, value: boolean) => saveKinds({ ...kinds, [key]: value }), [kinds, saveKinds]);

  const setMaster = useCallback(async (value: boolean) => {
    setEnabled(value);
    setError(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error: err } = await supabase.from("telegram_notify_prefs").upsert({ user_id: user.id, enabled: value, ...legacyFlags(kinds), updated_at: new Date().toISOString() });
    if (err) { setEnabled(!value); setError("Could not save. Please try again."); return; }
    window.dispatchEvent(new Event(CHANGED));
  }, [kinds]);

  return { featureOn, linked, enabled, kinds, error, setKind, saveKinds, setMaster };
}
