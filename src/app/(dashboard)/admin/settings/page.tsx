"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAccess } from "@/lib/use-access";
import { Palette, Coins, Send, Tag, Users, Briefcase, LifeBuoy } from "lucide-react";

const sections: { href: string; feature: string; title: string; description: string; icon: typeof Palette }[] = [
  {
    href: "/admin/branding",
    feature: "branding.manage",
    title: "Branding",
    description: "App name, logo and size, primary color, privacy policy, and support email.",
    icon: Palette,
  },
  {
    href: "/admin/currencies",
    feature: "currencies.manage",
    title: "Currencies",
    description: "Enable, disable, and order available currencies.",
    icon: Coins,
  },
  {
    href: "/admin/categories",
    feature: "categories.manage",
    title: "Receipt Categories",
    description: "Edit or create categories for travel receipts and groceries.",
    icon: Tag,
  },
  {
    href: "/admin/travel-categories",
    feature: "categories.manage",
    title: "Travel Categories",
    description: "Manage the trip types offered when creating a trip.",
    icon: Briefcase,
  },
  {
    href: "/admin/support",
    feature: "support.view",
    title: "Support Requests",
    description: "Messages sent from the login screen contact form.",
    icon: LifeBuoy,
  },
  {
    href: "/admin/telegram",
    feature: "telegram.manage",
    title: "Telegram",
    description: "Bot token and notification settings.",
    icon: Send,
  },
  {
    href: "/admin/users",
    feature: "users.manage",
    title: "User Roles & Users",
    description: "Create users, create roles and choose what each role can use.",
    icon: Users,
  },
];

export default function AdminSettingsPage() {
  const { role, perms, loaded } = useAccess();
  const visible = sections.filter((s) => role === "admin" || perms.has(s.feature));
  return (
    <div className="p-4 md:p-8 pb-24 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Global Settings</h1>
        <p className="text-muted-foreground mt-1">
          Configure branding, currencies, receipt and travel categories, Telegram, and users.
        </p>
      </div>

      {loaded && visible.length === 0 && <p className="text-sm text-muted-foreground">Nothing here is available for your role.</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        {visible.map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.href} href={s.href}>
              <Card className="h-full hover:border-primary/50 transition-colors">
                <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
                  <Icon className="h-6 w-6 text-muted-foreground" />
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
