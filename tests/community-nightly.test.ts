import { nightlyShare } from "../src/lib/community-nightly";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };

// A tiny stand-in for the database: every query is a chain that ends in a promise of rows. It remembers which user was asked for.
const asked: string[] = [];
const rpcs: { name: string; args: Record<string, unknown> }[] = [];
const NOW = new Date("2026-11-14T08:00:00Z");
function table(name: string) {
  let who = "";
  const chain: Record<string, unknown> = {};
  const rowsFor = () => {
    if (name === "grocery_items") return who === "u1" ? [{ name: "Coca-Cola 330ML", normalized_name: "coca cola 330ml", category: "Beverages", unit_price: 1.45, quantity: 1, unit: null, line_total: 1.45, grocery_receipts: { store: "Ling & Sons", purchase_date: "2026-11-12", currency: "AWG" } }] : [];
    return [];
  };
  for (const m of ["select", "order", "limit", "range"]) chain[m] = () => chain;
  chain.eq = (c: string, v: string) => { if (c === "user_id") { who = v; asked.push(`${name}:${v}`); } return chain; };
  chain.then = (res: (v: unknown) => unknown) => Promise.resolve(name === "profiles" ? { data: [{ id: "u1" }, { id: "u2" }], error: null } : { data: rowsFor(), error: null }).then(res);
  return chain;
}
const db = {
  from: (n: string) => table(n),
  rpc: async (name: string, args: Record<string, unknown>) => { rpcs.push({ name, args }); return { data: name === "share_prices_for" ? (args.rows as unknown[]).length : 0, error: null }; },
};

(async () => {
  const r = await nightlyShare(db as never, NOW);
  eq("two people were handled", r.people, 2);
  eq("each is read by their own id, never everyone", asked.filter((a) => a.startsWith("grocery_items:")).sort(), ["grocery_items:u1", "grocery_items:u2"]);
  const shares = rpcs.filter((x) => x.name === "share_prices_for");
  eq("each person's list replaces their month", shares.map((s) => [s.args.uid, s.args.replace_month]), [["u1", true], ["u2", true]]);
  const rows = shares[0].args.rows as Record<string, unknown>[];
  eq("one price for the first person, none for the second", [rows.length, (shares[1].args.rows as unknown[]).length], [1, 0]);
  eq("only the allowed fields are written", Object.keys(rows[0]).sort(), ["currency", "price", "product_key", "product_name", "size_label", "store_key", "store_name"]);
  eq("nothing failed", r.failed, 0);
  if (fail) { console.error(`${fail} failed`); process.exit(1); }
  console.log("community nightly ok");
})();
