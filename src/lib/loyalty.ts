/**
 * Loyalty card wallet: types and the pure rules (barcode format detection and checking, card colours).
 * No I/O here, so it is unit-tested.
 */

export type BarcodeFormat = "CODE128" | "QR" | "EAN13" | "UPCA";

export const BARCODE_FORMATS: { value: BarcodeFormat; label: string }[] = [
  { value: "CODE128", label: "CODE128" },
  { value: "QR", label: "QR Code" },
  { value: "EAN13", label: "EAN-13" },
  { value: "UPCA", label: "UPC-A" },
];

export const formatLabel = (f: string) => BARCODE_FORMATS.find((x) => x.value === f)?.label ?? f;

export type LoyaltyCard = {
  id: string;
  user_id: string;
  store_name: string;
  holder_name: string | null;
  category: string | null;
  card_number: string;
  barcode_format: BarcodeFormat;
  color: string | null;
  image_path: string | null;
  /** Needs migration_loyalty_back.sql; undefined/null when absent. */
  back_image_path?: string | null;
  created_at: string;
};

export const CARD_CATEGORIES = ["Rewards", "Coffee club", "Care card", "Paw points", "Fuel savings", "Member", "Points", "Discount"];

/** Card colours: dark enough for white text (all pass 4.5:1). */
export const CARD_COLORS = ["#15803d", "#92400e", "#0e7490", "#7c3aed", "#b91c1c", "#334155", "#1d4ed8", "#be185d"];

/** A stable colour for a store when none was picked. */
export function colorForName(name: string): string {
  let h = 0;
  for (const ch of name.trim().toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CARD_COLORS[h % CARD_COLORS.length];
}

export const cardColor = (c: Pick<LoyaltyCard, "color" | "store_name">) => c.color || colorForName(c.store_name);

/** Check digit for EAN-13 (13 digits) and UPC-A (12 digits): weights 3 and 1 from the right, over the digits before it. */
export function gtinCheckDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const d = body.charCodeAt(body.length - 1 - i) - 48;
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return (10 - (sum % 10)) % 10;
}

function validGtin(digits: string, length: 12 | 13): boolean {
  return digits.length === length && /^\d+$/.test(digits) && gtinCheckDigit(digits.slice(0, -1)) === Number(digits.slice(-1));
}

/** Spaces and dashes people type or copy from a card are not part of the code. */
export function cleanNumber(raw: string, format: BarcodeFormat = "CODE128"): string {
  const t = raw.trim();
  if (format === "QR") return t;
  return t.replace(/[\s-]+/g, "");
}

/** Picks the format a scanner will most likely expect. */
export function detectFormat(raw: string): BarcodeFormat {
  const t = raw.trim();
  if (!t) return "CODE128";
  if (/^https?:\/\//i.test(t) || t.length > 48 || /[^\x20-\x7e]/.test(t)) return "QR";
  const n = cleanNumber(t);
  if (validGtin(n, 13)) return "EAN13";
  if (validGtin(n, 12)) return "UPCA";
  return "CODE128";
}

/** null when the number can be drawn in this format, otherwise a message for the person. */
export function formatProblem(raw: string, format: BarcodeFormat): string | null {
  const n = cleanNumber(raw, format);
  if (!n) return "Enter the card or barcode number.";
  if (format === "QR") return n.length > 300 ? "That is too long for a QR code." : null;
  if (/[^\x20-\x7e]/.test(n)) return "CODE128 can only hold letters, digits and common symbols. Choose QR Code for anything else.";
  if (format === "CODE128") return n.length > 80 ? "That is too long for a barcode. Choose QR Code instead." : null;
  if (format === "EAN13") return validGtin(n, 13) ? null : "EAN-13 needs 13 digits with a correct last digit. Choose CODE128 if your card has a different number.";
  return validGtin(n, 12) ? null : "UPC-A needs 12 digits with a correct last digit. Choose CODE128 if your card has a different number.";
}

/** Digits in groups of four for reading aloud at the till; anything else is shown as typed. */
export function displayNumber(n: string): string {
  return /^\d{8,}$/.test(n) ? n.replace(/(\d{4})(?=\d)/g, "$1 ") : n;
}

export const filterCards = (cards: LoyaltyCard[], query: string) => {
  const q = query.trim().toLowerCase();
  if (!q) return cards;
  return cards.filter((c) => [c.store_name, c.category, c.holder_name].some((v) => (v || "").toLowerCase().includes(q)));
};
