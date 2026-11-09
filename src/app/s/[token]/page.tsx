import type { Metadata } from "next";
import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { rateLimit } from "@/lib/rate-limit";
import { cleanCustomerView } from "@/lib/iptv";
import { todayISO } from "@/lib/utils";
import { ClientSubscription } from "@/components/iptv/ClientSubscription";

export const dynamic = "force-dynamic";
// A private link: keep it out of search engines and do not pass it on in the Referer header
export const metadata: Metadata = { title: "My subscriptions", robots: { index: false, follow: false }, referrer: "no-referrer" };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-screen max-w-xl space-y-4 p-4 pt-8 md:p-8">
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">My subscriptions</h1>
      {children}
    </main>
  );
}

export default async function ClientLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  // Guessing addresses is the only attack on a link: slow it down per visitor
  if (!(await rateLimit(`client-link:${ip}`, 60, 600))) return <Shell><p className="text-sm text-muted-foreground">Too many tries. Please wait a few minutes.</p></Shell>;
  const unavailable = <Shell><p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">This link is not available. Ask your provider for a new one.</p></Shell>;
  if (!/^[0-9a-f]{32,64}$/i.test(token) || !process.env.SUPABASE_SERVICE_ROLE_KEY) return unavailable;
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data } = await db.rpc("iptv_public_view", { p_token: token });
  const view = cleanCustomerView(data);
  if (!view) return unavailable;
  return <Shell><ClientSubscription view={view} today={todayISO()} /></Shell>;
}
