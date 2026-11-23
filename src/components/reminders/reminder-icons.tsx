import { BedDouble, Bell, Briefcase, Car, CreditCard, Droplets, Gift, Heart, Home, KeyRound, Lightbulb, PawPrint, Phone, Pill, Plane, Recycle, Shirt, ShoppingCart, Sparkles, Sprout, Star, Trash2, UtensilsCrossed, Wrench, type LucideIcon } from "lucide-react";
import { colorHex, type REMINDER_ICONS } from "@/lib/reminders";

export const ICON_MAP: Record<(typeof REMINDER_ICONS)[number], LucideIcon> = {
  bell: Bell, cart: ShoppingCart, home: Home, car: Car, heart: Heart, briefcase: Briefcase, plane: Plane, gift: Gift, pill: Pill, phone: Phone, card: CreditCard, star: Star,
  trash: Trash2, plant: Sprout, laundry: Shirt, dishes: UtensilsCrossed, clean: Sparkles, tools: Wrench, bulb: Lightbulb, water: Droplets, paw: PawPrint, bed: BedDouble, recycle: Recycle, key: KeyRound,
};
export const iconFor = (id: string): LucideIcon => (ICON_MAP as Record<string, LucideIcon>)[id] ?? Bell;

/** The round badge of a reminder: its icon in its colour. */
export function ReminderBadge({ icon, color, size = "md" }: { icon: string; color: string; size?: "md" | "lg" }) {
  const Icon = iconFor(icon);
  const hex = colorHex(color);
  return (
    <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-full ${size === "lg" ? "h-14 w-14" : "h-10 w-10"}`} style={{ backgroundColor: `${hex}26`, color: hex }}>
      <Icon className={size === "lg" ? "h-7 w-7" : "h-5 w-5"} />
    </span>
  );
}
