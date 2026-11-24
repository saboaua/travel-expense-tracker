"use client";

import { countryName } from "@/lib/scan-destination";
import { useCountryStats } from "@/components/personal/use-country";
import { useCommunityCounts } from "@/components/admin/use-community-counts";

const chip = "inline-flex whitespace-nowrap rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200";

/** Under a Supermarkets tool: which countries already have data. */
export function HubCountryChips({ tool }: { tool: "doit" | "places" | "community" }) {
  const stats = useCountryStats();
  const counts = useCommunityCounts(tool === "places");
  if (tool === "doit") return <span className="mt-1 flex gap-1.5"><span className={chip}>Aruba · AWG</span></span>;
  const rows = (stats ?? []).filter((s) => (tool === "places" ? s.stores > 0 : s.prices > 0));
  const withProducts = tool === "places" ? (counts ?? []).filter((c) => c.products > 0) : [];
  if (!rows.length && !withProducts.length) return null;
  return <span className="mt-1 flex flex-wrap gap-1.5" data-testid={`hub-chips-${tool}`}>{rows.map((s) => <span key={s.country} className={chip}>{countryName(s.country) ?? s.country}{tool === "places" ? ` · ${s.stores}` : ""}</span>)}{withProducts.map((c) => <span key={`p${c.country}`} data-testid="hub-community-products" className="inline-flex whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">{c.products.toLocaleString()} community {c.products === 1 ? "product" : "products"}{rows.length > 1 ? ` · ${countryName(c.country) ?? c.country}` : ""}</span>)}</span>;
}
