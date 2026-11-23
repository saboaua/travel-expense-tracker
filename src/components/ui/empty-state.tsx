import type { LucideIcon } from "lucide-react";
import { IconTile } from "@/components/ui/icon-tile";
import type { IconTone } from "@/lib/icon-tones";
import { cn } from "@/lib/utils";

/**
 * The one empty state of a list: a coloured icon, a short title, one line that says what to do, and one button that names what it adds.
 * `children` is the line; `action` is the button (a Button or a Link around one).
 */
export function EmptyState({ icon: Icon, tone, title, children, action, className, testId }: { icon: LucideIcon; tone: IconTone; title: string; children?: React.ReactNode; action?: React.ReactNode; className?: string; testId?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-5 py-10 text-center", className)} data-testid={testId}>
      <IconTile tone={tone} className="h-14 w-14 rounded-2xl"><Icon className="h-7 w-7" /></IconTile>
      <h2 className="text-base font-semibold">{title}</h2>
      {children && <p className="max-w-xs text-sm text-muted-foreground">{children}</p>}
      {action}
    </div>
  );
}
