/**
 * Sorting receipt lines. A receipt can hold food and other things, so each line has its own category.
 * A category counts in one of two parts of the budget: groceries (food, drinks, household) or shopping (everything else).
 */
export type ItemArea = "groceries" | "shopping";

/** The shopping categories from the start. Admin > Receipt Categories can mark others (the table's area column); this list is the fallback. */
export const DEFAULT_SHOPPING_NAMES = ["Stationery & art", "Clothing", "Electronics", "Toys & games", "Garden & hardware", "Shopping"];

export const NEEDS_CATEGORY = "Other";

export function shoppingSet(fromTable?: Iterable<string> | null): Set<string> {
  return new Set([...DEFAULT_SHOPPING_NAMES, ...(fromTable ?? [])].map((n) => n.toLowerCase()));
}

export const areaOf = (category: string, shopping: Set<string>): ItemArea => (shopping.has((category ?? "").trim().toLowerCase()) ? "shopping" : "groceries");

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** How a receipt splits: groceries, shopping, and the lines still in "Other" (those count as groceries until sorted). */
export function splitReceipt(items: { category: string; line_total: number | string }[], shopping: Set<string>) {
  let groceries = 0, shop = 0, needs = 0, needsCount = 0;
  for (const it of items) {
    const v = Number(it.line_total) || 0;
    if (areaOf(it.category, shopping) === "shopping") shop += v;
    else { groceries += v; if ((it.category ?? "").trim().toLowerCase() === NEEDS_CATEGORY.toLowerCase()) { needs += v; needsCount++; } }
  }
  return { groceries: r2(groceries - needs), shopping: r2(shop), needs: r2(needs), needsCount };
}

/** A line the person has not sorted yet: still "Other" and not confirmed by them. */
export const needsCategory = (category: string, confirmed?: boolean) => !confirmed && (category ?? "").trim().toLowerCase() === NEEDS_CATEGORY.toLowerCase();

/** The category for a line: the person's own choice for this product wins over the guess. */
export function pickCategory(normalizedName: string, guess: string, rules: ReadonlyMap<string, string>): string {
  return rules.get(normalizedName) ?? guess;
}
