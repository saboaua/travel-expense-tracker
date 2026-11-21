import Link from "next/link";
import { ArrowLeft, Plane } from "lucide-react";
import type { PublicBranding } from "@/lib/public-branding";

export function PublicShell({
  branding,
  title,
  subtitle,
  children,
  back,
  brandInCard,
}: {
  branding: PublicBranding;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** A back link above the card, in the same style as the other pages */
  back?: { href: string; label: string };
  /** Put the logo and name centred inside the white card instead of above it */
  brandInCard?: boolean;
}) {
  const brand = (
    <>
      {branding.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={branding.logo_url} alt={branding.app_name} className={brandInCard ? "h-[68px] w-auto max-w-[200px] object-contain" : "h-10 w-auto max-w-[160px] object-contain"} />
      ) : (
        <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: branding.primary_color }}>
          <Plane className="h-5 w-5 text-white" />
        </div>
      )}
      <span className={`font-semibold text-slate-900 dark:text-slate-100${brandInCard && branding.logo_url ? " -mt-3" : ""}`}>{branding.app_name}</span>
    </>
  );
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 p-4 sm:p-8">
      <div className="mx-auto w-full max-w-2xl">
        {back && (
          <Link href={back.href} className="mb-2 inline-flex min-h-11 items-center gap-2 text-sm text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {back.label}
          </Link>
        )}
        {!brandInCard && <Link href="/login" className="mb-6 flex items-center gap-3">{brand}</Link>}

        <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl shadow-blue-900/5 dark:shadow-black/40 sm:p-10">
          {brandInCard && (
            <Link href="/login" className="mb-6 flex flex-col items-center gap-1.5 border-b border-slate-100 pb-5 text-center dark:border-slate-800">{brand}</Link>
          )}
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>

        <div className="mt-6 flex items-center justify-center gap-3 text-xs text-slate-400">
          <Link href="/login" className="hover:text-slate-600 dark:hover:text-slate-300">
            Back to sign in
          </Link>
          <span>·</span>
          <Link href="/privacy" className="hover:text-slate-600 dark:hover:text-slate-300">
            Privacy Policy
          </Link>
          <span>·</span>
          <Link href="/contact" className="hover:text-slate-600 dark:hover:text-slate-300">
            Contact Support
          </Link>
        </div>
      </div>
    </div>
  );
}
