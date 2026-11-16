"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Banknote, Gift, Scale, Users } from "lucide-react";
import { BackLink, PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";

export type ProPart = "people" | "payments" | "limits" | "trial";
const PARTS: { id: ProPart; href: string; label: string; icon: typeof Users }[] = [
  { id: "people", href: "/admin/pro/people", label: "People", icon: Users },
  { id: "payments", href: "/admin/pro/payments", label: "Payments", icon: Banknote },
  { id: "limits", href: "/admin/pro/limits", label: "Limits", icon: Scale },
  { id: "trial", href: "/admin/pro/trial", label: "Free month", icon: Gift },
];

/** The top of every Pro plan sub page: back to the overview, the page title, and chips to jump between the four parts. */
export function ProSubHeader({ active, title, description }: { active: ProPart; title: string; description: string }) {
  const [waiting, setWaiting] = useState(0);
  useEffect(() => {
    let live = true;
    fetch("/api/admin/payments").then((r) => r.json()).then((j) => { if (live && Array.isArray(j.pending)) setWaiting(j.pending.length); }).catch(() => {});
    return () => { live = false; };
  }, []);
  return (
    <>
      <BackLink href="/admin/pro">Pro plan</BackLink>
      <PageHeader title={title} description={description} />
      <nav aria-label="Pro plan sections" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <ul className="flex gap-2">
          {PARTS.map(({ id, href, label, icon: Icon }) => {
            const on = id === active;
            return (
              <li key={id}>
                <Link href={href} aria-current={on ? "page" : undefined} data-testid={`pro-chip-${id}`}
                  className={cn("inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full px-4 text-[14.5px] font-extrabold", on ? "bg-primary text-primary-foreground" : "border bg-card text-foreground/80 hover:bg-accent")}>
                  <Icon className="h-4 w-4" aria-hidden="true" />{label}
                  {id === "payments" && waiting > 0 && <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11.5px] text-white" data-testid="pro-chip-waiting">{waiting}<span className="sr-only"> waiting</span></span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
