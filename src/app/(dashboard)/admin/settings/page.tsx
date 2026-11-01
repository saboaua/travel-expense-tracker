"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Palette, Coins, Send, Tag, Users } from "lucide-react";

const sections = [
  {
    href: "/admin/branding",
    title: "Branding",
    description: "App name, logo, and primary color.",
    icon: Palette,
  },
  {
    href: "/admin/currencies",
    title: "Currencies",
    description: "Enable, disable, and order available currencies.",
    icon: Coins,
  },
  {
    href: "/admin/categories",
    title: "Categories",
    description: "Manage expense categories used across the app.",
    icon: Tag,
  },
  {
    href: "/admin/telegram",
    title: "Telegram",
    description: "Bot token and notification settings.",
    icon: Send,
  },
  {
    href: "/admin/users",
    title: "User Roles & Users",
    description: "Create users and manage roles.",
    icon: Users,
  },
];

export default function AdminSettingsPage() {
  return (
    <div className="p-4 md:p-8 pb-24 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">App Settings</h1>
        <p className="text-muted-foreground mt-1">
          Configure branding, currencies, categories, Telegram, and user roles.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {sections.map((s) => {
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
