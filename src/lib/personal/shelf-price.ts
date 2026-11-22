/**
 * Add a price you see in a shop, for the community. Pure rules (the nearest shops, what is sent, what each answer means), so they are
 * unit-tested. Only shop, product, size, price and currency leave the phone; the position is used once to pick the shop and is not sent.
 */
import { distanceKm, normStore, type LatLng } from "@/lib/personal/basket";
import { productKey, storeKey } from "@/lib/personal/community";
import { cleanName, parseSize } from "@/lib/personal/price-compare";

export type Shop = { id: string; name: string; lat: number; lng: number };
export type NearShop = Shop & { km: number };

/** "You are at ..." is only offered for a shop this close. */
export const AT_SHOP_KM = 0.3;
export const NEAR_SHOPS = 5;

/** The closest shops first. One physical shop listed twice (within 50 m, same name) counts once. */
export function nearestShops(me: LatLng, shops: Shop[], limit = NEAR_SHOPS): NearShop[] {
  const out: NearShop[] = [];
  for (const s of shops) {
    if (!s.name.trim() || !Number.isFinite(s.lat) || !Number.isFinite(s.lng)) continue;
    const km = distanceKm(me, s);
    if (out.some((o) => normStore(o.name) === normStore(s.name) && distanceKm(o, s) < 0.05)) continue;
    out.push({ ...s, km });
  }
  return out.sort((a, b) => a.km - b.km).slice(0, limit);
}

/** The shop to suggest as "You are at": the closest one, when it is within 300 m. */
export const suggestedShop = (near: NearShop[]): NearShop | null => (near[0] && near[0].km <= AT_SHOP_KM ? near[0] : null);

export const distanceLabel = (km: number): string => (km < 1 ? `${Math.max(10, Math.round(km * 100) * 10)} m` : `${(Math.round(km * 10) / 10).toFixed(1)} km`);

export type ShelfInput = { shop: string; product: string; size: string; price: number; currency: string; country: string | null; sale: boolean };
export type ShelfArgs = {
  p_store_key: string; p_store_name: string; p_product_key: string; p_product_name: string; p_size: string | null;
  p_price: number; p_currency: string; p_country: string | null; p_sale: boolean; p_force: boolean;
};
/** The only fields sent to the database. The product key is built like the one from a receipt, so the same product meets its prices. */
export const SHELF_FIELDS = ["p_store_key", "p_store_name", "p_product_key", "p_product_name", "p_size", "p_price", "p_currency", "p_country", "p_sale", "p_force"] as const;

export function shelfArgs(i: ShelfInput, force = false): ShelfArgs | null {
  const name = cleanName(i.product.trim()).slice(0, 160);
  const size = parseSize(i.size.trim() || i.product);
  if (!name || !i.shop.trim() || !(i.price > 0) || i.price >= 100000) return null;
  const cur = i.currency.toUpperCase().slice(0, 3);
  const key = productKey({ name, size: size ? size.label : null, currency: cur, unit: null });
  return {
    p_store_key: storeKey(i.shop), p_store_name: i.shop.trim().slice(0, 120), p_product_key: key, p_product_name: name,
    p_size: size ? size.label : null, p_price: Math.round(i.price * 100) / 100, p_currency: cur,
    p_country: i.country, p_sale: i.sale, p_force: force,
  };
}

/** What the database said. "check" means the price is far from what others reported, so the person is asked to look again. */
export type ShelfStatus = "ok" | "off" | "limit" | "check" | "invalid";
export const readShelfStatus = (v: unknown): ShelfStatus => (v === "ok" || v === "off" || v === "limit" || v === "check" ? v : "invalid");

export const SHELF_MESSAGE: Record<Exclude<ShelfStatus, "ok" | "check">, string> = {
  off: "Community sharing is off, so the price was not saved.",
  limit: "That is 40 prices today, the most one person can add in a day. Please try again tomorrow.",
  invalid: "That price could not be saved. Check the product and price.",
};

/** "Seen by 2 other shoppers" under a saved price (the person's own price is not counted). */
export function seenBy(reporters: number): string {
  const others = Math.max(0, Math.round(reporters) - 1);
  return others === 0 ? "New for this shop" : `Seen by ${others} other shopper${others === 1 ? "" : "s"}`;
}
