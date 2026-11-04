export type CurrencyOption = {
  code: string;
  name: string;
  usd_rate?: number | null;
};

/** Used if the currencies table is empty or unavailable. */
export const CURRENCIES: CurrencyOption[] = [
  { code: "USD", name: "US Dollar", usd_rate: 1 },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British Pound" },
  { code: "AWG", name: "Aruban Florin", usd_rate: 1 / 1.79 },
  { code: "XCD", name: "Eastern Caribbean Dollar (Grenada, St Lucia)", usd_rate: 1 / 2.7 },
  { code: "GYD", name: "Guyanese Dollar", usd_rate: 1 / 209 },
  { code: "SRD", name: "Surinamese Dollar", usd_rate: 1 / 37 },
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
  { code: "AED", name: "UAE Dirham", usd_rate: 1 / 3.6725 },
];

const FIXED_USD: Record<string, number> = Object.fromEntries(
  CURRENCIES.filter((c) => c.usd_rate).map((c) => [c.code, c.usd_rate as number])
);

export function toUsd(amount: number, rate: number) {
  return Math.round(amount * rate * 100) / 100;
}

export async function rateToUsd(
  from: string,
  storedRate?: number | null
): Promise<number> {
  const code = from.toUpperCase();
  if (code === "USD") return 1;
  if (storedRate && storedRate > 0) return storedRate;
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
