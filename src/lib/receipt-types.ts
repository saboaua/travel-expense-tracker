/**
 * Receipt types: your own kinds of receipt besides Groceries and Shopping (Personal care, Health, Pets...).
 * Pure functions, so the rules can be tested without a browser.
 */
export type ReceiptType = {
  id: string;
  name: string;
  icon: string;
  color: string;
  show_in_budget: boolean;
  monthly_limit: number | null;
  sort_order: number;
};

/** The icons a type can use (names of lucide icons, resolved in components/receipt-types/TypeIcon). */
export const TYPE_ICONS = ["heart", "pill", "paw-print", "gift", "car", "ticket", "shirt", "sparkles", "tag", "graduation-cap", "utensils", "dumbbell"] as const;
export const TYPE_COLORS = ["#e11d48", "#ea580c", "#ca8a04", "#16a34a", "#0d9488", "#2563eb", "#7c3aed", "#c026d3"] as const;

/** Offered once so nobody starts empty. Only Personal care starts with its own budget line, like the mockup. */
export const STARTER_TYPES: Pick<ReceiptType, "name" | "icon" | "color" | "show_in_budget">[] = [
  { name: "Personal care", icon: "heart", color: "#e11d48", show_in_budget: true },
  { name: "Health", icon: "pill", color: "#0d9488", show_in_budget: false },
  { name: "Entertainment", icon: "ticket", color: "#7c3aed", show_in_budget: false },
  { name: "Pets", icon: "paw-print", color: "#ea580c", show_in_budget: false },
];

export const norm = (s: string | null | undefined) =>
  (s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function readType(r: Record<string, unknown>): ReceiptType | null {
  if (typeof r.id !== "string" || typeof r.name !== "string" || !r.name.trim()) return null;
  const limit = Number(r.monthly_limit);
  return {
    id: r.id,
    name: r.name.trim(),
    icon: typeof r.icon === "string" && r.icon ? r.icon : "tag",
    color: typeof r.color === "string" && /^#[0-9a-fA-F]{6}$/.test(r.color) ? r.color : "#475569",
    show_in_budget: r.show_in_budget !== false,
    monthly_limit: Number.isFinite(limit) && limit > 0 ? limit : null,
    sort_order: Number(r.sort_order) || 0,
  };
}

/** Checks what a person typed in the New type form. Returns the row to save, or the message to show. */
export function cleanTypeInput(input: { name: string; icon: string; color: string; show_in_budget: boolean; limit: string }, existing: ReceiptType[], editingId?: string | null):
  { ok: true; row: { name: string; icon: string; color: string; show_in_budget: boolean; monthly_limit: number | null } } | { ok: false; error: string } {
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 40);
  if (!name) return { ok: false, error: "Enter a name for this type." };
  if (existing.some((t) => t.id !== editingId && norm(t.name) === norm(name))) return { ok: false, error: "You already have a type with that name." };
  if (["groceries", "grocery", "shopping"].includes(norm(name))) return { ok: false, error: "Groceries and Shopping already exist. Pick another name." };
  const raw = input.limit.trim().replace(",", ".");
  let monthly_limit: number | null = null;
  if (raw) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return { ok: false, error: "The monthly limit must be a number above zero, or empty." };
    monthly_limit = Math.round(n * 100) / 100;
  }
  return { ok: true, row: { name, icon: (TYPE_ICONS as readonly string[]).includes(input.icon) ? input.icon : "tag", color: /^#[0-9a-fA-F]{6}$/.test(input.color) ? input.color : TYPE_COLORS[0], show_in_budget: !!input.show_in_budget, monthly_limit } };
}

/** Words on a receipt that point to a kind of receipt. The first rule whose type name exists in the person's list is used. */
const HINTS: { type: string; words: RegExp }[] = [
  { type: "personal care", words: /\b(massage|spa|salon|barber|barbershop|hair ?cut|hairdress\w*|nails?|manicure|pedicure|beauty|facial|wax(ing)?|tattoo)\b/ },
  { type: "health", words: /\b(doctor|dr|clinic|dentist|dental|hospital|medical|physio\w*|therapy|optic\w*|laborator\w*|lab|consultation|pharmacy)\b/ },
  { type: "entertainment", words: /\b(cinema|movie|movies|theat(er|re)|concert|museum|ticket|tickets|amusement|bowling|arcade|casino)\b/ },
  { type: "pets", words: /\b(vet|veterinar\w*|pet|pets|kennel|grooming)\b/ },
];

/** The type that fits a receipt, from the store name and the item lines. Null when nothing points to one of the person's types. */
export function suggestType(store: string, itemNames: string[], types: ReceiptType[]): ReceiptType | null {
  const text = norm([store, ...itemNames].join(" "));
  if (!text) return null;
  for (const h of HINTS) {
    if (!h.words.test(text)) continue;
    const t = types.find((x) => norm(x.name) === h.type);
    if (t) return t;
  }
  return null;
}

/** What is already known about a store: the type it was last filed under (the most used one), from your earlier receipts. */
export function typeFromHistory(store: string, receipts: { store?: string | null; type_id?: string | null; area?: string | null }[], types: ReceiptType[]): ReceiptType | null {
  const key = norm(store);
  if (!key) return null;
  const counts = new Map<string, number>();
  for (const r of receipts) if (r.area === "other" && r.type_id && norm(r.store) === key) counts.set(r.type_id, (counts.get(r.type_id) ?? 0) + 1);
  let best: string | null = null;
  for (const [id, n] of counts) if (!best || n > (counts.get(best) ?? 0)) best = id;
  return types.find((t) => t.id === best) ?? null;
}

export type TypeLine = { type: ReceiptType; amount: number };
/** The budget lines for your types: each type with its own line switched on, then one "Other types" line adding up the rest. */
export function typeBudgetLines(types: ReceiptType[], byType: Record<string, number>): { own: TypeLine[]; others: { amount: number; names: string[] } } {
  const own: TypeLine[] = [];
  const rest: TypeLine[] = [];
  for (const t of [...types].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))) {
    const amount = Math.round((byType[t.id] ?? 0) * 100) / 100;
    if (t.show_in_budget && (amount > 0 || t.monthly_limit)) own.push({ type: t, amount });
    else if (!t.show_in_budget && amount > 0) rest.push({ type: t, amount });
  }
  return { own, others: { amount: Math.round(rest.reduce((s, x) => s + x.amount, 0) * 100) / 100, names: rest.map((x) => x.type.name) } };
}

/** Typed receipts added up by type, in the budget's currency. Receipts of a deleted type (no type_id) are not counted here. */
export function spentByType(receipts: { area?: string | null; type_id?: string | null; total: number | string; currency: string }[], toCurrency: (amount: number, currency: string) => number | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of receipts) {
    if (r.area !== "other" || !r.type_id) continue;
    const v = toCurrency(Number(r.total), r.currency);
    if (v != null && Number.isFinite(v)) out[r.type_id] = Math.round(((out[r.type_id] ?? 0) + v) * 100) / 100;
  }
  return out;
}
