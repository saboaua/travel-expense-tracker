"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAccess } from "@/lib/use-access";
import { IconTile } from "@/components/ui/icon-tile";
import type { IconTone } from "@/lib/icon-tones";
import { PRO_TOOL_COUNT, SUPERMARKET_TOOLS } from "@/lib/admin-tools";
import { Palette, Coins, Send, Tag, Users, LifeBuoy, CircleHelp, Tv, ShoppingCart, UserPlus, Crown, Images } from "lucide-react";
import { PAGE_WIDTH } from "@/components/layout/PageShell";

const sections: { href: string; feature: string; title: string; description: string; icon: typeof Palette; tone: IconTone; tools?: number }[] = [
  {
    href: "/admin/branding",
    feature: "branding.manage",
    title: "Branding",
    description: "App name, logo and size, primary color, privacy policy, and support email.",
    icon: Palette,
    tone: "brand",
    tools: 4,
  },
  {
    href: "/admin/currencies",
    feature: "currencies.manage",
    title: "Currencies",
    description: "Enable, disable, and order available currencies.",
    icon: Coins,
    tone: "money",
    tools: 2,
  },
  {
    href: "/admin/categories",
    feature: "categories.manage",
    title: "Categories",
    description: "Travel receipts and trip types, grocery items, and house areas.",
    icon: Tag,
    tone: "projects",
    tools: 3,
  },
  {
    href: "/admin/logos",
    feature: "admin.only",
    title: "Logo library",
    description: "Company logos offered when someone adds a subscription.",
    icon: Images,
    tone: "subscriptions",
  },
  {
    href: "/admin/help",
    feature: "help.manage",
    title: "Help Topics",
    description: "Write the guides users see under Help in the menu.",
    icon: CircleHelp,
    tone: "help",
  },
  {
    href: "/admin/support",
    feature: "support.view",
    title: "Support Requests",
    description: "Messages sent from the login screen contact form.",
    icon: LifeBuoy,
    tone: "support",
  },
  {
    href: "/admin/telegram",
    feature: "telegram.manage",
    title: "Telegram",
    description: "Bot token and notification settings.",
    icon: Send,
    tone: "telegram",
    tools: 2,
  },
  {
    href: "/admin/iptv",
    feature: "iptv.manage",
    title: "IPTV Clients",
    description: "Your IPTV customers: expiry dates, renewals and what each client can see.",
    icon: Tv,
    tone: "subscriptions",
  },
  {
    href: "/admin/pro",
    feature: "admin.only",
    title: "Pro plan",
    description: "People and access, prices and payments, Free limits and the free month for new accounts.",
    icon: Crown,
    tone: "badges",
    tools: PRO_TOOL_COUNT,
  },
  {
    href: "/admin/supermarkets",
    feature: "admin.only",
    title: "Directory",
    description: "Do it Aruba prices, places by category and community price imports.",
    icon: ShoppingCart,
    tone: "shop",
    tools: SUPERMARKET_TOOLS.length,
  },
  {
    href: "/admin/account-requests",
    feature: "admin.only",
    title: "Account Requests",
    description: "People who asked for an account on the sign-in screen, with how to reach them.",
    icon: UserPlus,
    tone: "invite",
  },
  {
    href: "/admin/users",
    feature: "users.manage",
    title: "User Roles & Users",
    description: "Create users, create roles and choose what each role can use.",
    icon: Users,
    tone: "people",
    tools: 2,
  },
];

export default function AdminSettingsPage() {
  const { role, perms, loaded } = useAccess();
  const [waiting, setWaiting] = useState(0);
  useEffect(() => {
    if (role !== "admin") return;
    let live = true;
    fetch("/api/admin/payments").then((r) => r.json()).then((j) => { if (live && Array.isArray(j.pending)) setWaiting(j.pending.length); }).catch(() => {});
    return () => { live = false; };
  }, [role]);
  const visible = sections.filter((s) => role === "admin" || (s.feature !== "admin.only" && perms.has(s.feature)));
  return (
    <div className={`${PAGE_WIDTH.wide} p-4 md:p-8 pb-24 space-y-6`}>
      <PageHeader title="Global Settings" description={<>Configure branding, currencies, categories, Telegram, and users.</>} />

      {loaded && visible.length === 0 && <p className="text-sm text-muted-foreground">Nothing here is available for your role.</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.href} href={s.href}>
              <Card className="h-full hover:border-primary/50 transition-colors">
                <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
                  <IconTile tone={s.tone} className="h-11 w-11"><Icon className="h-6 w-6" /></IconTile>
                  <CardTitle className="min-w-0 flex-1 text-lg">{s.title}</CardTitle>
                  {s.tools != null && <span className="rounded-full border bg-muted/60 px-2.5 py-0.5 text-xs font-semibold text-muted-foreground" data-testid={`tools-count-${s.href.split("/").pop()}`}>{s.tools} tools</span>}
                  {s.href === "/admin/pro" && waiting > 0 && <span className="rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold text-white" data-testid="pro-tile-waiting">{waiting} waiting</span>}
                </CardHeader>
                <CardContent>
                  <CardDescription>{s.description}</CardDescription>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
