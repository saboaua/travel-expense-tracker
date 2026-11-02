// Run with: npx tsx tests/personal-grocery.test.ts
import { normalizeItemName, parseLineItems, priceStats, buildTracker, monthlyTotals, categoryTotals, topItems, guessGroceryCategory } from "../src/lib/personal/grocery";
const eq = (a:any,b:any,m:string)=>{ const ok=JSON.stringify(a)===JSON.stringify(b); console.log(ok?"PASS":"FAIL", m, ok?"":`got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); if(!ok) process.exitCode=1; };

eq(normalizeItemName("ORG BANANAS 1KG"), "banana organic", "org bananas 1kg");
eq(normalizeItemName("Bananas"), "banana", "bananas");
eq(normalizeItemName("Tomatoes 500g"), "tomato", "tomatoes");
eq(normalizeItemName("CHKN BNLS 2 LB"), "boneless chicken", "chkn bnls");
eq(normalizeItemName("Hummus"), "hummus", "hummus keeps s");
eq(normalizeItemName("Whole Milk 1L"), "milk whole", "whole milk 1L");
eq(normalizeItemName("MILK WHOLE"), normalizeItemName("Whole Milk 2L"), "word order");
eq(normalizeItemName("BANANAS ORG"), normalizeItemName("Organic Bananas"), "org order");
eq(normalizeItemName("Café Crème"), "cafe creme", "accents");
eq(normalizeItemName("123"), "123", "digits only falls back");
eq(guessGroceryCategory("Whole Milk"), "Dairy & Eggs", "cat milk");
eq(guessGroceryCategory("Bananas"), "Produce", "cat banana");
eq(guessGroceryCategory("Dish soap"), "Household", "cat soap");
eq(guessGroceryCategory("Widget"), "Other", "cat other");

const text = `SUPER FOOD MARKET
123 Main St
Tel 555-0000
BANANAS ORG        2.49
MILK WHOLE 1L      1.89 F
3 x CHKN BNLS     11.97
2 @ 1.50  RICE 1KG  3.00
TOMATOES
0.750 kg @ 3.99/kg
                    2.99
Savings            -1.00
SUBTOTAL          22.34
TAX                 1.12
TOTAL             23.46
VISA ****1234      23.46`;
const items = parseLineItems(text);
console.log(JSON.stringify(items));
eq(items.length >= 4, true, "parsed at least 4 items");
eq(items.find(i=>/BANANAS/.test(i.name))?.line_total, 2.49, "banana price");
eq(items.find(i=>/MILK/.test(i.name))?.line_total, 1.89, "milk with F flag");
eq(items.find(i=>/CHKN/.test(i.name))?.quantity, 3, "qty prefix 3 x");
eq(items.some(i=>/total|visa|tax|savings/i.test(i.name)), false, "no payment lines");

const s = priceStats([
  {date:"2026-08-01",price:2.0,store:"A"},{date:"2026-09-01",price:2.2,store:"B"},{date:"2026-10-01",price:2.4,store:"A"}]);
eq(s?.last, 2.4, "last"); eq(s?.previous, 2.2, "prev"); eq(s?.changePct, 9.1, "change pct"); eq(s?.trend,"up","trend up");
eq(s?.avg, 2.2, "avg"); eq(s?.cheapestStore, "A", "cheapest store"); eq(priceStats([{date:"2026-01-01",price:1,store:"A"}])?.trend,"new","single = new");
eq(priceStats([]), null, "empty");

const rows = [
 {name:"Bananas",normalized_name:"banana",category:"Produce",unit_price:1.0,quantity:2,line_total:2,receipt:{store:"A",purchase_date:"2026-09-10",currency:"USD"}},
 {name:"Banana",normalized_name:"banana",category:"Produce",unit_price:1.2,quantity:1,line_total:1.2,receipt:{store:"B",purchase_date:"2026-10-10",currency:"USD"}},
 {name:"Banana",normalized_name:"banana",category:"Produce",unit_price:2.0,quantity:1,line_total:2.0,receipt:{store:"B",purchase_date:"2026-10-12",currency:"AWG"}},
];
const t = buildTracker(rows);
eq(t.length, 2, "tracker splits by currency");
eq(t.find(x=>x.currency==="USD")?.stats.changePct, 20, "usd +20%");
eq(t.find(x=>x.currency==="USD")?.totalSpent, 3.2, "total spent");

const receipts = [
 {id:"r1",purchase_date:"2026-09-10",total:50,currency:"USD"},{id:"r2",purchase_date:"2026-10-05",total:30,currency:"USD"},
 {id:"r3",purchase_date:"2026-10-20",total:45.5,currency:"USD"},{id:"r4",purchase_date:"2026-10-21",total:99,currency:"AWG"}];
eq(monthlyTotals(receipts,"USD"), [{month:"2026-09",total:50,count:1},{month:"2026-10",total:75.5,count:2}], "monthly totals");
const its = [
 {receipt_id:"r2",category:"Produce",name:"Banana",normalized_name:"banana",line_total:10},
 {receipt_id:"r3",category:"Produce",name:"Banana",normalized_name:"banana",line_total:5},
 {receipt_id:"r3",category:"Dairy & Eggs",name:"Milk",normalized_name:"milk",line_total:12},
 {receipt_id:"r1",category:"Pantry",name:"Rice",normalized_name:"rice",line_total:9},
 {receipt_id:"r4",category:"Pantry",name:"Rice",normalized_name:"rice",line_total:50}];
eq(categoryTotals(receipts,its,"2026-10","USD"), [{category:"Produce",total:15},{category:"Dairy & Eggs",total:12}], "category totals");
eq(topItems(receipts,its,"2026-10","USD",1), [{name:"Banana",total:15,count:2}], "top items");
