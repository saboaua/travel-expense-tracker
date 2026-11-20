import Link from "next/link";
import { ChevronRight, FileText } from "lucide-react";

/** Where the details for entry cards (the Aruba re-entry card) are kept. */
export function EntryCardLink() {
  return (
    <Link href="/profile/entry-card" className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileText className="h-5 w-5" aria-hidden /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">Details for entry cards</span>
        <span className="block text-xs text-muted-foreground">Saved once for your Aruba re-entry card. Private to you.</span>
      </span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
    </Link>
  );
}
