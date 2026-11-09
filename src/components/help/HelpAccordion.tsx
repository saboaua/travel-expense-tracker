"use client";

import Link from "next/link";
import { Fragment } from "react";
import { ChevronDown, Pencil } from "lucide-react";
import { HelpBody } from "@/components/help/HelpBody";
import { cn, formatDate } from "@/lib/utils";
import type { HelpTopic } from "@/lib/help";

/** Wraps the words being searched for in <mark>, so the match is easy to spot in the list. Plain text in, plain elements out. */
function Highlight({ text, query }: { text: string; query: string }) {
  const words = query.trim().split(/\s+/).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return <>{text}</>;
  const parts = text.split(new RegExp(`(${words.join("|")})`, "ig"));
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? <mark key={i} className="rounded-sm bg-amber-200 px-0.5 text-inherit dark:bg-amber-500/40">{p}</mark> : <Fragment key={i}>{p}</Fragment>,
      )}
    </>
  );
}

/**
 * Desktop Help: the topics in one column, grouped by category. A topic opens in place under its title; one is open at a
 * time. Phones keep the list and the topic page, so this is only shown from the `md` breakpoint up.
 */
export function HelpAccordion({ groups, openSlug, onToggle, query, canEdit }: {
  groups: { category: string; topics: HelpTopic[] }[];
  openSlug: string;
  onToggle: (slug: string) => void;
  query: string;
  canEdit: boolean;
}) {
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <section key={g.category} aria-label={g.category}>
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g.category}</h2>
          <ul className="overflow-hidden rounded-xl border bg-card">
            {g.topics.map((t) => {
              const open = t.slug === openSlug;
              const panel = `help-panel-${t.slug}`;
              return (
                <li key={t.id} className={cn("border-b last:border-b-0", open && "bg-primary/[0.03]")}>
                  <h3>
                    <button
                      type="button"
                      id={`help-head-${t.slug}`}
                      aria-expanded={open}
                      aria-controls={panel}
                      onClick={() => onToggle(t.slug)}
                      className={cn("flex min-h-[72px] w-full items-center gap-4 px-5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary", open ? "bg-primary/10" : "hover:bg-accent")}
                    >
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-base font-semibold", open && "text-primary")}>
                          <Highlight text={t.title} query={query} />
                          {!t.published && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">Draft</span>}
                        </span>
                        {t.summary && <span className="mt-0.5 block text-sm font-normal text-muted-foreground"><Highlight text={t.summary} query={query} /></span>}
                      </span>
                      <ChevronDown className={cn("h-5 w-5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180 text-primary")} aria-hidden="true" />
                    </button>
                  </h3>
                  {open && (
                    <div id={panel} role="region" aria-labelledby={`help-head-${t.slug}`} className="space-y-4 border-t px-5 pb-5 pt-4">
                      <HelpBody body={t.body} />
                      <footer className="flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-xs text-muted-foreground">
                        <span>Updated {formatDate(t.updated_at)}</span>
                        {canEdit && (
                          <Link href={`/admin/help?edit=${encodeURIComponent(t.slug)}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit this topic
                          </Link>
                        )}
                      </footer>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
