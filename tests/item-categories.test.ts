import { areaOf, needsCategory, pickCategory, shoppingSet, splitReceipt } from "../src/lib/personal/item-categories";
import { guessGroceryCategory, normalizeItemName } from "../src/lib/personal/grocery";
import { spentByArea } from "../src/lib/personal/budget";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); } };

// the Interoriental Asian Market receipt
const guess = (n: string) => guessGroceryCategory(n);
eq("notebooks and the palette are stationery", [guess("Languo Painting Notebook"), guess("Languo Watercolor Notebook 3in1 45Sheets"), guess('Portable Empty Watercolor Palette "Medium')], ["Stationery & art", "Stationery & art", "Stationery & art"]);
eq("mochi is a snack, beer a beverage", [guess("Royal Family Sesame Mochi 210g"), guess("Royal Family Red Bean Mochi 210g"), guess("Asahi Beer 330ml")], ["Snacks", "Snacks", "Beverages"]);
eq("a nameless charge stays Other", guess("Miscellaneous Charge"), "Other");
eq("food is not caught by the new rules", [guess("Whole milk"), guess("Spaghetti"), guess("Paper towels"), guess("Toothbrush"), guess("Penne rigate")], ["Dairy & Eggs", "Pantry", "Household", "Personal Care", "Other"]);
eq("pet and clothing", [guess("Dog food 5kg"), guess("Cotton socks 3 pack")], ["Pet", "Clothing"]);

const shop = shoppingSet();
const items = [
  { category: "Stationery & art", line_total: 5 }, { category: "Stationery & art", line_total: 10 }, { category: "Snacks", line_total: 13.9 }, { category: "Snacks", line_total: 6.95 },
  { category: "Beverages", line_total: 11.9 }, { category: "Other", line_total: 11.85 }, { category: "Other", line_total: 6.95 }, { category: "Stationery & art", line_total: 10 },
];
eq("the receipt splits into groceries, shopping and unsorted", splitReceipt(items, shop), { groceries: 32.75, shopping: 25, needs: 18.8, needsCount: 2 });
eq("areas", [areaOf("Stationery & art", shop), areaOf("stationery & ART", shop), areaOf("Snacks", shop), areaOf("Other", shop)], ["shopping", "shopping", "groceries", "groceries"]);
eq("an admin can mark another category as shopping", areaOf("Cosmetics", shoppingSet(["Cosmetics"])), "shopping");
eq("needs a category", [needsCategory("Other"), needsCategory("Other", true), needsCategory("Snacks")], [true, false, false]);

// your own choice for a product wins over the guess
const rules = new Map([[normalizeItemName("Languo Painting Notebook"), "Stationery & art"]]);
eq("a remembered choice wins", [pickCategory(normalizeItemName("Languo Painting Notebook"), "Other", rules), pickCategory(normalizeItemName("Rice 1kg"), "Pantry", rules)], ["Stationery & art", "Pantry"]);

// the budget: shopping lines move from Groceries to Shopping, and the total does not change
const base = { groceries: [{ total: 76.55, currency: "AWG" }], utilities: [], spends: [], projects: [] };
const before = spentByArea(base, "AWG"), after = spentByArea({ ...base, shopping: [{ amount: 25, currency: "AWG" }] }, "AWG");
eq("groceries lose what shopping gains", [before.groceries, before.shopping, after.groceries, after.shopping], [76.55, 0, 51.55, 25]);
eq("the total is unchanged", [before.groceries + before.shopping, after.groceries + after.shopping], [76.55, 76.55]);
eq("shopping in another currency is converted", spentByArea({ ...base, groceries: [{ total: 100, currency: "USD" }], shopping: [{ amount: 10, currency: "USD" }] }, "AWG").shopping, 17.9);

if (fail) process.exit(1);
console.log("ok item-categories");
