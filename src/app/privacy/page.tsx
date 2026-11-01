import type { Metadata } from "next";
import { PublicShell } from "@/components/PublicShell";
import { getPublicBranding } from "@/lib/public-branding";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Privacy Policy" };

export default async function PrivacyPage() {
  const branding = await getPublicBranding();
  const text = branding.privacy_policy?.trim();

  return (
    <PublicShell branding={branding} title="Privacy Policy">
      {text ? (
        <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{text}</div>
      ) : (
        <p className="text-sm text-slate-500">The privacy policy has not been published yet.</p>
      )}
    </PublicShell>
  );
}
