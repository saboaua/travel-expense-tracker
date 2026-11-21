import { Heart, Pill, PawPrint, Gift, Car, Ticket, Shirt, Sparkles, Tag, GraduationCap, Utensils, Dumbbell, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = { heart: Heart, pill: Pill, "paw-print": PawPrint, gift: Gift, car: Car, ticket: Ticket, shirt: Shirt, sparkles: Sparkles, tag: Tag, "graduation-cap": GraduationCap, utensils: Utensils, dumbbell: Dumbbell };

/** The round tile of a receipt type: its icon on its colour. */
export function TypeIcon({ icon, color, className = "h-9 w-9" }: { icon: string; color: string; className?: string }) {
  const I = ICONS[icon] ?? Tag;
  return <span className={`flex shrink-0 items-center justify-center rounded-xl ${className}`} style={{ backgroundColor: `${color}22`, color }} aria-hidden="true"><I className="h-1/2 w-1/2" /></span>;
}
