import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, ImageIcon, Mail, Shield } from "lucide-react";
import { BackLink, PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { CheckForUpdates } from "@/components/about/CheckForUpdates";
import { getBrand } from "@/lib/brand-icon";
import { aboutInfo } from "@/lib/about";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "About" };

export default async function AboutPage() {
  const brand = await getBrand();
  const info = aboutInfo(process.env.NEXT_PUBLIC_APP_VERSION, process.env.NEXT_PUBLIC_BUILD_ID, process.env.NEXT_PUBLIC_BUILD_TIME);
  const name = brand.appName || "Lifolio";
  const line = "flex items-center justify-between border-t py-3 text-[15px] first:border-t-0";

  return (
    <div className="mx-auto max-w-xl space-y-5 p-4 pb-24 md:p-8">
      <BackLink href="/">Home</BackLink>
      <PageHeader title="About" />

      <Card className="p-5">
        <div className="flex flex-col items-center text-center">
          {brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logoUrl} alt="" className="h-[68px] w-auto max-w-[160px] object-contain" data-testid="about-logo" />
          ) : (
            <span className="flex h-[68px] w-[68px] items-center justify-center rounded-[18px] border-2 border-dashed bg-muted/40 text-muted-foreground" data-testid="about-logo-placeholder"><ImageIcon className="h-9 w-9" aria-hidden="true" /></span>
          )}
          <h2 className="-mt-3 text-xl font-bold">{name}</h2>
          <p className="text-sm text-muted-foreground">Receipts, trips and money in one place</p>
          {!brand.logoUrl && <p className="mt-2 text-xs text-muted-foreground">Placeholder until an app logo is set in Admin &gt; Branding</p>}
        </div>
        <dl className="mt-3">
          <div className={line}><dt className="text-muted-foreground">Version</dt><dd className="font-semibold" data-testid="about-version">{info.version}</dd></div>
          <div className={line}><dt className="text-muted-foreground">Build</dt><dd className="font-semibold" data-testid="about-build">{info.build}</dd></div>
          {info.updated && <div className={line}><dt className="text-muted-foreground">Updated</dt><dd className="font-semibold">{info.updated}</dd></div>}
        </dl>
      </Card>

      <CheckForUpdates />

      <Card className="p-5">
        <h2 className="text-lg font-bold">Privacy</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">Your receipts, trips and money details belong to your account. Only you and the people you share with can see them. Read how your information is used and kept.</p>
        <div className="mt-2">
          <Link href="/privacy?from=about" className="flex min-h-14 items-center gap-3 border-t py-3" data-testid="about-privacy">
            <Shield className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold">Privacy policy</span><span className="block text-xs text-muted-foreground">Opens the full policy</span></span>
            <ChevronRight className="h-[18px] w-[18px] text-muted-foreground" aria-hidden="true" />
          </Link>
          <Link href="/contact" className="flex min-h-14 items-center gap-3 border-t py-3">
            <Mail className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold">Contact us</span><span className="block text-xs text-muted-foreground">Questions about your data</span></span>
            <ChevronRight className="h-[18px] w-[18px] text-muted-foreground" aria-hidden="true" />
          </Link>
        </div>
      </Card>
    </div>
  );
}
