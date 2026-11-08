"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type TabOption = { id: string; label: React.ReactNode; icon?: LucideIcon; count?: number; href?: string };

/**
 * The one tab control: a soft track with a raised selected tab. `lg` switches between views (Business / Personal,
 * Trips / Reports); `md` filters a list (All / Needs attention) and can show counts. With `href` the tabs are links.
 */
export function Tabs({ options, value, onChange, label, size = "md", fullWidth = false, semantics = "tabs", idPrefix = "tab", panelPrefix, className }: {
  options: TabOption[];
  value: string;
  onChange?: (id: string) => void;
  label: string;
  size?: "lg" | "md" | "sm";
  fullWidth?: boolean;
  semantics?: "tabs" | "group" | "nav";
  /** Tab ids are `${idPrefix}-${option id}`; with `panelPrefix` each tab also points at the panel `${panelPrefix}-${option id}` */
  idPrefix?: string;
  panelPrefix?: string;
  className?: string;
}) {
  const item = cn(
    "flex flex-1 items-center justify-center gap-2 whitespace-nowrap font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    size === "lg" && "min-h-12 rounded-xl px-6 text-[15px] sm:flex-none",
    size === "md" && "min-h-9 rounded-lg px-3.5 text-sm font-medium sm:flex-none",
    size === "sm" && "min-h-8 rounded-md px-3 text-xs font-medium sm:flex-none"
  );
  const tone = (on: boolean) => (on ? "bg-raised text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground");
  const inner = (o: TabOption, on: boolean) => (
    <>
      {o.icon && <o.icon className={cn(size === "lg" ? "h-5 w-5" : "h-4 w-4", on && "text-primary")} aria-hidden="true" />}
      {o.label}
      {o.count !== undefined && <span className="text-xs font-normal opacity-70">{o.count}</span>}
    </>
  );
  const track = cn("flex rounded-2xl bg-muted p-1", size !== "lg" && "rounded-xl", fullWidth ? "w-full" : "w-full sm:inline-flex sm:w-auto", size === "sm" && "w-auto p-0.5", className);

  if (semantics === "nav") {
    return (
      <nav aria-label={label} className={track}>
        {options.map((o) => {
          const on = o.id === value;
          return <Link key={o.id} href={o.href ?? "#"} aria-current={on ? "page" : undefined} className={cn(item, tone(on))}>{inner(o, on)}</Link>;
        })}
      </nav>
    );
  }
  return (
    <div role={semantics === "tabs" ? "tablist" : "group"} aria-label={label} className={track}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            {...(semantics === "tabs" ? { role: "tab", "aria-selected": on, id: `${idPrefix}-${o.id}`, ...(panelPrefix ? { "aria-controls": `${panelPrefix}-${o.id}` } : {}) } : { "aria-pressed": on })}
            onClick={() => onChange?.(o.id)}
            className={cn(item, tone(on))}
          >
            {inner(o, on)}
          </button>
        );
      })}
    </div>
  );
}
