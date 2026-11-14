import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import { FEATURES, IconTile, Waves } from "@/components/login/LoginArt";
import { firstNameOf, isInviteCode } from "@/lib/invite";
import { getPublicBranding } from "@/lib/public-branding";

export const dynamic = "force-dynamic";
const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-login-display" });
const body = Figtree({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-login-body" });

// The preview a friend sees in WhatsApp or Messages never names the person who shared
export async function generateMetadata(): Promise<Metadata> {
  const b = await getPublicBranding();
  return {
    title: `${b.app_name}: every trip, receipt and bill, in one place`,
    description: "Trips and flights, receipts, groceries, bills, savings and documents in one app. Ask for an account to try it.",
    robots: { index: false, follow: false },
    openGraph: { title: `${b.app_name}: every trip, receipt and bill, in one place`, description: "Trips and flights, receipts, groceries, bills, savings and documents in one app." },
  };
}

/** The first name of whoever shared this link, only if they allow it. Never anything else about them. */
async function recommender(code: string): Promise<string> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return "";
  try {
    const db = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: link } = await db.from("invite_links").select("user_id, show_name").eq("code", code).maybeSingle();
    if (!link || link.show_name === false) return "";
    const { data: p } = await db.from("profiles").select("first_name, full_name").eq("id", link.user_id).maybeSingle();
    return firstNameOf(p?.first_name as string | null, p?.full_name as string | null);
  } catch {
    return "";
  }
}

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!isInviteCode(code)) notFound();
  const [name, branding] = await Promise.all([recommender(code), getPublicBranding()]);
  const color = branding.primary_color;
  const request = `/login?ref=${code}&request=1`;
  return (
    <div className={`${display.variable} ${body.variable} min-h-screen bg-white font-[family-name:var(--font-login-body)] text-slate-900`}>
      <div className="relative mx-auto flex min-h-screen max-w-[460px] flex-col">
        <div className="relative h-[290px] shrink-0 overflow-hidden bg-gradient-to-b from-[#0A2540] via-[#0B4F8A] to-[#0E7FA8]">
          <Waves />
          <div className="absolute inset-x-0 top-12 flex flex-col items-center gap-2">
            <b className="font-[family-name:var(--font-login-display)] text-2xl tracking-tight text-white">{branding.app_name}</b>
          </div>
          <div className="absolute inset-x-6 top-[118px] text-center">
            {name && <span data-testid="invite-name" className="inline-block rounded-full border border-white/30 bg-white/15 px-3.5 py-1.5 text-sm font-semibold text-white">{name} recommends {branding.app_name}</span>}
            <h1 className="mt-3 font-[family-name:var(--font-login-display)] text-[27px] font-extrabold leading-[1.1] tracking-tight text-white">Every trip, receipt and bill, in one place.</h1>
          </div>
        </div>
        <div className="relative z-10 -mt-7 px-4 pb-6">
          <div className="space-y-4 rounded-[26px] bg-white p-5 shadow-[0_18px_44px_rgba(10,37,64,.18)]">
            {FEATURES.slice(0, 4).map((f) => (
              <div key={f.title} className="flex items-center gap-3">
                <IconTile kind={f.kind} size={40} />
                <div><b className="block text-[15px]">{f.title}</b><span className="block text-[13px] text-slate-500">{f.text}</span></div>
              </div>
            ))}
            <Link href={request} data-testid="invite-request" className="flex h-[52px] w-full items-center justify-center gap-2 rounded-[15px] text-base font-bold text-white hover:brightness-110" style={{ backgroundColor: color, boxShadow: `0 10px 22px ${color}52, inset 0 1px 0 rgba(255,255,255,.35)` }}>
              Request an account <ArrowRight className="h-[18px] w-[18px]" />
            </Link>
            <p className="text-center text-sm text-slate-600">Already have an account? <Link href="/login" className="font-semibold" style={{ color }}>Sign in</Link></p>
          </div>
          <p className="mt-6 text-center text-[12.5px] leading-snug text-slate-500">{branding.app_name} is by invitation. An administrator reviews every request.</p>
        </div>
      </div>
    </div>
  );
}
