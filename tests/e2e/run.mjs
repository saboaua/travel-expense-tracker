/**
 * End-to-end tests: sign-in / sign-out, adding an expense, and the admin pages.
 *
 * Starts an in-memory fake Supabase (tests/e2e/fake-supabase.mjs), starts the app with `next dev` pointed at it,
 * and drives a real Chromium through Playwright. Run with:  npm run test:e2e
 * Needs Chromium for Playwright (`npx playwright install chromium`, already present in CI images that ship it).
 */
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { createFakeSupabase, SERVICE_KEY, ANON_KEY } from "./fake-supabase.mjs";

const APP_PORT = Number(process.env.E2E_APP_PORT || 3100);
const FAKE_PORT = Number(process.env.E2E_FAKE_PORT || 54399);
// "localhost", not 127.0.0.1: the app builds its redirect addresses from it, and cookies must stay on one host
const BASE = `http://localhost:${APP_PORT}`;

let failed = 0;
const results = [];
async function test(name, fn) {
  if (process.env.E2E_ONLY && !name.includes(process.env.E2E_ONLY)) return; // run just the tests whose name contains this text
  const started = Date.now();
  try {
    await fn();
    results.push(`PASS ${name} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  } catch (e) {
    failed++;
    results.push(`FAIL ${name}\n     ${String(e?.message || e).split("\n").slice(0, process.env.E2E_ONLY ? 40 : 6).join("\n     ")}`);
  }
  console.log(results.at(-1));
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const todayAruba = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Aruba" }).format(new Date());
const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/* ---------------- fake backend + seed ---------------- */
const fake = createFakeSupabase();
const FEATURES = ["trips", "reports", "personal", "personal.dashboard", "documents", "loyalty", "users.manage", "security.view", "categories.manage", "currencies.manage", "branding.manage", "telegram.manage", "support.view"];
fake.seed("roles", [
  { key: "user", label: "User", description: "Regular user", permissions: ["trips", "reports", "personal", "personal.dashboard", "documents", "loyalty"], known_features: FEATURES, is_system: true },
  { key: "assistant", label: "Assistant", description: "Assistant", permissions: ["trips", "reports", "personal", "documents", "loyalty", "users.manage"], known_features: FEATURES, is_system: true },
  { key: "admin", label: "Admin", description: "Admin", permissions: FEATURES, known_features: FEATURES, is_system: true },
]);
fake.seed("app_settings", [{ id: 1, app_name: "E2E Expense App", logo_url: null, primary_color: "#4f46e5", login_logo_size: 56, privacy_policy: "", support_email: "help@example.com", personal_enabled: true }]);
fake.seed("currencies", [
  { code: "USD", name: "US Dollar", usd_rate: 1, enabled: true, sort_order: 1 },
  { code: "AWG", name: "Aruban Florin", usd_rate: 0.558659, enabled: true, sort_order: 2 },
  { code: "EUR", name: "Euro", usd_rate: 1.1, enabled: true, sort_order: 3 },
]);
for (const t of ["profiles", "trips", "expenses", "personal_projects", "personal_expenses", "grocery_receipts", "grocery_items", "travel_documents", "loyalty_cards", "security_events", "audit_logs", "support_requests"]) fake.table(t);

const PAT = fake.addUser({ email: "pat@example.com", password: "Correct-Horse-1", role: "user", full_name: "Pat Tester" });
const ADMIN = fake.addUser({ email: "admin@example.com", password: "Admin-Pass-123", role: "admin", full_name: "Ada Admin" });
const today = todayAruba();
const TRIP_ID = "7d1c6a1e-3b7f-4d6a-9d52-0f4a3a1b2c3d";
fake.table("trips").push({ id: TRIP_ID, user_id: PAT, name: "Miami Conference", destination: "Miami", category: "Business", start_date: addDays(today, -1), end_date: addDays(today, 2), currency: "USD", status: "active", notes: null, created_at: new Date().toISOString() });
fake.table("support_requests").push({ id: "b0a6a8a2-0000-4000-8000-000000000001", name: "Casey", email: "casey@example.com", subject: "Cannot log in", message: "Reset please", status: "new", created_at: new Date().toISOString() });
fake.table("audit_logs").push({ id: "b0a6a8a2-0000-4000-8000-000000000002", created_at: new Date().toISOString(), action: "role.update", entity_type: "role", entity_id: "user", actor_id: ADMIN, actor_email: "admin@example.com", details: {} });

/* ---------------- start everything ---------------- */
await fake.listen(FAKE_PORT);
const app = spawn("npx", ["next", "dev", "-p", String(APP_PORT), "-H", "localhost"], {
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${FAKE_PORT}`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    NEXT_TELEMETRY_DISABLED: "1",
    TURNSTILE_SECRET_KEY: "",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let appLog = "";
app.stdout.on("data", (d) => (appLog += d));
app.stderr.on("data", (d) => (appLog += d));

async function stopAll() {
  app.kill("SIGTERM");
  await fake.close().catch(() => {});
}

try {
  const deadline = Date.now() + 120_000;
  for (;;) {
    try { const r = await fetch(`${BASE}/api/version`); if (r.ok) break; } catch { /* not up yet */ }
    if (Date.now() > deadline) throw new Error(`The app did not start in time.\n${appLog.slice(-1500)}`);
    await new Promise((r) => setTimeout(r, 1000));
  }

  const browser = await chromium.launch();
  {
    // The development server compiles the sign-in page on first use; wait for it so no test pays for that
    const warm = await browser.newPage();
    await warm.goto(`${BASE}/login`);
    await warm.waitForFunction(() => { const b = document.querySelector('button[type="submit"]'); return !!b && !b.disabled; }, null, { timeout: 120_000 }).catch(() => {});
    await warm.close();
  }
  const newPage = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    ctx.setDefaultTimeout(60_000);
    return { ctx, page: await ctx.newPage() };
  };
  async function signIn(page, email, password) {
    await page.goto(`${BASE}/login`);
    // Let the page finish loading its scripts first; clicking too early submits the form the old-fashioned way
    await page.waitForLoadState("networkidle");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.locator('button[type="submit"]').click();
  }

  /* ---------- sign-in ---------- */
  await test("signed-out visitors are sent to the login page", async () => {
    const { ctx, page } = await newPage();
    await page.goto(`${BASE}/`);
    await page.waitForURL(/\/login/);
    assert(await page.locator("#email").isVisible(), "login form not shown");
    await ctx.close();
  });

  await test("wrong password shows one generic error and logs the attempt", async () => {
    const { ctx, page } = await newPage();
    await signIn(page, "pat@example.com", "not-the-password");
    await page.getByText("Invalid email or password.").waitFor();
    assert(new URL(page.url()).pathname === "/login", "should stay on /login");
    const ev = fake.table("security_events").filter((e) => e.event_type === "login_failed");
    assert(ev.length >= 1, "no login_failed security event was written");
    await ctx.close();
  });

  await test("correct password lands on the dashboard; sign out returns to login", async () => {
    const { ctx, page } = await newPage();
    await signIn(page, "pat@example.com", "Correct-Horse-1");
    await page.waitForURL((u) => u.pathname === "/");
    await page.getByText(/Pat/).first().waitFor();
    assert((await ctx.cookies()).some((c) => c.name.startsWith("sb-")), "no session cookie after sign-in");
    await page.getByRole("button", { name: /Sign out/ }).first().click();
    await page.waitForURL(/\/login/);
    const left = (await ctx.cookies()).filter((c) => c.name.startsWith("sb-") && c.value);
    assert(left.length === 0, `session cookie still set after sign-out: ${left.map((c) => c.name).join(", ")}`);
    await page.goto(`${BASE}/`);
    await page.waitForURL(/\/login/);
    await ctx.close();
  });

  /* ---------- opening screen for the installed app ---------- */
  await test("opening screen is in the page, is hidden once the app is ready, and iOS launch images are linked", async () => {
    const { ctx, page } = await newPage();
    const res = await page.goto(`${BASE}/login`);
    assert(/id="app-splash"/.test(await res.text()), "splash is not in the first HTML the server sends");
    await page.locator("#email").waitFor();
    await page.waitForFunction(() => document.getElementById("app-splash")?.classList.contains("app-splash-gone"), null, { timeout: 5000 });
    const links = await page.locator('link[rel="apple-touch-startup-image"]').evaluateAll((els) => els.map((e) => e.getAttribute("href")));
    assert(links.length >= 15, `expected launch image links, found ${links.length}`);
    const img = await page.request.get(`${BASE}${links[0]}`);
    assert(img.ok() && /image\/png/.test(img.headers()["content-type"] || ""), "launch image is not served");
    await ctx.close();
  });

  /* ---------- phone layout: bottom menu stays put ---------- */
  await test("on a phone the bottom menu stays at the bottom while the page scrolls inside its own area", async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 700 }, hasTouch: true, isMobile: true });
    ctx.setDefaultTimeout(60_000);
    const page = await ctx.newPage();
    await signIn(page, "pat@example.com", "Correct-Horse-1");
    await page.waitForURL((u) => u.pathname === "/");
    const nav = page.locator("nav", { hasText: "Menu" });
    await nav.waitFor();
    const bottomOf = async () => (await nav.boundingBox()).y + (await nav.boundingBox()).height;
    const before = await bottomOf();
    assert(Math.abs(before - 700) < 1.5, `menu is not at the bottom of the screen (${before})`);
    assert((await page.evaluate(() => document.documentElement.style.getPropertyValue("--app-h"))) !== "", "visible screen height was not published");
    // If the visible screen is shorter than the layout viewport (browser bars), the menu follows the visible bottom
    await page.setViewportSize({ width: 390, height: 640 });
    await page.waitForTimeout(300);
    assert(Math.abs((await bottomOf()) - 640) < 1.5, "menu did not follow a shorter screen");
    await page.setViewportSize({ width: 390, height: 700 });
    await page.waitForTimeout(300);
    // Make the page long enough to scroll, then scroll it to the end
    await page.evaluate(() => { const m = document.querySelector("#app-scroll main"); const pad = document.createElement("div"); pad.style.height = "2000px"; m.appendChild(pad); });
    await page.evaluate(() => document.getElementById("app-scroll").scrollTo(0, 99999));
    await page.waitForTimeout(300);
    const top = await page.evaluate(() => document.getElementById("app-scroll").scrollTop);
    assert(top > 500, "the content area did not scroll");
    assert((await page.evaluate(() => window.scrollY)) === 0, "the whole page scrolled instead of the content area");
    assert(Math.abs((await bottomOf()) - 700) < 1.5, "menu moved while scrolling");
    // If the browser scrolls the page itself (as iOS can after the camera or keyboard), it is put back and the menu returns
    await page.evaluate(() => { document.documentElement.style.minHeight = "3000px"; window.scrollTo(0, 400); });
    await page.waitForTimeout(500);
    assert((await page.evaluate(() => window.scrollY)) === 0, "page was left scrolled behind the frame");
    assert(Math.abs((await bottomOf()) - 700) < 1.5, "menu did not come back after the page was scrolled");
    await ctx.close();
  });

  /* ---------- travel document tiles ---------- */
  await test("business page shows a tile per uploaded document, soonest to expire first", async () => {
    const docs = fake.table("travel_documents");
    docs.push(
      { id: "d0c00000-0000-4000-8000-000000000001", user_id: PAT, kind: "insurance", title: "Zeta Insurance", issuing_country: "Netherlands", document_number: "POL99887766", expiry_date: addDays(today, 400), trip_id: null, file_path: null, created_at: new Date().toISOString() },
      { id: "d0c00000-0000-4000-8000-000000000002", user_id: PAT, kind: "visa", title: "Alpha Visa", issuing_country: "USA", document_number: "V12345678", expiry_date: addDays(today, 20), trip_id: null, file_path: null, created_at: new Date().toISOString() },
      { id: "d0c00000-0000-4000-8000-000000000003", user_id: PAT, kind: "booking", title: "Trip-only Booking", issuing_country: null, document_number: null, expiry_date: addDays(today, 5), trip_id: TRIP_ID, file_path: null, created_at: new Date().toISOString() }
    );
    const { ctx, page } = await newPage();
    await signIn(page, "pat@example.com", "Correct-Horse-1");
    await page.waitForURL((u) => u.pathname === "/");
    await page.getByRole("heading", { name: "Documents", exact: true }).waitFor();
    const titles = await page.locator("section[aria-labelledby=doc-tiles-heading] p.truncate.font-bold").allInnerTexts();
    assert(titles.join("|") === "Visa / e-visa|Travel insurance", `tile order/content was: ${titles.join("|")}`);
    await page.getByText("Expires soon").first().waitFor();
    const text = await page.locator("section[aria-labelledby=doc-tiles-heading]").innerText();
    assert(!text.includes("V12345678") && !text.includes("POL99887766"), "full document number leaked into a tile");
    assert(!text.includes("Trip-only Booking"), "trip document shown on the dashboard tiles");
    assert(text.includes("(20 days)") && /application id/i.test(text) && /policy no/i.test(text), "tile countdown or number labels missing");
    docs.length = 0;
    await ctx.close();
  });

  /* ---------- documents page: summary and expiry bars ---------- */
  await test("documents page: summary cards, needs-attention group and an expiry bar per document", async () => {
    const docs = fake.table("travel_documents");
    const row = (n, kind, title, days) => ({ id: `d0c00000-0000-4000-8000-00000000010${n}`, user_id: PAT, kind, title, issuing_country: "USA", document_number: null, expiry_date: addDays(today, days), trip_id: null, file_path: null, created_at: new Date().toISOString() });
    docs.push(row(1, "visa", "ESTA", 42), row(2, "passport", "Dutch Passport", 3000), row(3, "id", "Old ID", -10));
    const browser2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await browser2.newPage();
    await signIn(page, "pat@example.com", "Correct-Horse-1");
    await page.waitForURL((u) => u.pathname === "/");
    await page.goto(`${BASE}/documents`);
    await page.getByRole("heading", { name: "Needs attention" }).waitFor();
    assert((await page.getByTestId("expiry-meter").count()) === 3, "each document with an expiry shows a bar");
    const text = await page.locator("main").innerText();
    assert(text.includes("42 days left") && text.includes("Expired 10 days ago"), "captions missing");
    assert(/expiring soon/i.test(text) && /valid/i.test(text), "summary cards missing");
    assert((await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)), "page scrolls sideways on a phone");
    await page.locator("main").screenshot({ path: "/tmp/documents-mobile.png" });
    docs.length = 0;
    await browser2.close();
  });

  /* ---------- business navigation ---------- */
  await test("loyalty wallet: empty state, add a card, open its barcode, Escape closes, search and delete", async () => {
    const browser2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await browser2.newPage();
    await signIn(page, "pat@example.com", "Correct-Horse-1");
    await page.waitForURL((u) => u.pathname === "/");
    await page.goto(`${BASE}/personal`);
    await page.getByRole("heading", { name: "Loyalty cards" }).waitFor();
    await page.goto(`${BASE}/personal/loyalty`);
    await page.getByText("No loyalty cards yet").waitFor();
    await page.getByRole("button", { name: "Add your first card" }).click();
    await page.getByLabel("Store name").fill("Greenfield Market");
    await page.getByLabel(/Card type/).fill("Rewards");
    await page.getByLabel("Barcode or card number").fill("4021 8830 1177");
    await page.getByLabel("Barcode format").waitFor();
    assert((await page.getByLabel("Barcode format").innerText()).includes("Auto-detect (CODE128)"), "auto-detect should name the format it picked");
    await page.getByRole("button", { name: "Save card" }).click();
    await page.getByTestId("loyalty-tile").waitFor();
    const tile = await page.getByTestId("loyalty-tile").innerText();
    assert(/Greenfield Market/.test(tile) && /rewards/i.test(tile), "tile shows the name and the card type");
    assert(fake.table("loyalty_cards")[0].card_number === "402188301177" && fake.table("loyalty_cards")[0].user_id === PAT, "stored cleaned number for this user");
    assert((await page.getByTestId("loyalty-tile").locator('svg[aria-label^="Barcode"]').count()) === 0, "the tile shows only the card design, no barcode");
    assert(!(await page.getByText("Show barcode").count()), "no Show barcode button any more");
    await page.getByRole("button", { name: "Open Greenfield Market" }).click();
    await page.getByRole("dialog", { name: /Greenfield Market card/ }).waitFor();
    assert((await page.getByRole("button", { name: "Show back" }).count()) === 0, "no flip button without a back photo");
    assert((await page.getByTestId("card-number").innerText()) === "4021 8830 1177", "number shown in groups");
    assert((await page.locator('[role="dialog"] svg[aria-label^="Barcode for"] rect').count()) > 10, "barcode bars drawn");
    assert(/brightness/i.test(await page.getByRole("dialog").innerText()), "brightness tip shown");
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "detached" });
    // edit: front and back, upload then crop
    const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    await page.getByRole("button", { name: "More actions for Greenfield Market" }).click();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByTestId("slot-front").waitFor();
    await page.getByTestId("slot-back").waitFor();
    assert((await page.getByTestId("color-row").getByRole("button").count()) === 16, "16 colours to pick from");
    assert(await page.getByTestId("color-row").evaluate((el) => el.scrollWidth > el.clientWidth), "the colours scroll sideways on a phone");
    await page.getByRole("button", { name: "Colour #1e3a8a" }).click();
    assert((await page.getByRole("button", { name: "Colour #1e3a8a" }).getAttribute("aria-pressed")) === "true", "a colour from the scrolled part can be picked");
    assert((await page.getByRole("button", { name: "Save changes" }).boundingBox()).y + 20 < 844, "Save stays on screen");
    await page.getByLabel("Upload front photo").setInputFiles({ name: "front.png", mimeType: "image/png", buffer: PNG });
    await page.getByRole("button", { name: "Use full image" }).click();
    await page.getByTestId("slot-front").getByRole("button", { name: "Crop" }).waitFor();
    await page.getByLabel("Scan back photo").setInputFiles({ name: "back.png", mimeType: "image/png", buffer: PNG });
    await page.getByRole("button", { name: "Use full image" }).click();
    await page.getByTestId("slot-back").getByRole("button", { name: "Remove" }).waitFor();
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.getByRole("dialog", { name: "Edit card" }).waitFor({ state: "detached" });
    const row = fake.table("loyalty_cards")[0];
    assert(row.image_path && row.back_image_path, "front and back photos saved on the card");
    assert(row.color === "#1e3a8a", "the picked colour is saved");
    assert(fake.log.filter((l) => l.table === "storage" && l.op === "upload").length >= 2, "both photos uploaded");
    await page.locator('[data-testid="loyalty-tile"] img').first().waitFor();
    await page.getByRole("button", { name: "Open Greenfield Market" }).click();
    await page.getByRole("button", { name: "Show back" }).click();
    await page.getByRole("button", { name: "Show front" }).waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "detached" });
    await page.getByLabel("Search cards").fill("zzz");
    await page.getByText(/No card matches/).waitFor();
    await page.getByLabel("Search cards").fill("green");
    await page.getByTestId("loyalty-tile").waitFor();
    assert((await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)), "wallet scrolls sideways on a phone");
    await page.getByRole("button", { name: "More actions for Greenfield Market" }).click();
    await page.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).last().click();
    await page.getByText("No loyalty cards yet").waitFor();
    assert(fake.table("loyalty_cards").length === 0, "card removed from the database");
    await browser2.close();
  });

  await test("offline: loyalty cards and documents open with no connection, from the copy saved on the phone", async () => {
    const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    fake.storage.set(`sign/loyalty-cards/${PAT}/front.png`, PNG);
    fake.table("loyalty_cards").push(
      { id: "1c000000-0000-4000-8000-000000000001", user_id: PAT, store_name: "Greenfield Market", holder_name: null, category: "Rewards", card_number: "402188301177", barcode_format: "CODE128", color: null, image_path: `${PAT}/front.png`, back_image_path: null, created_at: new Date().toISOString() },
      { id: "1c000000-0000-4000-8000-000000000002", user_id: PAT, store_name: "Blue Bottle", holder_name: null, category: null, card_number: "99887766", barcode_format: "CODE128", color: null, image_path: null, back_image_path: null, created_at: new Date().toISOString() }
    );
    fake.table("travel_documents").push({ id: "d0c00000-0000-4000-8000-0000000000aa", user_id: PAT, kind: "passport", title: "Offline Passport", issuing_country: "Aruba", document_number: "P1234567", expiry_date: addDays(today, 900), trip_id: null, file_path: null, created_at: new Date().toISOString() });
    const EXP_ID = "e0000000-0000-4000-8000-0000000000e1";
    fake.table("expenses").push({ id: EXP_ID, trip_id: TRIP_ID, user_id: PAT, merchant: "Trip Cafe", amount: 12, currency: "USD", exchange_rate: 1, amount_usd: 12, category: "Meals", expense_date: today, notes: null, receipt_path: null, created_at: new Date().toISOString() });
    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx2.addInitScript(() => { try { localStorage.setItem("force-sw", "1"); } catch {} });
    const page = await ctx2.newPage();
    if (process.env.E2E_DEBUG) {
      page.on("console", (m) => console.log("[console]", m.type(), m.text().slice(0, 200)));
      page.on("pageerror", (e) => console.log("[pageerror]", String(e.stack || e).slice(0, 600)));
      page.on("response", async (r) => { const u = r.url(); if (/\/_next\/static\/.*\.js/.test(u)) { const ct = r.headers()["content-type"] || ""; const body = await r.text().catch(() => ""); if (!/javascript/.test(ct) || body.startsWith("<")) console.log("[badjs]", r.status(), r.fromServiceWorker(), ct, u.slice(0, 120), JSON.stringify(body.slice(0, 80))); } });
      page.on("requestfailed", (r) => console.log("[reqfailed]", r.url().slice(0, 120), r.failure()?.errorText));
    }
    try {
      await signIn(page, "pat@example.com", "Correct-Horse-1");
      await page.waitForURL((u) => u.pathname === "/");
      await page.goto(`${BASE}/personal/loyalty`);
      await page.getByTestId("loyalty-tile").first().waitFor();
      // The service worker takes charge, then the app keeps its pages and data in the background
      await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });
      await page.waitForFunction(() => !!localStorage.getItem("offline-warm"), null, { timeout: 150000 });
      const kept = await page.evaluate(async () => (await (await caches.open("expense-pages-v1")).keys()).map((r) => new URL(r.url).pathname));
      assert(kept.includes("/personal/loyalty") && kept.includes("/documents"), `pages kept for offline: ${kept.join(", ")}`);

      await ctx2.setOffline(true);
      await page.reload();
      await page.getByTestId("loyalty-tile").first().waitFor({ timeout: 30000 });
      assert((await page.getByTestId("loyalty-tile").count()) === 2, "both cards show with no connection");
      assert(/offline/i.test(await page.getByTestId("offline-notice").innerText()), "the offline notice shows");
      assert((await page.locator('[data-testid="loyalty-tile"] img').count()) === 1, "the saved front photo shows offline");
      await page.getByRole("button", { name: "Open Greenfield Market" }).click();
      await page.getByRole("dialog", { name: /Greenfield Market card/ }).waitFor();
      assert((await page.getByTestId("card-number").innerText()) === "4021 8830 1177", "the barcode number opens offline");
      await page.keyboard.press("Escape");
      // A card added with no connection waits on the phone and shows a badge
      await page.getByRole("button", { name: "Add card" }).click();
      await page.getByLabel("Store name").fill("Offline Deli");
      await page.getByLabel("Barcode or card number").fill("5566778899");
      await page.getByRole("button", { name: "Save card" }).click();
      await page.getByText("Waiting to sync").first().waitFor();
      assert((await page.getByTestId("loyalty-tile").count()) === 3, "the new card shows at once, with no connection");
      assert(!fake.table("loyalty_cards").some((c) => c.store_name === "Offline Deli"), "nothing was sent while offline");

      await page.goto(`${BASE}/documents`);
      await page.getByText("Offline Passport").first().waitFor({ timeout: 30000 });
      // A document added with no connection waits on the phone
      await page.getByRole("button", { name: "Add document" }).first().click();
      await page.getByRole("dialog", { name: "Add document" }).waitFor({ timeout: 10000 }).catch(async () => { throw new Error("form did not open: " + (await page.locator("body").innerText()).slice(0, 400)); });
      await page.getByRole("dialog", { name: "Add document" }).locator('input[maxlength="120"]').fill("Offline Ticket");
      await page.getByRole("dialog", { name: "Add document" }).locator('input[type="date"]').fill(addDays(today, 400));
      await page.getByRole("button", { name: "Save document" }).click();
      await page.getByTestId("docs-waiting").waitFor({ timeout: 8000 }).catch(async () => { const idb = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open("expense-tracker-offline"); r.onsuccess = () => { const g = r.result.transaction("expenses").objectStore("expenses").getAll(); g.onsuccess = () => res(JSON.stringify(g.result.map((i) => ({ id: i.id, kind: i.kind, u: i.userId, trip: i.tripId, st: i.status })))); }; })); throw new Error("no waiting note; outbox=" + idb + " dialog=" + (await page.locator("body").innerText()).slice(-500)); });
      await page.getByText("Offline Ticket").first().waitFor();
      assert(!fake.table("travel_documents").some((d) => d.title === "Offline Ticket"), "nothing was sent while offline");

      // A trip, and an expense on it, can be changed with no connection
      await page.goto(`${BASE}/trips/${TRIP_ID}`);
      await page.getByText("Trip Cafe").first().waitFor({ timeout: 30000 });
      await page.goto(`${BASE}/trips/${TRIP_ID}/expenses/${EXP_ID}`);
      const merchantInput = page.getByText("Merchant", { exact: true }).locator("xpath=following::input[1]");
      await merchantInput.waitFor({ timeout: 30000 });
      await merchantInput.fill("Edited Cafe");
      await page.getByRole("button", { name: "Save changes" }).click();
      await page.getByText("Edited Cafe").first().waitFor({ timeout: 30000 });
      assert((await page.getByText("Waiting to sync").count()) >= 1, "the changed expense shows as waiting");
      assert(fake.table("expenses").find((e) => e.id === EXP_ID).merchant === "Trip Cafe", "nothing was sent while offline");

      // A page that was never saved gives a small page that leads to the saved ones
      await page.goto(`${BASE}/reports`);
      await page.getByRole("heading", { name: "You are offline" }).waitFor();
      await page.getByRole("link", { name: "Loyalty cards" }).click();
      await page.getByTestId("loyalty-tile").first().waitFor({ timeout: 30000 });

      // Back online: the copy is refreshed, and signing out removes everything kept on the phone
      await ctx2.setOffline(false);
      await page.reload();
      await page.getByTestId("loyalty-tile").first().waitFor();
      await page.waitForFunction(() => !document.body.innerText.includes("Waiting to sync"), null, { timeout: 60000 });
      assert(fake.table("loyalty_cards").some((c) => c.store_name === "Offline Deli" && c.user_id === PAT), "the card added offline is saved once back online");
      assert(fake.table("expenses").find((e) => e.id === EXP_ID).merchant === "Edited Cafe", "the expense changed offline is saved once back online");
      assert(fake.table("travel_documents").some((d) => d.title === "Offline Ticket" && d.user_id === PAT), "the document added offline is saved once back online");
      await page.getByRole("button", { name: /Sign out/ }).first().click().catch(async () => {
        await page.getByRole("button", { name: /menu/i }).first().click();
        await page.getByRole("button", { name: /Sign out/ }).first().click();
      });
      await page.waitForURL((u) => u.pathname === "/login");
      const left = await page.evaluate(async () => ({ pages: (await caches.keys()).includes("expense-pages-v1"), warm: !!localStorage.getItem("offline-warm") }));
      assert(!left.pages && !left.warm, "signing out removes the saved pages and data");
    } finally {
      fake.table("loyalty_cards").length = 0;
      fake.table("travel_documents").length = 0;
      await ctx2.close();
    }
  });

  await test("one Business link; Trips and Reports switch inside it", async () => {
    const { ctx, page } = await newPage();
    await signIn(page, "pat@example.com", "Correct-Horse-1");
    await page.waitForURL((u) => u.pathname === "/");
    const side = page.locator("aside");
    await side.getByRole("link", { name: "Business" }).waitFor();
    assert((await side.getByRole("link", { name: /^Trips$/ }).count()) === 0, "separate Trips link still in the menu");
    assert((await side.getByRole("link", { name: /^Reports$/ }).count()) === 0, "separate Reports link still in the menu");
    await side.getByRole("link", { name: "Business" }).click();
    await page.waitForURL((u) => u.pathname === "/trips");
    const sw = page.getByRole("navigation", { name: "Business sections" });
    await sw.getByRole("link", { name: "Reports" }).click();
    await page.waitForURL((u) => u.pathname === "/reports");
    await page.getByRole("navigation", { name: "Business sections" }).getByRole("link", { name: "Trips" }).waitFor();
    await ctx.close();
  });

  /* ---------- scan and upload ---------- */
  const JPEG = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");
  await test("Upload with one active trip goes straight to its form, with a Change button", async () => {
    const { ctx, page } = await newPage();
    await signIn(page, "pat@example.com", "Correct-Horse-1");
    await page.waitForURL((u) => u.pathname === "/");
    await page.getByRole("button", { name: "Scan" }).waitFor();
    await page.locator('input[type=file]:not([capture])').setInputFiles({ name: "receipt.jpg", mimeType: "image/jpeg", buffer: JPEG });
    await page.waitForURL((u) => u.pathname === `/trips/${TRIP_ID}/add-expense`, { timeout: 60_000 });
    await page.getByText("Miami Conference \u00b7 Business").waitFor();
    await page.getByRole("button", { name: "Change" }).waitFor();
    await ctx.close();
  });

  await test("a PDF can only be kept as a document: the sheet offers just that", async () => {
    const { ctx, page } = await newPage();
    await signIn(page, "pat@example.com", "Correct-Horse-1");
    await page.waitForURL((u) => u.pathname === "/");
    await page.locator('input[type=file]:not([capture])').setInputFiles({ name: "policy.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF") });
    await page.getByRole("dialog", { name: "Where does this go?" }).waitFor();
    await page.getByRole("button", { name: "Save to Document" }).waitFor();
    await ctx.close();
  });

  await test("a PDF saved as a document from the dashboard opens the document form with the file", async () => {
    const { ctx, page } = await newPage();
    await signIn(page, "pat@example.com", "Correct-Horse-1");
    await page.waitForURL((u) => u.pathname === "/");
    await page.locator('input[type=file]:not([capture])').setInputFiles({ name: "policy.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF") });
    await page.getByRole("button", { name: "Save to Document" }).click();
    await page.waitForURL((u) => u.pathname === "/documents", { timeout: 60_000 });
    await page.getByText("policy.pdf").first().waitFor({ timeout: 15_000 });
    await ctx.close();
  });

  await test("a photo sent to Documents from the dashboard goes on to the crop step", async () => {
    const { ctx, page } = await newPage();
    await signIn(page, "pat@example.com", "Correct-Horse-1");
    await page.waitForURL((u) => u.pathname === "/");
    await page.evaluate((b64) => sessionStorage.setItem("quick-scan-v2", JSON.stringify({ key: "document", name: "license.jpg", type: "image/jpeg", dataUrl: `data:image/jpeg;base64,${b64}`, at: Date.now(), reason: null })), JPEG.toString("base64"));
    await page.goto(`${BASE}/documents?quick=1`);
    await page.getByText("Crop to the part you need").waitFor({ timeout: 15_000 });
    await ctx.close();
  });

  await test("documents: Add document is a popup whose buttons stay on screen, with a guard against losing what was typed", async () => {
    const docs = fake.table("travel_documents");
    for (let i = 1; i <= 6; i++) docs.push({ id: `d0c00000-0000-4000-8000-00000000020${i}`, user_id: PAT, kind: "visa", title: `Visa ${i}`, issuing_country: "USA", document_number: null, expiry_date: addDays(today, 300 + i), trip_id: null, file_path: null, created_at: new Date().toISOString() });
    const ctx = await browser.newContext({ viewport: { width: 390, height: 700 }, hasTouch: true, isMobile: true });
    ctx.setDefaultTimeout(60_000);
    const page = await ctx.newPage();
    await signIn(page, "pat@example.com", "Correct-Horse-1");
    await page.waitForURL((u) => u.pathname === "/");
    await page.goto(`${BASE}/documents`);
    await page.getByRole("button", { name: "Add document" }).first().click();
    const dlg = page.getByRole("dialog", { name: "Add document" });
    await dlg.waitFor();
    const save = dlg.getByRole("button", { name: "Save document" });
    const box = await save.boundingBox();
        assert(box && box.y + box.height <= 700 + 1, `Save is below the screen (${box && box.y + box.height})`);
    assert((await dlg.getByRole("button", { name: "Scan with camera" }).boundingBox()).y < 700, "Scan button is off screen");
    // Empty form: Escape closes without asking
    await page.keyboard.press("Escape");
    await dlg.waitFor({ state: "detached" });
    // Something typed: Escape asks first, Keep editing stays
    await page.getByRole("button", { name: "Add document" }).first().click();
    await dlg.waitFor();
    await dlg.locator('input[maxlength="120"]').fill("My licence");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Keep editing" }).click();
    assert(await dlg.isVisible(), "popup closed even though the person chose Keep editing");
    await dlg.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "Discard" }).click();
    await dlg.waitFor({ state: "detached" });
    docs.length = 0;
    await ctx.close();
  });

  /* ---------- read a receipt again ---------- */
  await test("an expense can read its receipt again: the button shows with a receipt and not without", async () => {
    const id = "e0000000-0000-4000-8000-0000000000aa";
    fake.table("expenses").push({ id, trip_id: TRIP_ID, user_id: PAT, merchant: "Unread", amount: 0, currency: "USD", exchange_rate: 1, amount_usd: 0, category: "Other", expense_date: today, notes: null, receipt_path: null, created_at: new Date().toISOString() });
    const { ctx, page } = await newPage();
    await signIn(page, "pat@example.com", "Correct-Horse-1");
    await page.waitForURL((u) => u.pathname === "/");
    await page.goto(`${BASE}/trips/${TRIP_ID}/expenses/${id}`);
    await page.getByText("No receipt uploaded yet.").waitFor();
    assert((await page.getByRole("button", { name: "Read receipt again" }).count()) === 0, "button shown without a receipt");
    await page.locator('input[type=file]:not([capture])').setInputFiles({ name: "receipt.jpg", mimeType: "image/jpeg", buffer: JPEG });
    await page.getByRole("button", { name: "Read receipt again" }).waitFor();
    await ctx.close();
  });

  /* ---------- adding an expense ---------- */
  await test("adding an expense saves it and shows it on the trip", async () => {
    const { ctx, page } = await newPage();
    await signIn(page, "pat@example.com", "Correct-Horse-1");
    await page.waitForURL((u) => u.pathname === "/");
    await page.goto(`${BASE}/trips/${TRIP_ID}/add-expense`);
    await page.locator("#merchant").fill("Hilton Test");
    await page.locator("#amount").fill("42.50");
    await page.getByRole("button", { name: "Save Expense" }).click();
    await page.waitForURL((u) => u.pathname === `/trips/${TRIP_ID}`, { timeout: 90_000 });
    const rows = fake.table("expenses").filter((e) => e.merchant === "Hilton Test");
    assert(rows.length === 1, `expected 1 saved expense, found ${rows.length}`);
    assert(rows[0].trip_id === TRIP_ID && rows[0].user_id === PAT, "expense saved under the wrong trip or user");
    assert(Number(rows[0].amount) === 42.5, `amount saved as ${rows[0].amount}`);
    await page.getByText("Hilton Test").first().waitFor();
    await ctx.close();
  });

  await test("outbox: an expense saved with no connection waits, shows in the pill and Waiting page, and is sent when back online (also one saved before kinds existed)", async () => {
    const { ctx, page } = await newPage();
    await signIn(page, "pat@example.com", "Correct-Horse-1");
    await page.waitForURL((u) => u.pathname === "/");
    await page.goto(`${BASE}/trips/${TRIP_ID}/add-expense`);
    await page.locator("#merchant").fill("Offline Diner");
    await page.locator("#amount").fill("18.25");
    await ctx.setOffline(true);
    await page.getByRole("button", { name: "Save Expense" }).click();
    await page.getByRole("status").filter({ hasText: /pending sync/ }).waitFor({ timeout: 60_000 });
    assert(fake.table("expenses").filter((e) => e.merchant === "Offline Diner").length === 0, "nothing reaches the server while offline");
    // An item written by the previous version has no kind: it must still be recognised as an expense
    await page.evaluate(async () => {
      const db = await new Promise((res, rej) => { const r = indexedDB.open("expense-tracker-offline", 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      const legacy = await new Promise((res) => { const t = db.transaction("expenses", "readwrite"); const st = t.objectStore("expenses"); st.getAll().onsuccess = (e) => { const first = e.target.result[0]; const copy = { ...first, id: "00000000-0000-4000-8000-00000000f00d", merchant: "Legacy Cafe" }; delete copy.kind; st.put(copy); res(true); }; });
      db.close();
      return legacy;
    });
    await page.goto(`${BASE}/pending`).catch(() => {});
    await ctx.setOffline(false);
    await page.goto(`${BASE}/pending`);
    await page.getByRole("heading", { name: "Waiting to sync" }).waitFor();
    await page.waitForFunction(() => /Nothing is waiting/.test(document.body.innerText), null, { timeout: 90_000 });
    const rows = fake.table("expenses").filter((e) => ["Offline Diner", "Legacy Cafe"].includes(e.merchant));
    if (rows.length !== 2) console.log("[pending page]", (await page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 600));
    assert(rows.length === 2, `both waiting expenses were sent, found ${rows.map((r) => r.merchant).join(",") || 0}; left in the table: ${fake.table("expenses").map((r) => r.merchant).join(",")}`);
    await ctx.close();
  });

  await test("an expense with no amount is not saved", async () => {
    const { ctx, page } = await newPage();
    await signIn(page, "pat@example.com", "Correct-Horse-1");
    await page.waitForURL((u) => u.pathname === "/");
    await page.goto(`${BASE}/trips/${TRIP_ID}/add-expense`);
    const before = fake.table("expenses").length;
    await page.locator("#merchant").fill("No Amount Cafe");
    await page.getByRole("button", { name: "Save Expense" }).click();
    await page.waitForTimeout(1500);
    assert(fake.table("expenses").length === before, "an expense without an amount was saved");
    assert(new URL(page.url()).pathname.endsWith("/add-expense"), "left the form");
    await ctx.close();
  });

  /* ---------- admin pages ---------- */
  await test("normal users cannot open admin pages", async () => {
    const { ctx, page } = await newPage();
    await signIn(page, "pat@example.com", "Correct-Horse-1");
    await page.waitForURL((u) => u.pathname === "/");
    for (const path of ["/admin/security", "/admin/users", "/admin/branding", "/admin/support"]) {
      await page.goto(`${BASE}${path}`);
      await page.waitForURL((u) => u.pathname === "/", { timeout: 60_000 });
    }
    const api = await page.request.get(`${BASE}/api/admin/security`);
    assert([401, 403].includes(api.status()), `admin security API answered ${api.status()} to a normal user`);
    await ctx.close();
  });

  const admin = await newPage();
  await signIn(admin.page, "admin@example.com", "Admin-Pass-123");
  await admin.page.waitForURL((u) => u.pathname === "/");

  await test("admin: Users page lists the people and roles", async () => {
    await admin.page.goto(`${BASE}/admin/users`);
    await admin.page.getByRole("heading", { name: /User Roles/ }).waitFor();
    await admin.page.getByText("pat@example.com").first().waitFor();
    await admin.page.getByText("admin@example.com").first().waitFor();
  });

  await test("admin: Roles API offers the Personal dashboard option", async () => {
    const r = await admin.page.request.get(`${BASE}/api/admin/roles`);
    assert(r.ok(), `roles API answered ${r.status()}`);
    const body = await r.json();
    const user = body.roles.find((x) => x.key === "user");
    assert(user && user.effective.includes("personal.dashboard"), "user role does not have personal.dashboard");
    const asst = body.roles.find((x) => x.key === "assistant");
    assert(asst && !asst.effective.includes("personal.dashboard"), "assistant role should not have personal.dashboard once reviewed");
  });

  await test("admin: Security page shows events and the audit trail", async () => {
    await admin.page.goto(`${BASE}/admin/security`);
    await admin.page.getByRole("heading", { name: /Security/ }).first().waitFor();
    await admin.page.getByRole("heading", { name: "Security events" }).waitFor();
    await admin.page.getByRole("button", { name: /^Security events \([1-9]/ }).waitFor(); // the failed sign-in from the earlier test
    await admin.page.locator("span.font-medium", { hasText: "Login failed" }).first().waitFor();
    await admin.page.getByRole("button", { name: /Audit trail/ }).click();
    await admin.page.getByText("role.update").first().waitFor();
  });

  await test("admin: Branding page loads the saved settings", async () => {
    await admin.page.goto(`${BASE}/admin/branding`);
    await admin.page.locator('input[value="E2E Expense App"]').waitFor();
  });

  await test("admin: Support page lists a request", async () => {
    await admin.page.goto(`${BASE}/admin/support`);
    await admin.page.getByText("Cannot log in").first().waitFor();
  });

  await test("weather lives inside the welcome card on both views", async () => {
    await admin.page.goto(`${BASE}/`);
    const card = admin.page.locator("div.rounded-xl", { has: admin.page.getByRole("heading", { level: 1 }) }).first();
    await card.getByText(/Weather unavailable|°/).first().waitFor(); // no weather service in the test setup, so the fallback text shows
    await admin.page.getByRole("tab", { name: "Personal" }).click();
    assert(await card.getByText(/Weather unavailable|°/).first().isVisible(), "weather disappeared on the Personal view");
    await admin.page.getByRole("tab", { name: "Business" }).click();
  });

  await test("admin: the Personal view of the home page opens", async () => {
    await admin.page.goto(`${BASE}/`);
    await admin.page.getByRole("tab", { name: "Personal" }).click();
    await admin.page.getByText("Total spent (AWG)").waitFor();
    await admin.page.getByRole("tab", { name: "Business" }).click();
    await admin.page.getByRole("heading", { name: "Active Trips" }).waitFor();
    assert((await admin.page.getByText("This Month").count()) === 0, "spending tiles should no longer be on the business view");
  });

  if (process.env.E2E_SHOT) {
    // Optional: screenshots of the welcome card with weather, for a visual check (E2E_SHOT=/some/folder)
    for (const [name, vp] of [["desktop", { width: 1280, height: 700 }], ["phone", { width: 390, height: 844 }]]) {
      const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, storageState: await admin.ctx.storageState() });
      const page = await ctx.newPage();
      await page.route("**/api/weather*", (r) => r.fulfill({ json: { city: "Oranjestad", tempC: 31, code: 2, isDay: true, rainChance: 20, countryCode: "AW" } }));
      await page.goto(`${BASE}/`);
      await page.getByText("31").first().waitFor();
      await page.screenshot({ path: `${process.env.E2E_SHOT}/welcome-${name}.png` });
      await ctx.close();
    }
  }

  await admin.ctx.close();
  await browser.close();
} catch (e) {
  failed++;
  console.error("E2E setup error:", e?.message || e);
} finally {
  await stopAll();
}

console.log(failed ? `\n${failed} e2e check(s) failed` : `\nall ${results.length} e2e checks passed`);
if (failed && process.env.E2E_SHOW_LOG) console.log(appLog.slice(-4000));
process.exit(failed ? 1 : 0);
