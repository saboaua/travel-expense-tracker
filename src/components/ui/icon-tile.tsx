import { cn } from "@/lib/utils";
import { toneStyle, type IconTone } from "@/lib/icon-tones";

/** A soft colored square with the feature's icon in full color. The color comes from the feature, so it is the same on every page. */
export function IconTile({ tone, className, children }: { tone: IconTone; className?: string; children: React.ReactNode }) {
  return <span aria-hidden="true" style={toneStyle(tone)} className={cn("tone-tile flex shrink-0 items-center justify-center rounded-xl", className)}>{children}</span>;
}
