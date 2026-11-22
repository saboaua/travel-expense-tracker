import { KEY_BATCH, searchCommunity, type CommunityRow } from "../src/lib/personal/community";
import { countryForShared } from "../src/lib/country";

let failed = 0;
const eq = (got: unknown, want: unknown, msg: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(ok ? "PASS" : "FAIL", msg, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  if (!ok) failed++;
};

const calls: { keys?: string[]; ctry?: string }[] = [];
const fake = { rpc: async (_n: string, a: { keys?: string[]; ctry?: string }) => { calls.push(a); return { data: (a.keys ?? []).map((k) => ({ product_key: k, product_name: k, size_label: null, currency: "AWG", store_name: "S", price: 1, reporters: 1, last_month: "2026-11-01", confirmed: false })) as CommunityRow[], error: null }; } };

(async () => {
  const keys = Array.from({ length: 130 }, (_, i) => `AWG|item${i}||`);
  const rows = await searchCommunity(fake as never, { keys }, "AW");
  eq(calls.map((c) => c.keys?.length), [KEY_BATCH, KEY_BATCH, KEY_BATCH, 10], "130 products are asked in batches of 40, none left out");
  eq(rows.length, 130, "every batch's prices come back together");
  eq(calls.every((c) => c.ctry === "AW"), true, "every batch is limited to the same country");
  calls.length = 0;
  await searchCommunity(fake as never, { keys: keys.slice(0, 10) }, null);
  eq(calls.length, 1, "a short list is one call");
  calls.length = 0;
  await searchCommunity(fake as never, { q: "milk" }, "AW");
  eq(calls.length, 1, "a text search is one call");
  eq([countryForShared("AWG", "SR"), countryForShared("USD", "SR"), countryForShared("USD", null)], ["AW", "SR", null], "Aruba florins look up Aruba prices even when you are in Suriname; dollars follow where you are");
  if (failed) { console.log(`${failed} failed`); process.exit(1); }
})();
