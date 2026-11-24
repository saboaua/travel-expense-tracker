import Link from "next/link";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/** The one look for a list section on Home: a card, the title on the left and See all on the right, rows below. */
export const seeAllClass = "inline-flex min-h-11 shrink-0 items-center rounded-lg px-2 text-sm font-semibold text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

export function SectionCard({ id, testId, title, href, seeAll = "See all", seeAllTestId, className, children }: {
  /** Heading id; the section is labelled by it */
  id: string;
  testId?: string;
  title: string;
  href: string;
  seeAll?: string;
  seeAllTestId?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} data-testid={testId} className={cn("rounded-2xl border bg-card p-4 shadow-sm", className)}>
      <div className="-mt-1 flex items-center justify-between gap-2">
        <h2 id={id} className="text-lg font-bold">{title}</h2>
        <Link href={href} className={seeAllClass} data-testid={seeAllTestId}>{seeAll}</Link>
      </div>
      {children}
    </section>
  );
}

/** What an empty section shows: the same dashed tile everywhere. */
export function EmptyTile({ href, title, text }: { href: string; title: string; text: string }) {
  return (
    <Link href={href} className="mt-1 flex min-h-[5.5rem] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-3 text-center text-muted-foreground transition-colors hover:border-primary hover:text-foreground">
      <Plus className="h-5 w-5 text-primary" aria-hidden="true" />
      <span className="text-sm font-semibold text-foreground">{title}</span>
      <span className="text-xs">{text}</span>
    </Link>
  );
}
