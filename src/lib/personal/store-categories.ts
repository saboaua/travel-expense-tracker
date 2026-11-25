/** What kind of shop a store is, so the Directory can hold more than supermarkets later (clothing, nutrition, ...). Pure, so it is unit-tested. */
export const CATEGORIES = [
  { id: "supermarkets", label: "Supermarkets", hint: "Groceries. Used by Smart Cart and Best store" },
  { id: "clothing", label: "Clothing", hint: "Shoes, fashion, department stores" },
  { id: "health", label: "Health & nutrition", hint: "Pharmacy, supplements, nutrition" },
  { id: "other", label: "Other", hint: "Anything that is not one of these" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];
export const DEFAULT_CATEGORY: CategoryId = "supermarkets";

export const isCategory = (v: unknown): v is CategoryId => typeof v === "string" && CATEGORIES.some((c) => c.id === v);
/** Anything unknown or missing is a supermarket, which is what every store was before categories existed. */
export const asCategory = (v: unknown): CategoryId => (isCategory(v) ? v : DEFAULT_CATEGORY);
export const categoryLabel = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? "Supermarkets";
