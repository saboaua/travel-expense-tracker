"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Ban, Check, ChevronLeft, Eye, Loader2, Mail, Share2, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Item = { id: string; kind: string; partner: string | null; partner_id: string | null; item: string | null; item_kind: string | null; at: string };
type Page = { items: Item[]; more: boolean; partners: { id: string; name: string }[] };

const FILTERS = [["all", "All"], ["views", "Views"], ["changes", "Changes"]] as const;
const KIND_LABEL: Record<string, string> = { loyalty_card: "Loyalty card", trip: "Trip dates", personal_trip: "Personal trip dates" };

function sentence(i: Item) {
  const who = <strong className="font-semibold">{i.partner || "Someone"}</strong>;
  const what = <strong className="font-semibold">{i.item || "an item"}</strong>;
  switch (i.kind) {
    case "view": return <>{who} {i.item_kind === "loyalty_card" ? "opened your card" : "viewed the trip"} {what}</>;
    case "share": return <>You shared {what} with {who}</>;
    case "unshare": return <>You stopped sharing {what} with {who}</>;
    case "invite": return <>You invited <strong className="font-semibold">{i.item || i.partner || "someone"}</strong></>;
    case "accept": return <>{who} accepted your invite</>;
    case "end": return <>You ended sharing with {who}</>;
    case "end_by_partner": return <>{who} ended sharing with you</>;
    default: return <>Sharing changed</>;
  }
}
const ICON: Record<string, { Icon: typeof Eye; tone: string }> = {
  view: { Icon: Eye, tone: "bg-primary/10 text-primary" },
  share: { Icon: Share2, tone: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" },
  accept: { Icon: Check, tone: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" },
  invite: { Icon: Mail, tone: "bg-primary/10 text-primary" },
  unshare: { Icon: Ban, tone: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200" },
  end: { Icon: Unlink, tone: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200" },
  end_by_partner: { Icon: Unlink, tone: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200" },
};
const dayLabel = (d: Date) => {
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(new Date()) - start(d)) / 86_400_000);
  return diff === 0 ? "Today" : diff === 1 ? "Yesterday" : d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
};

export default function SharingActivityPage() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const [partner, setPartner] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [partners, setPartners] = useState<Page["partners"]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (before: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({ filter });
      if (partner) q.set("partner", partner);
      if (before) q.set("before", before);
      const r = await fetch(`/api/sharing/activity?${q}`, { cache: "no-store" });
      const d = (await r.json().catch(() => ({}))) as Partial<Page> & { error?: string };
      if (!r.ok) throw new Error(d.error || "Could not load the history.");
      setItems((cur) => (before ? [...cur, ...(d.items ?? [])] : d.items ?? []));
      setMore(Boolean(d.more));
      if (d.partners) setPartners(d.partners);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the history.");
    } finally {
      setLoading(false);
    }
  }, [filter, partner]);
  useEffect(() => { load(null); }, [load]);

  const groups: { label: string; rows: Item[] }[] = [];
  for (const i of items) {
    const label = dayLabel(new Date(i.at));
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.rows.push(i); else groups.push({ label, rows: [i] });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 md:p-8" data-testid="sharing-activity">
      <div>
        <Link href="/profile#sharing" className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-primary"><ChevronLeft className="h-4 w-4" aria-hidden="true" /> Profile</Link>
        <h1 className="text-2xl font-bold tracking-tight">Sharing activity</h1>
        <p className="text-sm text-muted-foreground">See who looked at what you shared, and every change. Only you can see this.</p>
      </div>

      <div role="group" aria-label="Show" className="flex gap-1 rounded-2xl bg-muted p-1">
        {FILTERS.map(([k, label]) => (
          <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={cn("min-h-[44px] flex-1 rounded-xl text-sm font-medium", filter === k ? "bg-background font-semibold shadow-sm" : "text-muted-foreground")}>{label}</button>
        ))}
      </div>

      {partners.length > 1 && (
        <div className="flex gap-2 overflow-x-auto" role="group" aria-label="Person">
          {[{ id: "", name: "Everyone" }, ...partners].map((p) => {
            const on = (partner ?? "") === p.id;
            return <button key={p.id || "all"} type="button" aria-pressed={on} onClick={() => setPartner(p.id || null)} className={cn("min-h-[44px] whitespace-nowrap rounded-full border px-4 text-sm", on ? "border-primary bg-primary font-semibold text-primary-foreground" : "bg-background")}>{p.name}</button>;
          })}
        </div>
      )}

      {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

      {groups.map((g) => (
        <section key={g.label} className="space-y-2" aria-label={g.label}>
          <h2 className="pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</h2>
          <ul className="divide-y rounded-2xl border bg-card px-4">
            {g.rows.map((i) => {
              const { Icon, tone } = ICON[i.kind] ?? ICON.view;
              return (
                <li key={i.id} data-testid="activity-row" className="flex gap-3 py-3.5">
                  <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", tone)}><Icon className="h-5 w-5" aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] leading-snug">{sentence(i)}</span>
                    <span className="text-[13px] text-muted-foreground">{new Date(i.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} · {i.kind === "view" ? KIND_LABEL[i.item_kind ?? ""] ?? "Shared item" : "Change"}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {!loading && !error && items.length === 0 && <p className="rounded-2xl border-2 border-dashed p-6 text-center text-sm text-muted-foreground">Nothing yet. When a partner opens something you shared, or you change what you share, it shows up here.</p>}
      {loading && <p className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading…</p>}

      <p className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-[13px] leading-relaxed">Opening the same item more than once in an hour shows as one entry. History is kept for 12 months.</p>
      {more && !loading && <Button type="button" variant="outline" className="w-full min-h-[48px]" onClick={() => load(items[items.length - 1]?.at ?? null)}>Show older activity</Button>}
    </div>
  );
}
