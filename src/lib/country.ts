/**
 * Prices by country. The country decides which supermarkets, community prices and online lists the Best store and
 * the Price tracker use, and which currency they show. Pure helpers here, so they are unit-tested; the browser part is in use-country.ts.
 * Keep CURRENCY_OF_COUNTRY in step with public._country_of_currency in supabase/migration_country.sql.
 */
export const CURRENCY_OF_COUNTRY: Record<string, string> = {
  AW: "AWG", SR: "SRD", CW: "ANG", SX: "ANG", GY: "GYD", TT: "TTD", BB: "BBD", JM: "JMD", CO: "COP", VE: "VES", BR: "BRL", DO: "DOP",
  HT: "HTG", MX: "MXN", CA: "CAD", GB: "GBP", US: "USD", PA: "USD", EC: "USD", PR: "USD", NL: "EUR", DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR", PT: "EUR", BE: "EUR",
};

/** Currencies that exactly one country uses (the database does the same mapping when the app sends no country). */
const ONLY_ONE: Record<string, string> = { AWG: "AW", SRD: "SR", GYD: "GY", TTD: "TT", BBD: "BB", JMD: "JM", COP: "CO", VES: "VE", BRL: "BR", DOP: "DO", HTG: "HT", MXN: "MX", CAD: "CA", GBP: "GB" };

export const normCountry = (c: string | null | undefined): string | null => (c && /^[A-Za-z]{2}$/.test(c.trim()) ? c.trim().toUpperCase() : null);
export const currencyOfCountry = (c: string | null | undefined): string | null => CURRENCY_OF_COUNTRY[normCountry(c) ?? ""] ?? null;
export const countryOfCurrency = (cur: string | null | undefined): string | null => ONLY_ONE[(cur ?? "").trim().toUpperCase()] ?? null;

let namesToCodes: Map<string, string> | null = null;
/** "Suriname" -> "SR". The profile keeps the home country as a name. */
export function codeOfCountryName(name: string | null | undefined): string | null {
  const key = (name ?? "").trim().toLowerCase();
  if (!key) return null;
  if (/^[a-z]{2}$/.test(key)) return key.toUpperCase();
  if (!namesToCodes) {
    namesToCodes = new Map();
    try {
      const dn = new Intl.DisplayNames(["en"], { type: "region" });
      for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
        const code = String.fromCharCode(a, b);
        const n = dn.of(code);
        if (n && n !== code) namesToCodes.set(n.toLowerCase(), code);
      }
    } catch { /* no Intl names: only two-letter codes work */ }
  }
  return namesToCodes.get(key) ?? null;
}

export type CountrySource = "manual" | "auto" | "home";
export type CountryChoice = { country: string | null; source: CountrySource };

/** One rule: a country the person picked wins, then where they are, then the home country in Profile. */
export function chooseCountry(i: { manual: string | null; detected: string | null; home: string | null }): CountryChoice {
  const manual = normCountry(i.manual);
  if (manual) return { country: manual, source: "manual" };
  const detected = normCountry(i.detected);
  if (detected) return { country: detected, source: "auto" };
  return { country: normCountry(i.home), source: "home" };
}

/** The "Now showing ..." message appears only when the automatic country changed from one the person already used. */
export const shouldAnnounce = (before: string | null, after: string | null): boolean => !!before && !!after && normCountry(before) !== normCountry(after);

export type CountryStat = { country: string; stores: number; prices: number };
export function readCountryStats(rows: unknown): CountryStat[] {
  if (!Array.isArray(rows)) return [];
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  return rows.flatMap((r) => {
    const c = normCountry((r as { country?: string })?.country);
    return c ? [{ country: c, stores: n((r as { stores?: number }).stores), prices: n((r as { prices?: number }).prices) }] : [];
  });
}
/** Does this country have any supermarkets or community prices to rank? */
export const hasPriceData = (stats: CountryStat[], country: string | null): boolean => {
  const c = normCountry(country);
  return !!c && stats.some((s) => s.country === c && (s.stores > 0 || s.prices > 0));
};

/** The country the shared prices are sent for: from the currency when only one country uses it, otherwise the country the person is in. */
export const countryForShared = (currency: string, current: string | null): string | null => countryOfCurrency(currency) ?? normCountry(current);

/* ---- the Groceries traveler badge ---- */
export const TRAVELER_FROM = 2;
export type TravelerState = { countries: string[]; seen: boolean; earned: boolean };
export function readTraveler(row: unknown): TravelerState {
  const r = (Array.isArray(row) ? row[0] : row) as { countries?: unknown; seen?: unknown } | null | undefined;
  const countries = Array.isArray(r?.countries) ? [...new Set((r!.countries as unknown[]).flatMap((c) => { const n = normCountry(typeof c === "string" ? c : null); return n ? [n] : []; }))].sort() : [];
  return { countries, seen: r?.seen === true, earned: countries.length >= TRAVELER_FROM };
}
