/** A "$" with no currency code: whose dollar is it? Decided from where you live, never from the amounts. */

/** The currency a shop prices in, by the country you live in (only places where a bare $ is not USD). */
const HOME_CURRENCY: Record<string, string> = { aruba: "AWG" };

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** The currency of the country you live in, when known. */
export function homeCurrency(country: string | null | undefined): string | null {
  return HOME_CURRENCY[norm(country)] ?? null;
}

export type DollarCall =
  | { kind: "none" }
  /** Nothing to decide: use this currency and say so (with Undo). */
  | { kind: "apply"; currency: string }
  /** Ask once: Switch to `suggest` or keep what the form has. */
  | { kind: "ask"; suggest: string }
  /** A bare $ but no home place is set, so there is nothing to go on. */
  | { kind: "hint" };

/**
 * What to do when a scan shows only a "$".
 * - a code was printed (not bare): nothing to do, whatever it says is kept
 * - a store you already have a currency for: that one, no question
 * - the form already shows the home currency: nothing to do, the $ is that currency
 * - otherwise ask once, suggesting the home currency
 */
export function dollarCall(i: { bareDollar: boolean | undefined; home: string | null | undefined; formCurrency: string; storeCurrency: string | null }): DollarCall {
  if (!i.bareDollar) return { kind: "none" };
  const homeCur = homeCurrency(i.home);
  if (!homeCur) return norm(i.home) ? { kind: "none" } : { kind: "hint" };
  if (i.storeCurrency) return i.storeCurrency === i.formCurrency ? { kind: "none" } : { kind: "apply", currency: i.storeCurrency };
  if (i.formCurrency === homeCur) return { kind: "none" };
  return { kind: "ask", suggest: homeCur };
}
