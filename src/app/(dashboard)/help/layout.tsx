"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { ChevronRight, CircleHelp, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { groupByCategory, searchTopics } from "@/lib/help";
import { HelpProvider, useHelp } from "@/lib/use-help";

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { topics, loading, error } = useHelp();
  const [query, setQuery] = useState("");
  const onArticle = pathname !== "/help";
  const active = decodeURIComponent(pathname.split("/")[2] || "");

  const results = useMemo(() => searchTopics(topics, query), [topics, query]);
  const groups = useMemo(() => groupByCategory(results), [results]);
  const searching = query.trim().length > 0;

  const list = (
    <div className="space-y-5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search help"
          aria-label="Search help"
          className="h-11 pl-9 pr-9 text-base md:h-10 md:text-sm"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />)}</div>
      ) : error === "missing" ? (
        <Alert variant="warning">Help is not set up yet. An administrator needs to run <code>supabase/migration_help.sql</code> in the Supabase SQL Editor.</Alert>
      ) : error ? (
        <Alert>{error}</Alert>
      ) : groups.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{searching ? `Nothing found for “${query.trim()}”.` : "There are no help topics yet."}</p>
      ) : (
        groups.map((g) => (
          <section key={g.category} aria-label={g.category}>
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g.category}</h2>
            <ul className="overflow-hidden rounded-xl border bg-card">
              {g.topics.map((t) => {
                const isActive = t.slug === active;
                return (
                  <li key={t.id} className="border-b last:border-b-0">
                    <Link
                      href={`/help/${t.slug}`}
                      aria-current={isActive ? "page" : undefined}
                      className={cn("flex min-h-14 items-center gap-3 px-4 py-3 transition-colors", isActive ? "bg-primary/10" : "hover:bg-accent")}
                    >
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-sm font-medium", isActive && "text-primary")}>{t.title}{!t.published && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">Draft</span>}</span>
                        {t.summary && <span className="mt-0.5 block text-xs text-muted-foreground md:line-clamp-2">{t.summary}</span>}
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground md:hidden" aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 pb-24 md:p-8">
      <div className={cn(onArticle && "hidden md:block")}>
        <h1 className="flex items-center gap-2 text-2xl font-bold md:text-3xl"><CircleHelp className="h-7 w-7" aria-hidden="true" /> Help</h1>
        <p className="mt-1 text-muted-foreground">Short guides for getting the most out of the app.</p>
      </div>
      <div className="md:grid md:grid-cols-[19rem_minmax(0,1fr)] md:items-start md:gap-8">
        {/* Phone: the list OR the topic, one at a time. Desktop: both side by side. */}
        <nav aria-label="Help topics" className={cn("md:sticky md:top-6 md:max-h-[calc(100vh-8rem)] md:overflow-y-auto md:pr-1", onArticle && "hidden md:block")}>{list}</nav>
        <div className={cn("min-w-0", !onArticle && "hidden md:block")}>{children}</div>
      </div>
    </div>
  );
}

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return <HelpProvider><Shell>{children}</Shell></HelpProvider>;
}
