"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cleanClientView, type ClientView } from "@/lib/iptv";
import { todayISO } from "@/lib/utils";
import { ClientSubscription } from "@/components/iptv/ClientSubscription";

export default function MySubscriptionPage() {
  const supabase = useMemo(() => createClient(), []);
  const today = useMemo(() => todayISO(), []);
  const [views, setViews] = useState<ClientView[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    (async () => {
      const { data, error: e } = await supabase.rpc("my_iptv_subscriptions");
      if (e) return setError("Could not load your subscription. Try again in a moment.");
      setViews((Array.isArray(data) ? data : []).map(cleanClientView).filter((v): v is ClientView => !!v));
    })();
  }, [supabase]);
  return (
    <div className="mx-auto max-w-xl space-y-4 p-4 pb-28 md:p-8">
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">My subscription</h1>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!views && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
      {views && views.length === 0 && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">There is no subscription on this account right now. Contact your provider if you expected one.</p>}
      {views?.map((v, i) => <ClientSubscription key={i} view={v} today={today} />)}
    </div>
  );
}
