"use client";

import { PageHeader } from "@/components/ui/page-header";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { groupByCategory, searchTopics } from "@/lib/help";
import { HelpProvider, useHelp } from "@/lib/use-help";
import { HelpAccordion } from "@/components/help/HelpAccordion";
import { useAccess } from "@/lib/use-access";

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { topics, loading, error } = useHelp();
  const [query, setQuery] = useState("");
  const router = useRouter();
  const { perms } = useAccess();
  const onArticle = pathname !== "/help";
  const active = decodeURIComponent(pathname.split("/")[2] || "");
  // Desktop: the topic that is open in the list. It follows the address, so a link to a topic opens it.
  const [open, setOpen] = useState(active);
  useEffect(() => setOpen(active), [active]);
  const toggle = (slug: string) => {
    const next = open === slug ? "" : slug;
    setOpen(next);
    router.replace(next ? `/help/${encodeURIComponent(next)}` : "/help", { scroll: false });
  };

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

      {searching && !loading && !error && groups.length > 0 && (
        <p className="hidden text-sm text-muted-foreground md:block" role="status">{results.length} topic{results.length !== 1 ? "s" : ""} match “{query.trim()}”</p>
      )}

      {loading ? (
        <div className="space-y-2" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />)}</div>
      ) : error === "missing" ? (
        <Alert variant="warning">Help is not set up yet. An administrator needs to run <code>supabase/migration_help.sql</code> in the Supabase SQL Editor.</Alert>
      ) : error ? (
        <Alert>{error}</Alert>
      ) : groups.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{searching ? `Nothing found for “${query.trim()}”.` : "There are no help topics yet."}</p>
      ) : (
        <>
        <div className="hidden md:block">
          <HelpAccordion groups={groups} openSlug={open} onToggle={toggle} query={query} canEdit={perms.has("help.manage")} />
        </div>
        <div className="space-y-5 md:hidden">
        {groups.map((g) => (
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
        ))}
        </div>
        </>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 pb-24 md:max-w-[54rem] md:p-8">
      <PageHeader className={cn(onArticle && "hidden md:flex")} title="Help" description="Short guides for getting the most out of the app." />
      <div>
        {/* Phone: the list OR the topic, one at a time. Desktop: one list whose topics open in place. */}
        <nav aria-label="Help topics" className={cn(onArticle && "hidden md:block")}>{list}</nav>
        <div className={cn("min-w-0 md:hidden", !onArticle && "hidden")}>{children}</div>
      </div>
    </div>
  );
}

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return <HelpProvider><Shell>{children}</Shell></HelpProvider>;
}
