import { orderSiteInForward, orderSiteOfSender, parseOrderEmail, readAmount } from "../src/lib/personal/order-email";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };

eq("only the shops' own domains", [orderSiteOfSender("auto-confirm@amazon.com"), orderSiteOfSender("order-update@amazon.co.uk"), orderSiteOfSender("transaction@notice.aliexpress.com"), orderSiteOfSender("ebay@ebay.com"), orderSiteOfSender("x@amazon.com.evil.io"), orderSiteOfSender("x@notamazon.com"), orderSiteOfSender("me@gmail.com"), orderSiteOfSender("")], ["amazon", "amazon", "aliexpress", "ebay", null, null, null, null]);
eq("amounts", [readAmount("$1,234.56"), readAmount("1.234,56"), readAmount("67,48"), readAmount("67.48"), readAmount("abc")], [1234.56, 1234.56, 67.48, 67.48, null]);

const amazon = `Order Confirmation
Order #123-4567890-1234567
Arriving Thursday, December 3
USB-C cable 2 m, 3 pack
Quantity: 1
$12.99
Phone stand
Quantity: 2
$49.60
Shipping & Handling: $6.99
Order Total: $67.48`;
const a = parseOrderEmail({ site: "amazon", text: amazon, date: "2026-11-22" });
eq("amazon order", a && [a.order_ref, a.order_date, a.total, a.currency, a.arrives_on], ["123-4567890-1234567", "2026-11-22", 67.48, "USD", "2026-12-03"]);
eq("amazon items, unit price from the line price", a?.items, [{ name: "USB-C cable 2 m, 3 pack", quantity: 1, unit_price: 12.99, line_total: 12.99 }, { name: "Phone stand", quantity: 2, unit_price: 24.8, line_total: 49.6 }]);

const ali = `Your order has been placed
Order ID: 8123456789012345
Estimated delivery: Dec 12 - Dec 20
Order total: US $14.20`;
const b = parseOrderEmail({ site: "aliexpress", text: ali, date: "2026-11-24" });
eq("aliexpress order, no items, the later delivery day", b && [b.order_ref, b.total, b.currency, b.arrives_on, b.items.length], ["8123456789012345", 14.2, "USD", "2026-12-20", 0]);

const ebay = `Thanks for your order
Order number: 12-34567-89012
Order total:
US $9.00
Estimated delivery: Wed, Dec 3 - Fri, Dec 10`;
const c = parseOrderEmail({ site: "ebay", text: ebay, date: "2026-11-20" });
eq("ebay total on the next line", c && [c.order_ref, c.total, c.arrives_on], ["12-34567-89012", 9, "2026-12-10"]);

eq("a delivery day already past this year means next year", parseOrderEmail({ site: "amazon", text: "Arriving Jan 4\nOrder Total: $5.00", date: "2026-12-28" })?.arrives_on, "2027-01-04");
eq("subtotal is not the total", parseOrderEmail({ site: "amazon", text: "Subtotal: $10.00\nOrder Total: $12.50", date: "2026-11-22" })?.total, 12.5);
eq("no total, nothing is guessed", parseOrderEmail({ site: "amazon", text: "Your package was delivered", date: "2026-11-22" }), null);
eq("euro", parseOrderEmail({ site: "amazon", text: "Order Total: EUR 1.234,56", date: "2026-11-22" })?.currency, "EUR");
eq("a forward without a Forwarded message line, as Outlook writes it", [orderSiteInForward("FYI\n\nFrom: Amazon.com <auto-confirm@amazon.com>\nSent: Sunday\nSubject: Your order"), orderSiteInForward("> From: AliExpress <transaction@notice.aliexpress.com>"), orderSiteInForward("From: Pat <pat@gmail.com>\nhello"), orderSiteInForward("no header here")], ["amazon", "aliexpress", null, null]);
process.exit(fail ? 1 : 0);
