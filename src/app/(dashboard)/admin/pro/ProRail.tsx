"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Banknote, BookOpenCheck, Gift, Scale, Users } from "lucide-react";
import { PAGE_WIDTH } from "@/components/layout/PageShell";
import { cn } from "@/lib/utils";

const PARTS = [
  { href: "/admin/pro/people", label: "People and access", icon: Users },
  { href: "/admin/pro/payments", label: "Prices and payments", icon: Banknote },
  { href: "/admin/pro/limits", label: "Free plan limits", icon: Scale },
  { href: "/admin/pro/trial", label: "Free Pro month", icon: Gift },
  { href: "/admin/pro/accounting", label: "Accounting export", icon: BookOpenCheck },
] as const;

/**
 * On a desktop the parts of the Pro plan stay listed on the left and the open part shows on the right.
 * On a phone, and on the Pro plan menu itself, this adds nothing: the menu lists every part.
 */
export function ProShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [waiting, setWaiting] = useState(0);
  useEffect(() => {
    let live = true;
    fetch("/api/admin/payments").then((r) => r.json()).then((j) => { if (live && Array.isArray(j.pending)) setWaiting(j.pending.length); }).catch(() => {});
    return () => { live = false; };
  }, []);
  const onPart = PARTS.some((p) => path === p.href || path.startsWith(`${p.href}/`));
  if (!onPart) return <>{children}</>;
  return (
    <div className={cn(PAGE_WIDTH.wide, "md:grid md:grid-cols-[17.5rem_minmax(0,1fr)]")}>
      <nav aria-label="Pro plan sections" className="sticky top-8 hidden self-start pl-8 pt-8 md:block" data-testid="pro-rail">
        <ul className="space-y-1.5">
          {PARTS.map(({ href, label, icon: Icon }) => {
            const on = path === href || path.startsWith(`${href}/`);
            return (
              <li key={href}>
                <Link href={href} aria-current={on ? "page" : undefined} data-testid={`pro-rail-${href.split("/").pop()}`}
                  className={cn("flex min-h-11 items-center gap-2.5 rounded-xl border px-3.5 text-sm font-bold", on ? "border-primary/40 bg-primary/10 text-primary" : "bg-card text-foreground/80 hover:bg-accent")}>
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">{label}</span>
                  {href.endsWith("payments") && waiting > 0 && <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-bold text-white">{waiting}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
