export type CurrencyOption = {
  code: string;
  name: string;
};

export const CURRENCIES: CurrencyOption[] = [
  { code: "USD", name: "US Dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British Pound" },
  { code: "AWG", name: "Aruban Florin" },
  { code: "CAD", name: "Canadian Dollar" },
  { code: "MXN", name: "Mexican Peso" },
  { code: "BRL", name: "Brazilian Real" },
  { code: "CHF", name: "Swiss Franc" },
  { code: "JPY", name: "Japanese Yen" },
  { code: "CNY", name: "Chinese Yuan" },
  { code: "INR", name: "Indian Rupee" },
  { code: "AUD", name: "Australian Dollar" },
  { code: "NZD", name: "New Zealand Dollar" },
  { code: "SGD", name: "Singapore Dollar" },
  { code: "HKD", name: "Hong Kong Dollar" },
  { code: "SEK", name: "Swedish Krona" },
  { code: "NOK", name: "Norwegian Krone" },
  { code: "DKK", name: "Danish Krone" },
  { code: "ZAR", name: "South African Rand" },
  { code: "AED", name: "UAE Dirham" },
];

/** Currencies not on the free ECB feed. Rate is USD per 1 unit. */
const FIXED_USD: Record<string, number> = {
  AWG: 1 / 1.79,
  AED: 1 / 3.6725,
};

export function currencyLabel(code: string) {
  const found = CURRENCIES.find((c) => c.code === code);
  return found ? `${found.code} — ${found.name}` : code;
}

export function toUsd(amount: number, rate: number) {
  return Math.round(amount * rate * 100) / 100;
}

/**
 * USD value of 1 unit of `from`.
 * Frankfurter (ECB, no key) for most codes. Fixed peg for AWG/AED.
 */
export async function rateToUsd(from: string): Promise<number> {
  const code = from.toUpperCase();
  if (code === "USD") return 1;
  if (FIXED_USD[code]) return FIXED_USD[code];

  const res = await fetch(
    `https://api.frankfurter.dev/v1/latest?from=${code}&to=USD`,
    { next: { revalidate: 3600 } }
  );
  if (!res.ok) throw new Error(`No rate for ${code}`);
  const json = await res.json();
  const rate = json?.rates?.USD;
  if (typeof rate !== "number") throw new Error(`No rate for ${code}`);
  return rate;
}
