import type { IconTone } from "@/lib/icon-tones";

/** The tools inside Global Settings > Directory, in the order they are listed. */
export const SUPERMARKET_TOOLS = [
  { id: "doit", href: "/admin/supermarkets/doit", title: "Do it Aruba Prices", sub: "Import the Do it price list from Excel", tone: "shop" as IconTone },
  { id: "places", href: "/admin/supermarkets/places", title: "Directory Places", sub: "Stores by category, GPS points, add a place", tone: "place" as IconTone },
  { id: "community", href: "/admin/supermarkets/community", title: "Community Prices Import", sub: "Add prices from Excel, they show as Confirmed", tone: "shop" as IconTone },
] as const;

/** The tools inside Global Settings > Pro plan (shown as the count on its card). */
export const PRO_TOOL_COUNT = 5;
