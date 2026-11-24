"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAccess } from "@/lib/use-access";
import { useSharing } from "@/lib/use-sharing";
import { activePartners } from "@/lib/sharing";
import { fromByReminder, peopleByReminder, type ReminderFromRow, type ReminderShareRow, type SharedPerson } from "@/lib/reminder-partners";

/**
 * Who each reminder is shared with (reminders you own) and who sent each reminder shared with you. Empty for a role without
 * partner sharing, and empty (never an error) while the database is missing migration_reminder_partners.sql.
 */
export function useReminderShares(): { shared: Map<string, SharedPerson[]>; from: Map<string, string>; refresh: () => Promise<void> } {
  const access = useAccess();
  const { overview } = useSharing();
  const allowed = access.loaded && access.perms.has("sharing");
  const [mine, setMine] = useState<ReminderShareRow[]>([]);
  const [sent, setSent] = useState<ReminderFromRow[]>([]);

  const refresh = useCallback(async () => {
    if (!allowed) return;
    const supabase = createClient();
    const [a, b] = await Promise.all([supabase.rpc("my_reminder_partner_shares"), supabase.rpc("reminders_shared_with_me")]);
    setMine(a.error ? [] : ((a.data ?? []) as ReminderShareRow[]));
    setSent(b.error ? [] : ((b.data ?? []) as ReminderFromRow[]));
  }, [allowed]);
  useEffect(() => { refresh(); }, [refresh]);

  const shared = useMemo(() => {
    const names = new Map(activePartners(overview).map((p) => [p.id, p.name || p.email || "Partner"]));
    return peopleByReminder(mine, names);
  }, [mine, overview]);
  const from = useMemo(() => fromByReminder(sent), [sent]);
  return { shared, from, refresh };
}
