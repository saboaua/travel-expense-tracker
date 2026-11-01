import type { Metadata } from "next";
import { PublicShell } from "@/components/PublicShell";
import { ContactForm } from "@/components/ContactForm";
import { getPublicBranding } from "@/lib/public-branding";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contact Support" };

export default async function ContactPage() {
  const branding = await getPublicBranding();

  return (
    <PublicShell
      branding={branding}
      title="Contact Support"
      subtitle="Send us a message and we will get back to you."
    >
      <ContactForm primaryColor={branding.primary_color} supportEmail={branding.support_email} />
    </PublicShell>
  );
}
