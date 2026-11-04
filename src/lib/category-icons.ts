import {
  Briefcase, Building2, Car, BedDouble, FileText, Fuel, GraduationCap, MapPin, Paperclip,
  Plane, Presentation, ShoppingBag, Coffee, Tag, Ticket, Train, Users, Utensils, Wrench, Phone, Gift,
  Apple, Beef, Milk, Croissant, Wheat, CupSoda, Cookie, Snowflake, SprayCan, Droplets, ShoppingBasket,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  briefcase: Briefcase,
  building: Building2,
  car: Car,
  bed: BedDouble,
  "file-text": FileText,
  fuel: Fuel,
  graduation: GraduationCap,
  "map-pin": MapPin,
  paperclip: Paperclip,
  plane: Plane,
  presentation: Presentation,
  shopping: ShoppingBag,
  coffee: Coffee,
  tag: Tag,
  ticket: Ticket,
  train: Train,
  users: Users,
  utensils: Utensils,
  wrench: Wrench,
  phone: Phone,
  gift: Gift,
  apple: Apple,
  beef: Beef,
  milk: Milk,
  croissant: Croissant,
  wheat: Wheat,
  "cup-soda": CupSoda,
  cookie: Cookie,
  snowflake: Snowflake,
  "spray-can": SprayCan,
  droplets: Droplets,
  "shopping-basket": ShoppingBasket,
};

export const ICON_KEYS = Object.keys(ICONS);

export function iconFor(key: string | null | undefined, fallback: LucideIcon = Tag): LucideIcon {
  return (key && ICONS[key]) || fallback;
}

export type CategoryOption = { name: string; icon: string | null };

export const FALLBACK_EXPENSE_CATEGORIES: CategoryOption[] = [
  { name: "Meals", icon: "utensils" },
  { name: "Transport", icon: "car" },
  { name: "Lodging", icon: "bed" },
  { name: "Fuel", icon: "fuel" },
  { name: "Office Supplies", icon: "paperclip" },
  { name: "Entertainment", icon: "ticket" },
  { name: "Other", icon: "tag" },
];

export const FALLBACK_TRAVEL_CATEGORIES: CategoryOption[] = [
  { name: "Client Meeting", icon: "users" },
  { name: "Conference", icon: "building" },
  { name: "Strategy Session", icon: "map-pin" },
  { name: "Internal Review", icon: "file-text" },
];

export const FALLBACK_GROCERY_CATEGORIES: CategoryOption[] = [
  { name: "Produce", icon: "apple" },
  { name: "Meat & Seafood", icon: "beef" },
  { name: "Dairy & Eggs", icon: "milk" },
  { name: "Bakery", icon: "croissant" },
  { name: "Pantry", icon: "wheat" },
  { name: "Beverages", icon: "cup-soda" },
  { name: "Snacks", icon: "cookie" },
  { name: "Frozen", icon: "snowflake" },
  { name: "Household", icon: "spray-can" },
  { name: "Personal Care", icon: "droplets" },
  { name: "Other", icon: "tag" },
];
