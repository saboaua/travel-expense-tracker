"use client";

import { PageHeader } from "@/components/ui/page-header";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAccess } from "@/lib/use-access";
import { IconTile } from "@/components/ui/icon-tile";
import type { IconTone } from "@/lib/icon-tones";
import { Palette, Coins, Send, Tag, Users, LifeBuoy, CircleHelp, Tv, FileSpreadsheet, MapPin, UserPlus, Crown } from "lucide-react";

const sections: { href: string; feature: string; title: string; description: string; icon: typeof Palette; tone: IconTone }[] = [
  {
    href: "/admin/branding",
    feature: "branding.manage",
    title: "Branding",
    description: "App name, logo and size, primary color, privacy policy, and support email.",
    icon: Palette,
    tone: "brand",
  },
  {
    href: "/admin/currencies",
    feature: "currencies.manage",
    title: "Currencies",
    description: "Enable, disable, and order available currencies.",
    icon: Coins,
    tone: "money",
  },
  {
    href: "/admin/categories",
    feature: "categories.manage",
    title: "Categories",
    description: "Travel receipts and trip types, and grocery items.",
    icon: Tag,
    tone: "projects",
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
    href: "/admin/plans",
    feature: "admin.only",
    title: "Plans and access",
    description: "Turn Pro on or off for a person, monthly, yearly or as a gift, with an end date.",
    icon: Crown,
    tone: "badges",
  },
  {
    href: "/admin/payment-settings",
    feature: "admin.only",
    title: "Pro payments",
    description: "The Pro prices, the bank accounts and Bitcoin, and the instructions people see when they pay.",
    icon: Crown,
    tone: "badges",
  },
  {
    href: "/admin/pro-limits",
    feature: "admin.only",
    title: "Pro plan limits",
    description: "How many AI scans and documents Free gets, which features are Pro only, and the day the limits start.",
    icon: Crown,
    tone: "badges",
  },
  {
    href: "/admin/doit",
    feature: "admin.only",
    title: "Do it Aruba Prices",
    description: "Import the Do it price list from an exported Excel file for the Price tracker.",
    icon: FileSpreadsheet,
    tone: "shop",
  },
  {
    href: "/admin/supermarkets",
    feature: "admin.only",
    title: "Supermarket Places",
    description: "Import supermarket GPS points from Excel so they show on the Best store map.",
    icon: MapPin,
    tone: "place",
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
  },
];

export default function AdminSettingsPage() {
  const { role, perms, loaded } = useAccess();
  const visible = sections.filter((s) => role === "admin" || (s.feature !== "admin.only" && perms.has(s.feature)));
  return (
    <div className="p-4 md:p-8 pb-24 max-w-4xl mx-auto space-y-6">
      <PageHeader title="Global Settings" description={<>Configure branding, currencies, categories, Telegram, and users.</>} />

      {loaded && visible.length === 0 && <p className="text-sm text-muted-foreground">Nothing here is available for your role.</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        {visible.map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.href} href={s.href}>
              <Card className="h-full hover:border-primary/50 transition-colors">
                <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
                  <IconTile tone={s.tone} className="h-11 w-11"><Icon className="h-6 w-6" /></IconTile>
                  <CardTitle className="text-lg">{s.title}</CardTitle>
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
