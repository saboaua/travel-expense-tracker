"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadDismissed, rememberDismissed, type Dismissed } from "@/lib/dismissed";
import { SNOOZE_DAYS } from "@/lib/notifications";
import { RecapView } from "@/components/personal/RecapView";
import { fetchRecap } from "@/lib/personal/recap-data";
import { inRecapWindow, recapMonth, type Recap } from "@/lib/personal/recap";
import { useCachedQuery } from "@/lib/use-cached-query";
import { todayISO } from "@/lib/utils";

/** The card is only on the first days of a month, so nothing is loaded the rest of the month. */
export function RecapCard() {
  if (!inRecapWindow(todayISO())) return null;
  return <RecapCardInner />;
}

function RecapCardInner() {
  const month = recapMonth(todayISO());
  const key = `recap:${month}`;
  const q = useCachedQuery<{ recap: Recap | null }>((uid) => `${uid}:recap:${month}`, async (sb) => {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return { data: null, error: new Error("Sign in again to see this.") };
    return fetchRecap(sb, session.user.id, month);
  }, [month]);
  const [dismissed, setDismissed] = useState<Dismissed | null>(null);
  useEffect(() => { void loadDismissed(createClient()).then(setDismissed); }, []);

  const recap = q.data?.recap;
  const at = dismissed?.[key];
  const hidden = dismissed == null || (at != null && Date.now() - at < SNOOZE_DAYS * 86_400_000);
  if (!recap || hidden) return null;
  return <RecapView recap={recap} onDismiss={() => { setDismissed((d) => ({ ...(d ?? {}), [key]: Date.now() })); void rememberDismissed(createClient(), key).then(setDismissed); }} />;
}
