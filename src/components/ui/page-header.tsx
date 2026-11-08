import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/** The one page header: title, a line of help, and the page's main action on the right (below on a phone). */
export function PageHeader({ title, description, actions, className }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3 [&>*]:max-sm:w-full">{actions}</div>}
    </div>
  );
}

/** The one back link: an arrow and the name of the page it goes to ("Trips", not "Back to trips"). */
export function BackLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex min-h-9 items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground", className)}>
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {children}
    </Link>
  );
}
