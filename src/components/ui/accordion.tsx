"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Setup and profile pages are long. Each block is a closed row (icon, title, one line saying what is inside, and a status
 * chip when something needs attention) that opens when tapped. Put the sections of one page inside an AccordionGroup and only
 * one is open at a time, so the page never grows long. A link such as /profile#sharing opens that section by itself.
 *
 * The body stays mounted while closed (just hidden), so anything typed in it survives closing and opening the row.
 */

type GroupCtx = { open: string | null; setOpen: (id: string | null) => void };
const Group = React.createContext<GroupCtx | null>(null);

export function AccordionGroup({ children, defaultOpen = null, className }: { children: React.ReactNode; defaultOpen?: string | null; className?: string }) {
  const [open, setOpen] = React.useState<string | null>(defaultOpen);
  const value = React.useMemo(() => ({ open, setOpen }), [open]);
  return <Group.Provider value={value}><div className={cn("space-y-3", className)}>{children}</div></Group.Provider>;
}

export type AccordionSectionProps = {
  /** Also the anchor: /page#id opens this section */
  id: string;
  title: string;
  icon?: React.ReactNode;
  /** One line shown under the title while closed (and open) */
  summary?: React.ReactNode;
  /** A small status chip on the right, for example "Connected" or "1 invite waiting" */
  badge?: { text: string; tone?: "good" | "attention" | "neutral" } | null;
  /** Explains the section; shown at the top of the opened body */
  description?: React.ReactNode;
  /** Used only outside an AccordionGroup */
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
};

const TONES = {
  good: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
  attention: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  neutral: "bg-muted text-muted-foreground",
} as const;

export function AccordionSection({ id, title, icon, summary, badge, description, defaultOpen = false, children, className }: AccordionSectionProps) {
  const group = React.useContext(Group);
  const [own, setOwn] = React.useState(defaultOpen);
  const isOpen = group ? group.open === id : own;
  const set = React.useCallback((v: boolean) => { if (group) group.setOpen(v ? id : null); else setOwn(v); }, [group, id]);
  const ref = React.useRef<HTMLElement>(null);

  // A link to #id opens this section, when the page opens and when only the hash changes
  React.useEffect(() => {
    const fromUrl = (scroll: boolean) => {
      if (typeof window === "undefined" || window.location.hash !== `#${id}`) return;
      set(true);
      if (scroll) requestAnimationFrame(() => ref.current?.scrollIntoView({ block: "start" }));
    };
    fromUrl(true);
    const onHash = () => fromUrl(true);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const btn = `${id}-header`;
  const panel = `${id}-panel`;
  return (
    <section ref={ref} id={id} className={cn("scroll-mt-20 overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm transition-colors", isOpen && "border-primary", className)}>
      <h2 className="m-0 text-base font-normal">
        <button
          type="button"
          id={btn}
          aria-expanded={isOpen}
          aria-controls={panel}
          onClick={() => set(!isOpen)}
          className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          {icon && <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-primary/10 text-primary [&>svg]:h-5 [&>svg]:w-5">{icon}</span>}
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[15px] font-semibold leading-snug">{title}</span>
            {summary ? <span className="truncate text-[13px] text-muted-foreground">{summary}</span> : null}
          </span>
          {badge && <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold", TONES[badge.tone ?? "neutral"])}>{badge.text}</span>}
          <ChevronDown aria-hidden="true" className={cn("h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200", isOpen && "rotate-180")} />
        </button>
      </h2>
      <div id={panel} role="region" aria-labelledby={btn} hidden={!isOpen} className="space-y-4 border-t px-4 pb-5 pt-4">
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        {children}
      </div>
    </section>
  );
}
