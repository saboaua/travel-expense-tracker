import Link from "next/link";
import { Plane } from "lucide-react";
import type { PublicBranding } from "@/lib/public-branding";

export function PublicShell({
  branding,
  title,
  subtitle,
  children,
}: {
  branding: PublicBranding;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 p-4 sm:p-8">
      <div className="mx-auto w-full max-w-2xl">
        <Link href="/login" className="mb-6 flex items-center gap-3">
          {branding.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logo_url} alt={branding.app_name} className="h-10 w-auto max-w-[160px] object-contain" />
          ) : (
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ backgroundColor: branding.primary_color }}
            >
              <Plane className="h-5 w-5 text-white" />
            </div>
          )}
          <span className="font-semibold text-slate-900 dark:text-slate-100">{branding.app_name}</span>
        </Link>

        <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl shadow-blue-900/5 dark:shadow-black/40 sm:p-10">
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
