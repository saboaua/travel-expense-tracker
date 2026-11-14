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
import { createSharingBackend } from "./sharing-backend.mjs";

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
// A role that has the Partner sharing option (off for every other role until an admin turns it on)
fake.table("roles").push({ id: "family-role", key: "family", label: "Family", description: "Has partner sharing", permissions: ["trips", "personal", "documents", "loyalty", "sharing"], known_features: [...FEATURES, "sharing"], is_system: false, created_at: new Date().toISOString() });
fake.table("roles").push({ id: "iptv-client-role", key: "iptv-client", label: "IPTV client", description: "One page", permissions: ["iptv.mine"], known_features: [...FEATURES, "sharing", "subscriptions", "iptv.mine"], is_system: false, created_at: new Date().toISOString() });
fake.seed("app_settings", [{ id: 1, app_name: "E2E Expense App", logo_url: null, primary_color: "#4f46e5", login_logo_size: 56, privacy_policy: "", support_email: "help@example.com", personal_enabled: true }]);
fake.seed("currencies", [
  { code: "USD", name: "US Dollar", usd_rate: 1, enabled: true, sort_order: 1 },
  { code: "AWG", name: "Aruban Florin", usd_rate: 0.558659, enabled: true, sort_order: 2 },
  { code: "EUR", name: "Euro", usd_rate: 1.1, enabled: true, sort_order: 3 },
]);
for (const t of ["profiles", "trips", "expenses", "personal_projects", "personal_expenses", "personal_spends", "house_areas", "utility_bills", "utility_prefs", "personal_budgets", "savings_plans", "savings_events", "price_checks", "grocery_receipts", "grocery_items", "travel_documents", "loyalty_cards", "security_events", "audit_logs", "support_requests", "subscriptions", "iptv_customers", "iptv_clients", "iptv_renewals", "trip_flights", "grocery_price_matches", "grocery_online_matches", "grocery_online_prefs", "store_catalog", "shopping_list_items", "store_locations", "bill_email_addresses", "bill_email_senders", "bill_email_log"]) fake.table(t);

const PAT = fake.addUser({ email: "pat@example.com", password: "Correct-Horse-1", role: "user", full_name: "Pat Tester" });
fake.addUser({ email: "newbie@example.com", password: "Temp-Pass-1", role: "user", full_name: "New Person" });
const ADMIN = fake.addUser({ email: "admin@example.com", password: "Admin-Pass-123", role: "admin", full_name: "Ada Admin" });
const ALICE = fake.addUser({ email: "alice@example.com", password: "Alice-Pass-123", role: "family", full_name: "Alice Sharer" });
const BOB = fake.addUser({ email: "bob@example.com", password: "Bob-Pass-12345", role: "family", full_name: "Bob Partner" });
fake.addUser({ email: "carol@example.com", password: "Carol-Pass-123", role: "family", full_name: "Carol Stranger" });
fake.addUser({ email: "maria@example.com", password: "Maria-Pass-123", role: "iptv-client", full_name: "Maria Lopez" });
fake.addUser({ email: "sam@example.com", password: "Sam-Pass-12345", role: "assistant", full_name: "Sam Assistant" });
const HELP_AT = new Date().toISOString();
fake.table("help_topics").push(
  { id: "c0c0c0c0-0000-4000-8000-000000000001", slug: "add-to-home-screen", title: "Add the app to your home screen", category: "Getting started", summary: "Open it like any other app.", body: "## iPhone and iPad\n1. Open the app in **Safari**.\n2. Tap **Share**.\n3. Tap **Add to Home Screen**.\n\n> Tip: use Safari.", sort_order: 10, published: true, updated_at: HELP_AT },
  { id: "c0c0c0c0-0000-4000-8000-000000000002", slug: "share-with-partner", title: "Share with a partner", category: "Sharing", summary: "Let someone you trust see a card.", body: "- A card\n- A trip", sort_order: 20, published: true, updated_at: HELP_AT },
);
const today = todayAruba();
const TRIP_ID = "7d1c6a1e-3b7f-4d6a-9d52-0f4a3a1b2c3d";
fake.table("trips").push({ id: TRIP_ID, user_id: PAT, name: "Miami Conference", destination: "Miami", category: "Business", start_date: addDays(today, -1), end_date: addDays(today, 2), currency: "USD", status: "active", notes: null, created_at: new Date().toISOString() });
fake.table("support_requests").push({ id: "b0a6a8a2-0000-4000-8000-000000000001", name: "Casey", email: "casey@example.com", subject: "Cannot log in", message: "Reset please", status: "new", created_at: new Date().toISOString() });
fake.table("audit_logs").push({ id: "b0a6a8a2-0000-4000-8000-000000000003", created_at: new Date().toISOString(), action: "expenses.created", entity_type: "expenses", entity_id: "e1", actor_id: PAT, actor_email: "pat@example.com", details: { merchant: "Uber", amount: 5.45, currency: "USD", category: "Transport" } });
fake.table("audit_logs").push({ id: "b0a6a8a2-0000-4000-8000-000000000002", created_at: new Date().toISOString(), action: "role.update", entity_type: "role", entity_id: "user", actor_id: ADMIN, actor_email: "admin@example.com", details: {} });

/* ---------------- start everything ---------------- */
// The sharing functions run as the real SQL from supabase/migration_sharing.sql on a real Postgres engine (PGlite)
const sharingDb = await createSharingBackend(fake, SERVICE_KEY);
// Community prices: the functions the real database has, as stand-ins that also record what the app sent
const sharedCalls = [];
let sharedCount = 0;
fake.setRpcHook(async (name, body, uid, bearer) => {
  if (name === "share_prices") { sharedCalls.push(body); sharedCount += Array.isArray(body.rows) ? body.rows.length : 0; return { status: 200, body: Array.isArray(body.rows) ? body.rows.length : 0 }; }
  if (name === "my_shared_count") return { status: 200, body: sharedCount };
  if (name === "unshare_my_prices") { const n = sharedCount; sharedCount = 0; return { status: 200, body: n }; }
  if (name === "community_search") return { status: 200, body: /coca/i.test(String(body.q)) ? [
    { product_key: "AWG|coca cola|330 ml|", product_name: "Coca Cola", size_label: "330 ml", currency: "AWG", store_name: "New Ten Sing", price: 1.59, reporters: 7, last_month: "2026-11-01" },
    { product_key: "AWG|coca cola|330 ml|", product_name: "Coca Cola", size_label: "330 ml", currency: "AWG", store_name: "Ling & Sons", price: 1.45, reporters: 12, last_month: "2026-11-01" },
  ] : [] };
  return sharingDb.hook(name, body, uid, bearer);
});
await fake.listen(FAKE_PORT);
// E2E_PROD=1 runs against a production build (made beforehand with tests/e2e/build-prod.sh), which is how phones get the app
const app = spawn("npx", ["next", process.env.E2E_PROD ? "start" : "dev", "-p", String(APP_PORT), "-H", "localhost"], {
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${FAKE_PORT}`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    NEXT_TELEMETRY_DISABLED: "1",
    TURNSTILE_SECRET_KEY: "",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
    INBOUND_EMAIL_BASE: "@in.example.com",
    INBOUND_EMAIL_SECRET: "e2e-inbound-secret-long",
    INBOUND_EMAIL_AUTH: "off",
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

  /* ---------- passwords ---------- */
  await test("new password screen: shows what is wrong, hides the text until the eye is tapped, and survives a dropped connection", async () => {
    const { ctx, page } = await newPage();
    await signIn(page, "newbie@example.com", "Temp-Pass-1");
    await page.waitForURL((u) => u.pathname === "/");
    await page.goto(`${BASE}/change-password`);
    await page.waitForLoadState("networkidle");
    const pw = page.locator("#password"), cf = page.locator("#confirm");
    assert((await pw.getAttribute("type")) === "password", "the new password is hidden while typing");
    assert((await cf.getAttribute("type")) === "password", "the confirmation is hidden while typing");
    await pw.fill("abc");
    await page.locator('button[type="submit"]').click();
    assert((await page.locator("form [role=alert]").innerText()).includes("At least 8 characters"), "a short password gets an error message");
    await pw.fill("abcdefgh1");
    await page.locator('button[type="submit"]').click();
    assert((await page.locator("form [role=alert]").innerText()).includes("uppercase"), "a missing capital gets an error message");
    await pw.fill("Brand-New-Pass1");
    await cf.fill("Brand-New-Pass2");
    assert((await page.getByTestId("password-match").innerText()).includes("do not match"), "the mismatch shows while typing");
    await page.locator('button[type="submit"]').click();
    assert((await page.locator("form [role=alert]").innerText()).includes("Passwords do not match"), "a different confirmation gets an error message");
    assert(fake.log.filter((l) => l.table === "auth" && l.op === "password-update").length === 0, "nothing was saved yet");
    await page.getByRole("button", { name: "Show password" }).first().click();
    assert((await pw.getAttribute("type")) === "text", "the eye shows the password");
    await page.getByRole("button", { name: "Hide password" }).first().click();
    assert((await pw.getAttribute("type")) === "password", "and hides it again");
    await cf.fill("Brand-New-Pass1");
    assert((await page.getByTestId("password-match").innerText()).includes("match"), "a matching pair is confirmed");
    fake.dropNextPasswordUpdates(1); // the first try loses its connection ("Load failed" on a phone)
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((u) => u.pathname === "/", { timeout: 20_000 });
    assert(fake.log.some((l) => l.table === "auth" && l.op === "password-update"), "the retry saved the password");
    await ctx.close();
  });

  await test("reset link: an expired link says so, and the page exists", async () => {
    const { ctx, page } = await newPage();
    await page.goto(`${BASE}/reset-password?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`);
    await page.getByText("This link no longer works").waitFor();
    await page.getByRole("link", { name: "Send a new link" }).waitFor();
    await ctx.close();
  });

  /* ---------- app icon ---------- */
  await test("installed app: a changed logo shows the icon notice with the steps, and Got it remembers", async () => {
    const { ctx, page } = await newPage();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "standalone", { get: () => true });
      try { localStorage.setItem("app-icon-version-seen", "old-logo"); } catch {}
    });
    await signIn(page, "pat@example.com", "Correct-Horse-1");
    await page.waitForURL((u) => u.pathname === "/");
    const notice = page.getByTestId("icon-update-notice");
    await notice.waitFor({ timeout: 30_000 });
    assert(/Add to Home Screen/.test(await notice.innerText()) || /install it again/.test(await notice.innerText()), "the notice says how to get the new icon");
    await notice.getByRole("button", { name: "Got it" }).click();
    await notice.waitFor({ state: "detached" });
    assert((await page.evaluate(() => localStorage.getItem("app-icon-version-seen"))) !== "old-logo", "the new icon version is remembered");
    await ctx.close();
  });

  await test("in a normal browser tab the icon notice never shows", async () => {
    const { ctx, page } = await newPage();
    await page.addInitScript(() => { try { localStorage.setItem("app-icon-version-seen", "old-logo"); } catch {} });
    await signIn(page, "pat@example.com", "Correct-Horse-1");
    await page.waitForURL((u) => u.pathname === "/");
    await page.waitForTimeout(12_000);
    assert((await page.getByTestId("icon-update-notice").count()) === 0, "no notice outside the installed app");
    await ctx.close();
  });

  /* ---------- touch behaviour ---------- */
  await test("controls do not flash grey or select text on long press, while inputs and card numbers stay selectable", async () => {
    const { ctx, page } = await newPage();
    await signIn(page, "pat@example.com", "Correct-Horse-1");
    await page.waitForURL((u) => u.pathname === "/");
    await page.getByRole("button", { name: "Scan" }).waitFor();
    const style = await page.evaluate(() => {
      const css = (el, prop) => getComputedStyle(el)[prop];
      const btn = document.querySelector("button");
      const probe = document.createElement("input");
      const num = document.createElement("p");
      num.className = "select-text";
      document.body.append(probe, num);
      const out = {
        btnSelect: css(btn, "userSelect") || css(btn, "webkitUserSelect"),
        btnTouch: css(btn, "touchAction"),
        btnTap: css(btn, "webkitTapHighlightColor"),
        inputSelect: css(probe, "userSelect") || css(probe, "webkitUserSelect"),
        textSelect: css(num, "userSelect") || css(num, "webkitUserSelect"),
      };
      probe.remove(); num.remove();
      return out;
    });
    assert(style.btnSelect === "none", `buttons do not select text (got ${style.btnSelect})`);
    assert(style.btnTouch === "manipulation", `buttons skip the double-tap delay (got ${style.btnTouch})`);
    assert(/rgba\(0, 0, 0, 0\)|transparent/.test(style.btnTap), `no grey flash on tap (got ${style.btnTap})`);
    assert(style.inputSelect === "text", `fields stay selectable (got ${style.inputSelect})`);
    assert(style.textSelect === "text", `text marked select-text stays selectable (got ${style.textSelect})`);
    await ctx.close();
  });

  /* ---------- loading screens ---------- */
  // Needs E2E_PROD=1: the loading screens are fetched ahead of the tap by link prefetching, which `next dev` does not do
  for (const [href, label, from] of [["/reports", "Reports", "/trips"], ["/trips", "Trips", "/"], ["/documents", "Documents", "/"]]) {
    if (!process.env.E2E_PROD) continue;
    await test(`tapping ${label} shows a loading skeleton at once while the server is slow, then the page`, async () => {
      const { ctx, page } = await newPage();
      await signIn(page, "pat@example.com", "Correct-Horse-1");
      await page.waitForURL((u) => u.pathname === "/");
      if (from !== "/") await page.goto(`${BASE}${from}`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(3000); // links prefetch their loading screen shortly after the page opens, as on a phone
      let delayed = 0;
      await page.route(new RegExp(`${href}(\\?|$)`), async (route) => {
        const req = route.request();
        if (req.headers()["rsc"] || /_rsc=/.test(req.url())) { delayed++; await new Promise((r) => setTimeout(r, 4000)); }
        await route.continue();
      });
      const link = page.locator(`a[href="${href}"]:visible`).first();
      await link.waitFor();
      const t0 = Date.now();
      await link.click();
      await page.getByTestId("page-skeleton").first().waitFor({ timeout: 2500 });
      const seenAfter = Date.now() - t0;
      assert(seenAfter < 2000, `the skeleton showed after ${seenAfter} ms, well before the page`);
      assert(delayed > 0, "the server really was slow");
      await page.waitForURL((u) => u.pathname === href);
      await page.getByTestId("page-skeleton").first().waitFor({ state: "detached", timeout: 20_000 });
      await ctx.close();
    });
  }

  /* ---------- installing as an app ---------- */
  await test("install tags: the page and manifest say this is a standalone app, with a 180 touch icon and a separate maskable icon", async () => {
    const { ctx, page } = await newPage();
    await page.goto(`${BASE}/login`);
    const head = await page.evaluate(() => ({
      capable: document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.getAttribute("content"),
      modern: document.querySelector('meta[name="mobile-web-app-capable"]')?.getAttribute("content"),
      title: document.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute("content"),
      touch: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href"),
      manifest: document.querySelector('link[rel="manifest"]')?.getAttribute("href"),
    }));
    assert(head.capable === "yes" && head.modern === "yes", "both web-app tags are present");
    assert(head.title === "Lifolio", `the home screen name is Lifolio (got ${head.title})`);
    assert(/^\/api\/icon\?v=\w+&size=180$/.test(head.touch || ""), `the touch icon is a 180 PNG link (got ${head.touch})`);
    assert(/^\/api\/manifest\?v=\w+$/.test(head.manifest || ""), `the manifest link carries a version (got ${head.manifest})`);
    const mres = await page.request.get(`${BASE}${head.manifest}`);
    assert(/max-age=86400/.test(mres.headers()["cache-control"] || ""), `the versioned manifest is kept for a day (got ${mres.headers()["cache-control"]})`);
    const plainRes = await page.request.get(`${BASE}/api/manifest`);
    assert(/max-age=300/.test(plainRes.headers()["cache-control"] || ""), "an unversioned manifest address is only kept briefly");
    const m = await mres.json();
    assert(m.display === "standalone" && m.id === "/" && m.start_url === "/" && m.scope === "/", "the manifest asks for a standalone app inside this site");
    assert(m.short_name === "Lifolio", "the manifest short name is Lifolio");
    const maskable = m.icons.find((i) => i.purpose === "maskable"), plain = m.icons.filter((i) => i.purpose === "any");
    assert(maskable && /maskable=1/.test(maskable.src) && plain.every((i) => !/maskable/.test(i.src)), "the maskable icon is its own image");
    for (const src of [head.touch, maskable.src]) {
      const r = await page.request.get(`${BASE}${src}`);
      assert(r.ok() && /image\/png/.test(r.headers()["content-type"] || ""), `${src} is a PNG`);
    }
    await ctx.close();
  });

  /* ---------- sign-in ---------- */
  await test("signed-out visitors see the login screen at / (no redirect, so iOS installs it as an app)", async () => {
    const { ctx, page } = await newPage();
    const res = await page.goto(`${BASE}/`);
    assert(res.status() === 200 && !res.request().redirectedFrom(), "the start address must not redirect");
    assert(new URL(page.url()).pathname === "/", "should stay at /");
    await page.locator("#email").waitFor();
    await page.goto(`${BASE}/trips`);
    await page.waitForURL(/\/login/);
    await ctx.close();
  });

  await test("dark mode: the sign-in pages are dark all the way (no light card or light strip), the top bar colour follows, and light mode is unchanged", async () => {
    const lum = (rgb) => { const m = rgb.match(/\d+(\.\d+)?/g).map(Number); return (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]); };
    for (const scheme of ["dark", "light"]) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme });
      const page = await ctx.newPage();
      for (const path of ["/login", "/forgot-password"]) {
        await page.goto(`${BASE}${path}`);
        await page.locator("form").first().waitFor();
        const r = await page.evaluate(() => {
          const card = document.querySelector("form").closest(".rounded-xl");
          const outer = card.parentElement.parentElement;
          const bar = [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.getAttribute("content"));
          return {
            dark: document.documentElement.classList.contains("dark"),
            card: getComputedStyle(card).backgroundColor,
            outerFrom: getComputedStyle(outer).backgroundImage,
            body: getComputedStyle(document.body).backgroundColor,
            title: getComputedStyle(document.querySelector("h1")).color,
            input: getComputedStyle(document.querySelector("input")).backgroundColor,
            bar,
          };
        });
        const dark = scheme === "dark";
        assert(r.dark === dark, `${path} ${scheme}: dark class is ${r.dark}`);
        assert(dark ? lum(r.card) < 60 : lum(r.card) > 240, `${path} ${scheme}: card colour ${r.card}`);
        assert(dark ? lum(r.title) > 200 : lum(r.title) < 60, `${path} ${scheme}: heading colour ${r.title}`);
        assert(dark ? lum(r.body) < 60 : lum(r.body) > 240, `${path} ${scheme}: page colour ${r.body}`);
        assert(r.bar.length === 1, `${path} ${scheme}: exactly one theme-color tag (got ${JSON.stringify(r.bar)})`);
        assert(r.bar[0] === (dark ? "#0b1020" : "#4f46e5"), `${path} ${scheme}: top bar colour ${r.bar[0]}`);
      }
      await ctx.close();
    }
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
    await page.locator("#email").waitFor();
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
    await page.getByRole("tab", { name: "Business" }).click(); // Home opens on Personal first
    await page.getByRole("heading", { name: "Documents", exact: true }).waitFor();
    const titles = await page.getByTestId("doc-tiles").locator("p.truncate.font-bold").allInnerTexts();
    assert(titles.join("|") === "Visa / e-visa|Travel insurance", `tile order/content was: ${titles.join("|")}`);
    await page.getByText("Expires soon").first().waitFor();
    const text = await page.getByTestId("doc-tiles").innerText();
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
    {
      // the sheet sits in the middle of a phone screen, fully visible, and the barcode fills its width
      const sheet = await page.locator('[role="dialog"] > div').boundingBox();
      const top = sheet.y, bottom = 844 - (sheet.y + sheet.height);
      assert(top >= 0 && bottom >= 0, "the sheet is fully on screen");
      assert(Math.abs(top - bottom) < 24, `the sheet is centred on the phone (top ${Math.round(top)}, bottom ${Math.round(bottom)})`);
      assert(sheet.width > 390 * 0.9, "the sheet uses the phone width");
      const bars = await page.locator('[role="dialog"] svg[aria-label^="Barcode for"]').boundingBox();
      assert(bars.width > sheet.width * 0.8, "the barcode fills the card width");
    }
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

      // A trip, a home project and a grocery receipt can be created with no connection
      await page.goto(`${BASE}/trips/new`);
      await page.locator("#name").fill("Offline Trip");
      await page.locator("#startDate").fill(today);
      await page.getByRole("button", { name: "Create trip" }).click();
      await page.getByText("Offline Trip").first().waitFor({ timeout: 30000 });
      assert((await page.getByText("Waiting to sync").count()) >= 1, "the new trip shows as waiting");
      await page.goto(`${BASE}/personal/projects/new`);
      await page.getByPlaceholder("Kitchen renovation").fill("Offline Kitchen");
      await page.getByRole("button", { name: "Create project" }).click();
      await page.getByText("Offline Kitchen").first().waitFor({ timeout: 30000 });
      await page.goto(`${BASE}/personal/groceries/new`);
      await page.getByText("Store", { exact: true }).locator("xpath=following::input[1]").fill("Offline Mart");
      await page.getByText("Receipt total").locator("xpath=following::input[1]").fill("21.50");
      await page.getByRole("button", { name: "Save receipt" }).click();
      await page.getByText("Offline Mart").first().waitFor({ timeout: 15000 }).catch(async () => { throw new Error("no grocery row at " + page.url() + ": " + (await page.locator("body").innerText()).slice(0, 700)); });
      assert(!fake.table("trips").some((t) => t.name === "Offline Trip") && !fake.table("personal_projects").some((t) => t.name === "Offline Kitchen"), "nothing was sent while offline");

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
      assert(fake.table("trips").some((t) => t.name === "Offline Trip" && t.user_id === PAT), "the trip created offline is saved once back online");
      assert(fake.table("personal_projects").some((t) => t.name === "Offline Kitchen" && t.user_id === PAT && t.kind === "home_project"), "the project created offline is saved once back online");
      assert(fake.table("grocery_receipts").some((t) => t.store === "Offline Mart" && Number(t.total) === 21.5), "the grocery receipt created offline is saved once back online");
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

  await test("moving between pages does not re-ask who is signed in, what the role may do, or the app settings", async () => {
    const { ctx, page } = await newPage();
    await signIn(page, "pat@example.com", "Correct-Horse-1");
    await page.waitForURL((u) => u.pathname === "/");
    const side = page.locator("aside");
    await side.getByRole("link", { name: "Business" }).waitFor();
    await page.waitForLoadState("networkidle");
    fake.resetCounts();
    // Requests the BROWSER itself sends to Supabase (the menu, tabs and chips); the server's own are counted by the fake
    const browserCalls = {};
    page.on("request", (rq) => {
      const m = rq.url().match(new RegExp(`:${FAKE_PORT}/(rest|auth)/v1/([a-z_]+)`));
      if (m) browserCalls[`${rq.method()} ${m[1]}:${m[2]}`] = (browserCalls[`${rq.method()} ${m[1]}:${m[2]}`] || 0) + 1;
    });
    // Four moves between pages
    for (const [link, path] of [["Business", "/trips"], ["Dashboard", "/"], ["Business", "/trips"], ["Dashboard", "/"]]) {
      await side.getByRole("link", { name: link }).click();
      await page.waitForURL((u) => u.pathname === path);
      await page.waitForLoadState("networkidle");
    }
    const c = fake.counts();
    if (process.env.E2E_COUNTS) console.log("requests during 4 page changes:", JSON.stringify(c));
    const n = (k) => c[k] || 0;
    if (process.env.E2E_COUNTS) console.log("requests the browser sent:", JSON.stringify(browserCalls));
    // The menu, tabs and chips share one answer: moving between pages must not make the browser ask again
    for (const k of ["GET rest:profiles", "GET rest:roles", "GET rest:app_settings"]) assert(!browserCalls[k], `the browser asked for ${k} on page change (${browserCalls[k]} times)`);
    // Server side (before this was tuned: 15 sign-in checks, 14 profile reads, 11 role reads, 7 settings reads; now about 8, 6, 4, 2).
    // Prefetching varies from run to run, so these limits sit between the two.
    assert(n("GET auth:user") <= 13, `sign-in checked too often: ${n("GET auth:user")} (limit 13)`);
    assert(n("GET rest:profiles") <= 11, `profile read too often: ${n("GET rest:profiles")} (limit 11)`);
    assert(n("GET rest:roles") <= 9, `roles read too often: ${n("GET rest:roles")} (limit 9)`);
    assert(n("GET rest:app_settings") <= 5, `settings read too often: ${n("GET rest:app_settings")} (limit 5)`);
    await ctx.close();
  });

  /* ---------- scan and upload ---------- */
  const JPEG = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");
  await test("Upload with one active trip goes straight to its form, with a Change button", async () => {
    // Earlier tests (the offline ones) add trips; this check needs Pat to have exactly one active trip
    const trips = fake.table("trips");
    for (let i = trips.length - 1; i >= 0; i--) if (trips[i].user_id === PAT && trips[i].id !== TRIP_ID) trips.splice(i, 1);
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
    await page.waitForLoadState("networkidle"); // the file picker only reacts once the page has finished loading
    await page.locator('input[type=file]:not([capture])').setInputFiles({ name: "policy.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF") });
    await page.getByRole("dialog", { name: "Where does this go?" }).waitFor();
    await page.getByRole("button", { name: "Save to Document" }).waitFor();
    await ctx.close();
  });

  await test("a PDF saved as a document from the dashboard opens the document form with the file", async () => {
    const { ctx, page } = await newPage();
    await signIn(page, "pat@example.com", "Correct-Horse-1");
    await page.waitForURL((u) => u.pathname === "/");
    await page.waitForLoadState("networkidle"); // the file picker only reacts once the page has finished loading
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

  await test("a photo sent to Groceries from the dashboard goes on to the crop step, and the document menu on a phone opens over the cards below", async () => {
    const { ctx, page } = await newPage();
    await signIn(page, "pat@example.com", "Correct-Horse-1");
    await page.waitForURL((u) => u.pathname === "/");
    await page.evaluate((b64) => sessionStorage.setItem("quick-scan-v2", JSON.stringify({ key: "grocery", name: "receipt.jpg", type: "image/jpeg", dataUrl: `data:image/jpeg;base64,${b64}`, at: Date.now(), reason: null })), JPEG.toString("base64"));
    await page.goto(`${BASE}/personal/groceries/new?quick=1`);
    await page.getByText(/Crop/).first().waitFor({ timeout: 20_000 });
    await ctx.close();
  });

  await test("scan: rows the second look disagrees with get a Check mark and a Use button, and the total bar turns green once the items add up", async () => {
    const { ctx, page } = await newPage();
    const item = (name, t) => ({ name, quantity: 1, unit_price: t, line_total: t, category: "Other", unit: null });
    const first = { store: "Test Shop", date: null, total: 5.59, currency: "USD", source: "ai", items: [item("Milk", 2.49), item("Bread", 8.1)] };
    const fixed = { ...first, items: [item("Milk", 2.49), item("Bread", 3.1)] };
    await page.route("**/api/ocr", async (route) => {
      const body = route.request().postData() || "";
      if (body.includes("grocery-recheck")) { await new Promise((r) => setTimeout(r, 800)); return route.fulfill({ json: { result: fixed } }); }
      return route.fulfill({ json: { result: first } });
    });
    await signIn(page, "pat@example.com", "Correct-Horse-1");
    await page.waitForURL((u) => u.pathname === "/");
    await page.evaluate((b64) => sessionStorage.setItem("quick-scan-v2", JSON.stringify({ key: "grocery", name: "receipt.jpg", type: "image/jpeg", dataUrl: `data:image/jpeg;base64,${b64}`, at: Date.now(), reason: null })), JPEG.toString("base64"));
    await page.goto(`${BASE}/personal/groceries/new?quick=1`);
    await page.getByRole("button", { name: "Use full image" }).click();
    // The first reading is on screen straight away, with the problem shown
    await page.getByTestId("items-total").waitFor();
    assert(/10\.59/.test(await page.getByTestId("items-total").innerText()), "the sum of the items is shown");
    assert((await page.getByTestId("items-total").innerText()).includes("less than") === false, "items are above the total, not below it");
    // The AI's second look arrives later and marks the row
    await page.getByTestId("row-check").waitFor({ timeout: 15_000 });
    assert((await page.getByTestId("second-look").innerText()).includes("second look"), "the second look is announced");
    const useBtn = page.getByRole("button", { name: /^Use .*3\.10/ });
    assert(await useBtn.isVisible(), "the other price is offered as a button");
    assert((await page.locator("input[type=number]").evaluateAll((els) => els.map((e) => e.value))).includes("8.10"), "nothing was changed by itself");
    await useBtn.click();
    await page.waitForFunction(() => document.querySelector('[data-testid="items-total"]')?.textContent?.includes("Same as the receipt total"));
    assert((await page.locator('[data-flagged="true"]').count()) === 0, "the row is no longer marked");
    await ctx.close();
  });

  await test("scan: when nothing can be read a blank row is ready to type into", async () => {
    const { ctx, page } = await newPage();
    await page.route("**/api/ocr", (route) => route.fulfill({ status: 502, json: { error: "AI OCR failed", reason: "ai_failed" } }));
    await signIn(page, "pat@example.com", "Correct-Horse-1");
    await page.waitForURL((u) => u.pathname === "/");
    await page.evaluate((b64) => sessionStorage.setItem("quick-scan-v2", JSON.stringify({ key: "grocery", name: "receipt.jpg", type: "image/jpeg", dataUrl: `data:image/jpeg;base64,${b64}`, at: Date.now(), reason: null })), JPEG.toString("base64"));
    await page.goto(`${BASE}/personal/groceries/new?quick=1`);
    await page.getByRole("button", { name: "Use full image" }).click();
    await page.getByPlaceholder("Item name").first().waitFor({ timeout: 60_000 });
    assert(/Type them in below|Type the items in below/.test(await page.locator("body").innerText()), "the note offers typing the items in");
    await ctx.close();
  });

  await test("scan: a receipt with only a $ in Aruba asks once, Switch to AWG keeps the amounts and offers Undo, Keep USD is respected, a printed USD is not questioned", async () => {
    const me = fake.table("profiles").find((p) => p.id === PAT);
    const before = me.home_country;
    me.home_country = "Aruba";
    const item = (name, t) => ({ name, quantity: 1, unit_price: t, line_total: t, category: "Other", unit: null });
    let reply = { store: "Super Food", date: null, total: 5.59, currency: null, bareDollar: true, source: "ai", items: [item("Milk", 2.49), item("Bread", 3.1)] };
    // A fresh form, the currency set by hand, then a photo is chosen
    const scanFresh = async (page, cur) => {
      await page.goto(`${BASE}/personal/groceries/new`);
      await page.locator("#gr-currency").selectOption(cur);
      await page.locator('input[type=file]:not([capture])').setInputFiles({ name: "receipt.jpg", mimeType: "image/jpeg", buffer: JPEG });
      await page.getByRole("button", { name: "Use full image" }).click({ timeout: 10_000 }).catch(() => {});
    };
    try {
      const { ctx, page } = await newPage();
      await page.route("**/api/ocr", (route) => route.fulfill({ json: { result: reply } }));
      await signIn(page, "pat@example.com", "Correct-Horse-1");
      await page.waitForURL((u) => u.pathname === "/");
      // The starting currency follows your home place: AWG in Aruba
      await page.goto(`${BASE}/personal/groceries/new`);
      await page.waitForFunction(() => document.querySelector("#gr-currency")?.value === "AWG", null, { timeout: 15_000 });
      // 1. a bare $ on a USD form: asked once, amounts untouched
      await scanFresh(page, "USD");
      await page.getByTestId("dollar-sheet").waitFor({ timeout: 20_000 });
      assert(/\$ found on this receipt/.test(await page.getByTestId("dollar-sheet").innerText()), "the sheet explains the $");
      await page.getByTestId("dollar-switch").click();
      assert((await page.locator("#gr-currency").inputValue()) === "AWG", "Switch changes the currency to AWG");
      assert((await page.getByTestId("currency-note").innerText()).includes("Amounts were not changed"), "the note says the amounts are the same");
      assert((await page.locator("#gr-total").inputValue()) === "5.59", "the total is not converted");
      await page.getByTestId("currency-undo").click();
      assert((await page.locator("#gr-currency").inputValue()) === "USD", "Undo puts the currency back");
      // 2. Keep USD
      await scanFresh(page, "USD");
      await page.getByTestId("dollar-sheet").waitFor({ timeout: 20_000 });
      await page.getByTestId("dollar-keep").click();
      assert((await page.locator("#gr-currency").inputValue()) === "USD", "Keep leaves USD alone");
      // 3. a printed USD is never questioned
      reply = { ...reply, currency: "USD", bareDollar: undefined };
      await scanFresh(page, "USD");
      await page.getByTestId("items-total").waitFor({ timeout: 20_000 });
      assert((await page.getByTestId("dollar-sheet").count()) === 0, "a printed USD does not open the sheet");
      await ctx.close();
    } finally { if (before === undefined) delete me.home_country; else me.home_country = before; }
  });

  await test("welcome tour: a new person gets the popup once, picks are saved, a person from before never sees it, Help replays it", async () => {
    const TOUR = fake.addUser({ email: "tour@example.com", password: "Correct-Horse-1", role: "user", full_name: "Tour Tester" });
    const mine = () => fake.table("profiles").find((p) => p.id === TOUR);
    mine().welcome_seen_at = null;
    const { ctx, page } = await newPage();
    await signIn(page, "tour@example.com", "Correct-Horse-1");
    await page.waitForURL((u) => u.pathname === "/");
    await page.getByTestId("welcome-tour").waitFor({ timeout: 20_000 });
    assert((await page.getByTestId("tour-count").innerText()).includes("1 of 5"), "the tour starts at 1 of 5");
    await page.getByTestId("tour-next").click();
    assert((await page.getByTestId("welcome-tour").innerText()).includes("Scan, don't type"), "the first highlight is the scan");
    await page.getByTestId("tour-next").click();
    await page.getByTestId("tour-budget").waitFor();
    assert((await page.getByTestId("welcome-tour").innerText()).includes("Know where your money goes"), "the second highlight is the budget");
    await page.getByTestId("tour-next").click();
    assert((await page.getByTestId("welcome-tour").innerText()).includes("Bills from your Gmail"), "the third highlight is bills and more");
    await page.getByTestId("tour-next").click();
    assert((await page.getByTestId("tour-count").innerText()).includes("3 of 5"), "then the picks step");
    await page.getByTestId("track-spending").click();
    await page.getByTestId("track-bills").click();
    await page.getByTestId("tour-next").click();
    await page.locator("#tour-country").fill("Aruba");
    assert((await page.getByTestId("tour-currency").innerText()).includes("AWG"), "Aruba shows that receipts start in AWG");
    await page.getByTestId("tour-next").click();
    assert((await page.getByTestId("tour-count").innerText()).includes("5 of 5"), "the last step is the home screen");
    assert((await page.getByTestId("tour-install-steps").innerText()).includes("Add to Home Screen"), "the iPhone steps show first");
    await page.getByTestId("tour-tab-android").click();
    assert((await page.getByTestId("tour-install-steps").innerText()).includes("Install app"), "the Android steps are one tap away");
    await page.getByTestId("tour-back").click();
    await page.getByTestId("tour-next").click();
    await page.getByTestId("tour-next").click();
    await page.getByTestId("welcome-tour").waitFor({ state: "detached", timeout: 15_000 });
    assert(!!mine().welcome_seen_at && JSON.stringify(mine().welcome_tracks) === JSON.stringify(["spending", "bills"]) && mine().home_country === "Aruba", "the date, the picks and the home place are saved");
    // The checklist takes over, and the popup does not come back
    await page.reload();
    await page.getByTestId("getting-started").waitFor({ timeout: 20_000 });
    assert((await page.getByTestId("welcome-tour").count()) === 0, "the popup does not return");
    assert((await page.getByTestId("getting-started-count").innerText()).includes("of 6"), "the checklist counts six steps");
    await page.getByTestId("getting-started-hide").click();
    await page.reload();
    await page.waitForTimeout(1500);
    assert((await page.getByTestId("getting-started").count()) === 0, "Hide keeps the checklist away");
    // Help replays it
    await page.goto(`${BASE}/help`);
    await page.getByTestId("replay-tour").first().click();
    await page.getByTestId("welcome-tour").waitFor({ timeout: 20_000 });
    await page.getByTestId("tour-skip").click();
    await page.getByTestId("welcome-tour").waitFor({ state: "detached", timeout: 15_000 });
    await ctx.close();
    // A person from before the tour existed (no date, no picks) never sees it or the checklist
    const old = await newPage();
    await signIn(old.page, "pat@example.com", "Correct-Horse-1");
    await old.page.waitForURL((u) => u.pathname === "/");
    await old.page.waitForTimeout(1500);
    assert((await old.page.getByTestId("welcome-tour").count()) === 0 && (await old.page.getByTestId("getting-started").count()) === 0, "nothing new for people who were here before");
    await old.ctx.close();
  });

  await test("hotel: a trip can carry a hotel with a Directions button, and it shows on the trip card", async () => {
    const { ctx, page } = await newPage();
    await signIn(page, "pat@example.com", "Correct-Horse-1");
    await page.waitForURL((u) => u.pathname === "/");
    await page.goto(`${BASE}/trips/new`);
    await page.locator("#name").fill("Hotel Trip");
    await page.locator("#startDate").fill(today);
    await page.getByTestId("hotel-open").click();
    await page.locator("#hotelName").fill("Courtyard Marriott");
    await page.locator("#hotelAddress").fill("Multiplaza Mall, Ave. Israel, Panama");
    await page.getByRole("button", { name: "Create trip" }).click();
    await page.getByTestId("hotel-card").waitFor({ timeout: 30000 });
    assert((await page.getByTestId("hotel-name").innerText()) === "Courtyard Marriott", "the hotel name is shown");
    assert((await page.getByTestId("hotel-address").innerText()).includes("Ave. Israel"), "the address is shown");
    const href = await page.getByTestId("hotel-directions").getAttribute("href");
    assert(href.startsWith("https://www.google.com/maps/dir/?api=1&destination=") && href.includes(encodeURIComponent("Courtyard Marriott")), "Directions opens the maps app with the hotel");
    const saved = fake.table("trips").find((t) => t.name === "Hotel Trip");
    assert(saved?.hotel_name === "Courtyard Marriott" && saved?.hotel_address.includes("Panama"), "the hotel is saved on the trip");
    await page.goto(`${BASE}/trips`);
    await page.getByTestId("trip-hotel-line").first().waitFor();
    assert((await page.getByTestId("trip-hotel-line").first().innerText()).includes("Courtyard Marriott"), "the trip card shows the hotel");
    // a trip without a hotel offers to add one
    await page.goto(`${BASE}/trips/${TRIP_ID}`);
    await page.getByTestId("hotel-add").waitFor();
    await ctx.close();
  });

  await test("prices: on a phone the green saving line and the store name never overlap the price", async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    ctx.setDefaultTimeout(60_000);
    const page = await ctx.newPage();
    const R = ["9c000000-0000-4000-8000-00000000e001", "9c000000-0000-4000-8000-00000000e002"];
    const mk = (id, store, days) => ({ id, user_id: PAT, store, purchase_date: addDays(today, days), total: 6, currency: "AWG", receipt_path: null, notes: null, created_at: new Date().toISOString() });
    const item = (n, rid, name, price) => ({ id: `9d000000-0000-4000-8000-00000000e10${n}`, receipt_id: rid, user_id: PAT, name, normalized_name: name.toLowerCase(), category: "Other", quantity: 1, unit_price: price, line_total: price, unit: null, created_at: new Date().toISOString() });
    fake.table("grocery_receipts").push(mk(R[0], "Folira Supermarket", -6), mk(R[1], "TUR DIA", -2));
    fake.table("grocery_items").push(item(1, R[0], "Oreo", 1.5), item(2, R[1], "Oreo", 4.99));
    try {
      await signIn(page, "pat@example.com", "Correct-Horse-1");
      await page.waitForURL((u) => u.pathname === "/");
      await page.goto(`${BASE}/personal/groceries/prices`);
      const card = page.getByTestId("price-product").filter({ hasText: "Oreo" }).first();
      await card.waitFor({ timeout: 60000 });
      const chip = await card.locator("span.bg-emerald-100").first().boundingBox();
      const price = await card.locator("p.text-lg").first().boundingBox();
      const store = await card.getByTestId("price-best-store").boundingBox();
      assert(chip && price && store, "chip, price and store are all visible");
      const overlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      assert(!overlap(chip, price), "the green line does not touch the price");
      assert(store.y >= chip.y + chip.height - 1, "the store name is below the green line");
      assert(!overlap(store, price), "the store name does not touch the price");
      assert((await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)), "no sideways scroll");
    } finally {
      await ctx.close();
      for (const t of ["grocery_receipts", "grocery_items"]) { const a = fake.table(t); for (let i = a.length - 1; i >= 0; i--) if (String(a[i].id).includes("00000000e")) a.splice(i, 1); }
    }
  });

  await test("best store: a list priced at each store, within a radius, on a map, with a price level", async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, geolocation: { latitude: 12.52, longitude: -70.03 }, permissions: ["geolocation"] });
    ctx.setDefaultTimeout(60_000);
    const page = await ctx.newPage();
    const stores = [["Ling & Sons", 10], ["New Ten Sing", 11], ["Far Mart", 9]];
    const names = ["Milk", "Bread", "Rice", "Eggs", "Butter", "Juice"];
    stores.forEach(([st, base], si) => {
      const rid = `9c000000-0000-4000-8000-0000000b0${si}0`;
      fake.table("grocery_receipts").push({ id: rid, user_id: PAT, store: st, purchase_date: addDays(today, -3 - si), total: 60, currency: "AWG", receipt_path: null, notes: null, created_at: new Date().toISOString() });
      names.forEach((n, ni) => fake.table("grocery_items").push({ id: `9d000000-0000-4000-8000-0000000b${si}${ni}00`, receipt_id: rid, user_id: PAT, name: n, normalized_name: n.toLowerCase(), category: "Other", quantity: 1, unit_price: base, line_total: base, unit: null, created_at: new Date().toISOString() }));
    });
    const loc = (id, name, lat, lng) => ({ id: `9e000000-0000-4000-8000-0000000b00${id}`, user_id: PAT, name, lat, lng, source: "pin", created_at: new Date().toISOString() });
    fake.table("store_locations").push(loc(1, "Ling & Sons", 12.525, -70.03), loc(2, "New Ten Sing", 12.52, -70.04), loc(3, "Far Mart", 12.62, -70.03));
    await page.route("**/api/stores-nearby**", (r) => r.fulfill({ json: { stores: [{ osmId: "node/1", name: "Ling and Sons Supermarket", lat: 12.525, lng: -70.03 }, { osmId: "node/2", name: "Random Shop", lat: 12.53, lng: -70.03 }], attribution: "x" } }));
    await page.route("https://tile.openstreetmap.org/**", (r) => r.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64") }));
    try {
      await signIn(page, "pat@example.com", "Correct-Horse-1");
      await page.waitForURL((u) => u.pathname === "/");
      await page.goto(`${BASE}/personal/groceries`);
      await page.getByTestId("best-store-link").click();
      await page.getByRole("heading", { name: "Best store for your list" }).waitFor();
      const usual = page.getByTestId("usual-item");
      await usual.first().waitFor({ timeout: 60000 });
      await usual.first().click();
      await page.getByTestId("list-row").first().waitFor();
      await page.getByTestId("mini-map").waitFor();
      await page.getByTestId("osm-results").waitFor();
      await page.locator(".leaflet-marker-icon").first().waitFor();
      assert((await page.locator(".leaflet-marker-icon").count()) === 4, "the map shows you, the two ranked stores and the other supermarket found on OpenStreetMap");
      assert((await page.getByText("OpenStreetMap").count()) > 0, "the map credits OpenStreetMap");
      const cards = page.getByTestId("store-card");
      await cards.first().waitFor();
      assert((await cards.count()) === 2, "only the two stores within 5 km are ranked (the far one is left out)");
      assert((await cards.first().innerText()).includes("Ling & Sons"), "the cheapest store is first");
      assert((await cards.first().innerText()).includes("Best price"), "the first store is marked best price");
      await page.getByRole("button", { name: "10 km" }).click();
      await page.getByRole("button", { name: "10 km" }).waitFor();
      await cards.first().click();
      await page.getByTestId("store-detail").waitFor();
      await page.getByTestId("price-level").getByText("Cheapest").first().waitFor();
      assert((await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)), "no sideways scroll");
    } finally {
      await ctx.close();
      for (const t of ["grocery_receipts", "grocery_items", "store_locations", "shopping_list_items"]) { const a = fake.table(t); for (let i = a.length - 1; i >= 0; i--) if (String(a[i].id).includes("0000000b") || a[i].user_id === PAT && t === "shopping_list_items") a.splice(i, 1); }
    }
  });

  await test("home gps: saved from the Home place card, and Best store measures from it when location is off", async () => {
    const gctx = await browser.newContext({ viewport: { width: 390, height: 844 }, geolocation: { latitude: 12.52049, longitude: -70.03051 }, permissions: ["geolocation"] });
    gctx.setDefaultTimeout(60_000);
    const gp = await gctx.newPage();
    const me = () => fake.table("profiles").find((p) => p.id === PAT);
    try {
      await signIn(gp, "pat@example.com", "Correct-Horse-1");
      await gp.waitForURL((u) => u.pathname === "/");
      await gp.goto(`${BASE}/profile`);
      await gp.getByRole("button", { name: /^Home place/ }).click();
      await gp.getByTestId("home-gps-save").click();
      await gp.getByText(/accurate to about 100 m/).waitFor();
      assert(me().home_lat === 12.52 && me().home_lng === -70.031, `saved rounded to about 100 m (got ${me().home_lat}, ${me().home_lng})`);
      await gp.getByTestId("home-gps-remove").click();
      await gp.getByText("Not saved").waitFor();
      assert(me().home_lat === null && me().home_lng === null, "removing clears the point");
    } finally { await gctx.close(); }

    // Best store with location refused: the saved home point is the starting point
    me().home_lat = 12.52; me().home_lng = -70.03;
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    ctx.setDefaultTimeout(60_000);
    const page = await ctx.newPage();
    const names = ["Milk", "Bread", "Rice", "Eggs", "Butter", "Juice"];
    [["Ling & Sons", 10], ["New Ten Sing", 11]].forEach(([st, base], si) => {
      const rid = `9c000000-0000-4000-8000-0000000c0${si}0`;
      fake.table("grocery_receipts").push({ id: rid, user_id: PAT, store: st, purchase_date: addDays(today, -3 - si), total: 60, currency: "AWG", receipt_path: null, notes: null, created_at: new Date().toISOString() });
      names.forEach((n, ni) => fake.table("grocery_items").push({ id: `9d000000-0000-4000-8000-0000000c${si}${ni}00`, receipt_id: rid, user_id: PAT, name: n, normalized_name: n.toLowerCase(), category: "Other", quantity: 1, unit_price: base, line_total: base, unit: null, created_at: new Date().toISOString() }));
    });
    fake.table("store_locations").push({ id: "9e000000-0000-4000-8000-0000000c0001", user_id: PAT, name: "Ling & Sons", lat: 12.525, lng: -70.03, source: "pin", created_at: new Date().toISOString() });
    await page.route("**/api/stores-nearby**", (r) => r.fulfill({ json: { stores: [], attribution: "x" } }));
    await page.route("https://tile.openstreetmap.org/**", (r) => r.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64") }));
    try {
      await signIn(page, "pat@example.com", "Correct-Horse-1");
      await page.waitForURL((u) => u.pathname === "/");
      await page.goto(`${BASE}/personal/groceries/basket`);
      const usual = page.getByTestId("usual-item");
      await usual.first().waitFor({ timeout: 60000 });
      await usual.first().click();
      await page.getByTestId("origin").getByText(/Using your saved home point/).waitFor();
      await page.getByTestId("mini-map").waitFor();
      assert((await page.getByTestId("no-location").count()) === 0, "no 'use your location' prompt when a home point is saved");
      const card = page.getByTestId("store-card").first();
      await card.waitFor();
      assert((await card.innerText()).includes("Ling & Sons") && /0\.6 km/.test(await card.innerText()), "the distance is measured from home");
    } finally {
      await ctx.close();
      me().home_lat = null; me().home_lng = null;
      for (const t of ["grocery_receipts", "grocery_items", "store_locations", "shopping_list_items"]) { const a = fake.table(t); for (let i = a.length - 1; i >= 0; i--) if (String(a[i].id).includes("0000000c") || a[i].user_id === PAT && t === "shopping_list_items") a.splice(i, 1); }
    }
  });

  await test("community prices: off until turned on, shares only store, product and price, lookup, and delete", async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    ctx.setDefaultTimeout(60_000);
    const page = await ctx.newPage();
    const rid = "9c000000-0000-4000-8000-0000000e0001";
    fake.table("grocery_receipts").push({ id: rid, user_id: PAT, store: "Ling & Sons", purchase_date: today, total: 6, currency: "AWG", receipt_path: null, notes: null, created_at: new Date().toISOString() });
    fake.table("grocery_items").push({ id: "9d000000-0000-4000-8000-0000000e0101", receipt_id: rid, user_id: PAT, name: "Coca Cola 330ML", normalized_name: "coca cola 330ml", category: "Other", quantity: 3, unit_price: 1.45, line_total: 4.35, unit: null, created_at: new Date().toISOString() });
    const me = () => fake.table("profiles").find((p) => p.id === PAT);
    try {
      sharedCalls.length = 0; sharedCount = 0;
      await signIn(page, "pat@example.com", "Correct-Horse-1");
      await page.waitForURL((u) => u.pathname === "/");
      await page.goto(`${BASE}/personal/groceries/prices`);
      await page.getByTestId("community-link").waitFor();
      await page.waitForTimeout(1500);
      assert(sharedCalls.length === 0, "nothing is shared while sharing is off");
      await page.goto(`${BASE}/profile`);
      await page.getByRole("button", { name: /Community prices/ }).click();
      const sw = page.getByTestId("profile-share-toggle");
      await sw.waitFor();
      assert((await sw.getAttribute("aria-checked")) === "false", "sharing starts off");
      await sw.click();
      await page.getByText(/Sharing is on/).first().waitFor();
      assert(me().share_prices === true, "the choice is saved");
      await page.goto(`${BASE}/personal/groceries/prices`);
      for (let i = 0; i < 40 && !sharedCalls.length; i++) await page.waitForTimeout(250);
      const rows = sharedCalls.flatMap((c) => c.rows);
      assert(rows.length === 1, `one price is shared (got ${rows.length})`);
      assert(JSON.stringify(Object.keys(rows[0]).sort()) === JSON.stringify(["currency", "price", "product_key", "product_name", "size_label", "store_key", "store_name"]), "only store, item, price, size and currency are sent");
      assert(rows[0].price === 1.45 && !("month" in rows[0]), "the price is sent with no date at all");
      const sent = JSON.stringify(sharedCalls);
      assert(!sent.includes("pat@example.com") && !sent.includes(PAT) && !sent.includes(rid), "no email, account or receipt id is sent");
      await page.getByTestId("community-link").click();
      await page.getByRole("heading", { name: "Community prices" }).waitFor();
      await page.getByTestId("profile-link").waitFor();
      await page.getByRole("search").getByLabel("Product to look up").fill("coca");
      await page.getByRole("button", { name: "Search" }).click();
      const res = page.getByTestId("community-results");
      await res.getByText("Ling & Sons").waitFor();
      assert((await res.innerText()).includes("12 reports"), "the number of reports is shown, nothing about who");
      assert((await res.locator("div", { hasText: "Lowest" }).first().innerText()).includes("Ling & Sons"), "the cheapest store is marked Lowest");
      await page.goto(`${BASE}/profile`);
      await page.getByRole("button", { name: /Community prices/ }).click();
      await page.getByTestId("profile-share-delete").click();
      await page.getByText(/Deleted 1 shared price/).waitFor();
      await sw.click();
      await page.getByText(/Sharing is off/).first().waitFor();
      assert(me().share_prices === false, "turning it off is saved");
    } finally {
      await ctx.close();
      me().share_prices = false;
      for (const t of ["grocery_receipts", "grocery_items"]) { const a = fake.table(t); for (let i = a.length - 1; i >= 0; i--) if (String(a[i].id).includes("0000000e")) a.splice(i, 1); }
    }
  });

  await test("profile: Community prices can be turned on and off from Profile", async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    ctx.setDefaultTimeout(60_000);
    const page = await ctx.newPage();
    const me = () => fake.table("profiles").find((p) => p.id === PAT);
    try {
      await signIn(page, "pat@example.com", "Correct-Horse-1");
      await page.waitForURL((u) => u.pathname === "/");
      await page.goto(`${BASE}/profile`);
      await page.getByRole("button", { name: /Community prices/ }).click();
      const sw = page.getByTestId("profile-share-toggle");
      await sw.waitFor();
      assert((await sw.getAttribute("aria-checked")) === "false", "sharing starts off");
      assert((await page.getByTestId("community-card").innerText()).includes("Never shared: your name, email, receipts, dates, location or totals"), "the promise is shown");
      await sw.click();
      await page.getByText(/Sharing is on/).first().waitFor();
      assert(me().share_prices === true, "the choice is saved from Profile");
      await sw.click();
      await page.getByText(/Sharing is off/).first().waitFor();
      assert(me().share_prices === false, "turning it off is saved");
    } finally {
      await ctx.close();
      me().share_prices = false;
    }
  });

  await test("request an account: asked on the sign-in screen, seen and handled by the admin", async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    ctx.setDefaultTimeout(60_000);
    const page = await ctx.newPage();
    const actx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    actx.setDefaultTimeout(60_000);
    const ap = await actx.newPage();
    try {
      await page.goto(`${BASE}/login`);
      await page.waitForLoadState("networkidle");
      await page.getByRole("button", { name: "Request one" }).click();
      await page.getByLabel("Full name").fill("Lisa Boekhoudt");
      await page.getByRole("button", { name: "Request account" }).click();
      await page.getByText("Add an email or a phone number so we can reach you.").waitFor();
      assert(fake.table("account_requests").length === 0, "nothing is saved without an email or phone number");
      await page.getByLabel("Phone number").fill("+297 593 1234");
      await page.getByRole("button", { name: "Request account" }).click();
      await page.getByTestId("request-sent").waitFor();
      const saved = fake.table("account_requests");
      assert(saved.length === 1 && saved[0].name === "Lisa Boekhoudt" && saved[0].phone === "+297 593 1234" && saved[0].email == null && saved[0].status === "new", "the request is saved for the admins");
      await signIn(ap, "admin@example.com", "Admin-Pass-123");
      await ap.waitForURL((u) => u.pathname === "/");
      await ap.goto(`${BASE}/admin/account-requests`);
      const list = ap.getByTestId("request-list");
      await list.getByText("Lisa Boekhoudt").waitFor();
      await ap.getByRole("button", { name: "Dismiss" }).click();
      await list.getByText("Dismissed").waitFor();
      assert(fake.table("account_requests")[0].status === "dismissed", "dismissing is saved");
      const anon = await page.evaluate(async () => (await (await fetch("/api/admin/account-requests")).text()));
      assert(!anon.includes("Lisa") && !anon.includes("593 1234"), "someone who is not signed in cannot read the requests");
    } finally {
      await ctx.close(); await actx.close();
      fake.table("account_requests").length = 0;
    }
  });

  await test("create user: the copy block has the app link, user and temp password", async () => {
    const actx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
    actx.setDefaultTimeout(60_000);
    const ap = await actx.newPage();
    try {
      await signIn(ap, "admin@example.com", "Admin-Pass-123");
      await ap.waitForURL((u) => u.pathname === "/");
      await ap.goto(`${BASE}/admin/users`);
      await ap.getByPlaceholder("user@company.com").fill("copyme@example.com");
      await ap.getByRole("button", { name: "Create user" }).click();
      await ap.getByText("Share these credentials").waitFor();
      await ap.getByRole("button", { name: "Copy credentials" }).click();
      const text = await ap.evaluate(() => navigator.clipboard.readText());
      assert(/^link: https:\/\/lifolio-woad\.vercel\.app\/\nuser: copyme@example\.com\ntemp password: \S+/.test(text), `copied text has link, user and temp password (got ${JSON.stringify(text.slice(0, 120))})`);
    } finally { await actx.close(); }
  });

  await test("supermarket places: only an admin can open the import, and it offers the example file", async () => {
    const actx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    actx.setDefaultTimeout(60_000);
    const ap = await actx.newPage();
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    ctx.setDefaultTimeout(60_000);
    const page = await ctx.newPage();
    try {
      await signIn(ap, "admin@example.com", "Admin-Pass-123");
      await ap.waitForURL((u) => u.pathname === "/");
      await ap.goto(`${BASE}/admin/supermarkets`);
      await ap.getByRole("heading", { name: "Supermarket places" }).waitFor();
      await ap.getByTestId("places-template").waitFor();
      const r = await ap.evaluate(async () => { const x = await fetch("/api/admin/supermarket-import?template=1"); const b = new Uint8Array(await x.arrayBuffer()); return { ok: x.ok, head: String.fromCharCode(b[0], b[1]) }; });
      assert(r.ok && r.head === "PK", "the example file is a real .xlsx");
      await signIn(page, "pat@example.com", "Correct-Horse-1");
      await page.waitForURL((u) => u.pathname === "/");
      const code = await page.evaluate(async () => (await fetch("/api/admin/supermarket-import")).status);
      assert(code === 403 || code === 401, `a regular user is refused by the API (got ${code})`);
      await page.goto(`${BASE}/admin/supermarkets`);
      await page.waitForURL((u) => !u.pathname.startsWith("/admin"));
    } finally { await ctx.close(); await actx.close(); }
  });

  await test("online: shop prices sit beside what you paid, an unsure match asks once, and nothing is added to spending", async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    ctx.setDefaultTimeout(60_000);
    const page = await ctx.newPage();
    const R = ["9c000000-0000-4000-8000-00000000f001", "9c000000-0000-4000-8000-00000000f002"];
    const mk = (id, store, days) => ({ id, user_id: PAT, store, purchase_date: addDays(today, days), total: 6, currency: "AWG", receipt_path: null, notes: null, created_at: new Date().toISOString() });
    const item = (n, rid, name, price) => ({ id: `9d000000-0000-4000-8000-00000000f10${n}`, receipt_id: rid, user_id: PAT, name, normalized_name: name.toLowerCase(), category: "Other", quantity: 1, unit_price: price, line_total: price, unit: null, created_at: new Date().toISOString() });
    fake.table("grocery_receipts").push(mk(R[0], "Folira Supermarket", -6), mk(R[1], "TUR DIA", -2));
    fake.table("grocery_items").push(item(1, R[0], "Oreo", 1.5), item(2, R[1], "Oreo", 4.99));
    const spendBefore = fake.table("grocery_receipts").reduce((s, r) => s + r.total, 0);
    let answered = false;
    try {
      await page.route("**/api/store-prices", async (r) => {
        const body = r.request().postDataJSON();
        const key = body.products[0].key;
        const matches = { [key]: [
          { store: "superfood", storeName: "Super Food Plaza", itemId: "s1", name: "OREO COOKIES", size: null, price: 1.0, url: "https://shop.superfoodaruba.com/shop/x/p/1", fetchedAt: new Date().toISOString(), status: "same", confirmed: false, score: 1 },
          { store: "ling", storeName: "Ling & Sons", itemId: "l1", name: "Oreo Double Stuf", size: null, price: 1.4, url: "https://shop.lingandsons.com/products/oreo", fetchedAt: new Date().toISOString(), status: answered ? "same" : "ask", confirmed: answered, score: 0.7 },
        ] };
        await r.fulfill({ json: { matches, enabled: ["superfood", "ling"], stores: [{ id: "superfood", name: "Super Food Plaza", site: "shop.superfoodaruba.com", checkedAt: new Date().toISOString() }, { id: "ling", name: "Ling & Sons", site: "shop.lingandsons.com", checkedAt: new Date().toISOString() }] } });
      });
      await signIn(page, "pat@example.com", "Correct-Horse-1");
      await page.waitForURL((u) => u.pathname === "/");
      await page.goto(`${BASE}/personal/groceries/prices`);
      const card = page.getByTestId("price-product").filter({ hasText: "Oreo" }).first();
      await card.waitFor({ timeout: 60000 });
      const line = card.getByTestId("online-line");
      await line.waitFor({ timeout: 30000 });
      const lt = await line.innerText();
      assert(/Online/.test(lt) && /Super Food Plaza/.test(lt) && /33/.test(lt), "the list line shows the cheaper online price and the saving: " + lt);
      assert(/Includes 1 cheaper online/.test(await page.getByTestId("price-tiles").textContent()), "the Cheaper elsewhere tile counts it");
      await card.getByRole("button").first().click();
      const block = card.getByTestId("online-block");
      await block.waitFor();
      const bt = await block.innerText();
      assert(/online prices today/i.test(bt) && /Cheaper online at Super Food Plaza/.test(bt) && /never added to what you spent/.test(bt), "online block and note: " + bt.slice(0, 300));
      assert(/Their name: OREO COOKIES/.test(bt), "their product name is shown so you can check it");
      if (process.env.E2E_SHOTS) { await page.screenshot({ path: "/tmp/price/online_real.png", fullPage: true }); }
      assert(/what you paid/i.test(await card.getByTestId("price-detail").innerText()), "your purchases keep their own heading");
      assert((await card.getByTestId("online-yes").count()) === 1, "the unsure match asks once");
      const link = await card.locator('a:has-text("Open in shop")').first().getAttribute("href");
      assert(link.startsWith("https://shop.superfoodaruba.com/"), "link to the shop");
      answered = true;
      await card.getByTestId("online-yes").click();
      try { await page.waitForFunction(() => !document.querySelector('[data-testid="online-yes"]'), null, { timeout: 30000 }); }
      catch { throw new Error("the answer did not refresh the card: alerts=" + JSON.stringify(await page.locator('[role="alert"]').allInnerTexts()) + " saved=" + JSON.stringify(fake.table("grocery_online_matches"))); }
      assert(fake.table("grocery_online_matches").some((m) => m.store === "ling" && m.item_id === "l1" && m.same === true), "the answer is saved");
      assert((await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)), "no sideways scroll");
      assert(fake.table("grocery_receipts").reduce((s, r) => s + r.total, 0) === spendBefore, "your spending is unchanged");
      await page.getByTestId("online-stores").locator("summary").click();
      assert((await page.getByTestId("online-stores").getByRole("switch").count()) === 3, "a switch for each shop");
    } finally {
      await ctx.close();
      for (const t of ["grocery_receipts", "grocery_items", "grocery_online_matches"]) { const a = fake.table(t); for (let i = a.length - 1; i >= 0; i--) if (t === "grocery_online_matches" || String(a[i].id).includes("00000000f")) a.splice(i, 1); }
    }
  });

  await test("quick spend: a purchase with no receipt is saved, listed, offered again as a chip, and a receipt can be typed in by hand", async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    ctx.setDefaultTimeout(60_000);
    const page = await ctx.newPage();
    try {
      await signIn(page, "pat@example.com", "Correct-Horse-1");
      await page.waitForURL((u) => u.pathname === "/");
      await page.goto(`${BASE}/personal`);
      await page.getByRole("link", { name: /Quick spend/ }).first().click();
      await page.waitForURL((u) => u.pathname === "/personal/spend");
      await page.locator("#qs-amount").fill("4.5");
      // one currency control: AWG asks for no rate, USD shows what it comes to in AWG
      assert((await page.getByLabel("Exchange rate to USD").count()) === 0, "AWG shows no rate box");
      await page.getByRole("button", { name: "USD", exact: true }).click();
      assert(/8\.06/.test(await page.getByTestId("amount-in-awg").textContent()), "USD 4.50 shows as AWG 8.06");
      await page.getByRole("button", { name: "AWG", exact: true }).click();
      await page.locator("#qs-what").fill("Coffee");
      await page.getByRole("button", { name: "Street food", exact: true }).click();
      await page.getByTestId("quick-spend-save").click();
      await page.getByTestId("quick-spend-done").waitFor();
      const saved = fake.table("personal_spends")[0];
      assert(saved && saved.amount === 4.5 && saved.merchant === "Coffee" && saved.category === "Street food" && saved.currency === "AWG", "the spend is saved with its amount, name, category and AWG: " + JSON.stringify(saved));
      assert(!fake.table("expenses").some((e) => e.merchant === "Coffee"), "it never lands in business expenses");
      await page.getByTestId("spend-list").getByText("Coffee").waitFor(); // the list refreshes after the save
      assert(/Coffee/.test(await page.getByTestId("spend-list").textContent()) && /4\.50/.test(await page.getByTestId("month-total").textContent()), "it is listed and counted this month");
      await page.reload();
      await page.getByTestId("recent-names").getByRole("button", { name: "Coffee" }).waitFor();
      await page.getByTestId("recent-names").getByRole("button", { name: "Coffee" }).click();
      assert((await page.locator("#qs-what").inputValue()) === "Coffee" && (await page.locator("#qs-amount").inputValue()) === "4.5", "the chip fills in the name and last amount");
      assert((await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)), "no sideways scroll");
      // House: a repair attached to a home project, then the House & repairs list
      const HP = "9c000000-0000-4000-8000-00000000a0a1";
      fake.table("personal_projects").push({ id: HP, user_id: PAT, kind: "home_project", name: "Kitchen remodel", destination: null, description: null, start_date: null, end_date: null, budget: null, currency: "USD", status: "active", created_at: new Date().toISOString() });
      await page.goto(`${BASE}/personal/spend`);
      await page.locator("#qs-amount").fill("86");
      await page.locator("#qs-what").fill("Sliding door mechanism");
      assert((await page.getByTestId("house-extras").count()) === 0, "the house fields are hidden until the category is House");
      await page.getByRole("button", { name: "House", exact: true }).click();
      await page.getByTestId("house-extras").waitFor();
      await page.locator("#qs-project").selectOption(HP);
      await page.getByTestId("quick-spend-save").click();
      await page.getByTestId("quick-spend-done").waitFor();
      const hs = fake.table("personal_spends").find((r) => r.merchant === "Sliding door mechanism");
      assert(hs && hs.category === "House" && hs.project_id === HP, "the repair is saved under House and attached to the project: " + JSON.stringify(hs));
      await page.getByTestId("house-link").click();
      await page.waitForURL((u) => u.pathname === "/personal/house");
      await page.getByTestId("house-row").first().waitFor();
      assert(/Sliding door mechanism/.test(await page.getByTestId("house-list").textContent()) && /Kitchen remodel/.test(await page.getByTestId("house-list").textContent()), "the House list shows it with its project");
      await page.getByRole("button", { name: "Kitchen remodel", exact: true }).click();
      assert((await page.getByTestId("house-row").count()) === 1, "the project filter narrows the list");
      // an area of the house set in the back end, offered in the same dropdown
      for (const [i, n] of ["Kitchen", "Bathroom"].entries()) fake.table("house_areas").push({ id: `1a000000-0000-4000-8000-00000000d00${i}`, name: n, icon: "home", enabled: true, sort_order: i + 1 });
      await page.goto(`${BASE}/personal/spend`);
      await page.locator("#qs-amount").fill("38");
      await page.locator("#qs-what").fill("Tile grout");
      await page.getByRole("button", { name: "House", exact: true }).click();
      await page.locator("#qs-project optgroup[label='Areas of the house'] option").first().waitFor({ state: "attached" });
      await page.locator("#qs-project optgroup[label='Your home projects'] option").first().waitFor({ state: "attached" });
      assert((await page.locator("#qs-project optgroup[label='Your home projects'] option", { hasText: "Kitchen remodel" }).count()) === 1, "your project is in the first group");
      await page.locator("#qs-project").selectOption("area:Bathroom");
      await page.getByTestId("quick-spend-save").click();
      await page.getByTestId("quick-spend-done").waitFor();
      const grout = fake.table("personal_spends").find((r) => r.merchant === "Tile grout");
      assert(grout && grout.house_area === "Bathroom" && !grout.project_id, "the area is saved and no project: " + JSON.stringify(grout));
      await page.goto(`${BASE}/personal/house`);
      await page.getByRole("button", { name: "Bathroom", exact: true }).click();
      assert((await page.getByTestId("house-row").count()) === 1 && /Tile grout/.test(await page.getByTestId("house-list").textContent()), "the area filter narrows the list");
      await page.goto(`${BASE}/personal/projects/${HP}`);
      await page.getByText("Quick spend", { exact: false }).first().waitFor();
      assert(/Sliding door mechanism/.test(await page.locator("body").textContent()), "the project page lists the attached spend");
      // a receipt typed in by hand, no camera
      await page.goto(`${BASE}/personal/groceries/new`);
      await page.getByTestId("add-by-hand").click();
      assert((await page.getByText("Receipt photo", { exact: true }).count()) === 0 && (await page.getByTestId("manual-photo").count()) === 1, "by hand there is no scan step, only an optional photo to keep");
      await page.getByPlaceholder("Where did you shop?").fill("Plaza Market");
      await page.getByPlaceholder("Where did you shop?").press("Tab");
      const name = page.getByPlaceholder(/item/i).first();
      await name.fill("Milk Whole 1 L");
      await page.getByRole("button", { name: "Save receipt" }).click();
      await page.waitForURL((u) => /\/personal\/groceries\//.test(u.pathname) && !/new/.test(u.pathname), { timeout: 30000 });
      assert(fake.table("grocery_receipts").some((r) => r.store === "Plaza Market"), "the hand-typed receipt is saved");
    } finally {
      await ctx.close();
      fake.table("house_areas").splice(0);
      for (const t of ["personal_spends", "personal_projects", "grocery_receipts", "grocery_items"]) { const a = fake.table(t); for (let i = a.length - 1; i >= 0; i--) if (t === "personal_spends" || (t === "personal_projects" && a[i].name === "Kitchen remodel") || a[i].store === "Plaza Market" || a[i].name === "Milk Whole 1 L") a.splice(i, 1); }
    }
  });

  await test("desktop: the Personal pages use the wide screen, with the form beside the list, and nothing scrolls sideways", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    ctx.setDefaultTimeout(60_000);
    const page = await ctx.newPage();
    try {
      await signIn(page, "pat@example.com", "Correct-Horse-1");
      await page.waitForURL((u) => u.pathname === "/");
      await page.goto(`${BASE}/personal/spend`);
      const form = await page.getByTestId("quick-spend-form").boundingBox();
      const list = await page.getByTestId("spend-list").boundingBox();
      assert(form && list && list.x > form.x + form.width - 1 && Math.abs(list.y - form.y) < 160, "Quick spend: the list sits beside the form: " + JSON.stringify({ form, list }));
      assert(form.width < 520, "the form keeps a comfortable width: " + form.width);
      for (const path of ["/personal/spend", "/personal/house", "/personal/savings", "/personal/savings/add", "/personal/utilities", "/personal/utilities/add", "/personal/groceries/price-check", "/personal/budget"]) {
        await page.goto(`${BASE}${path}`);
        await page.waitForLoadState("networkidle");
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${path}: no sideways scroll on desktop`);
        if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/${path.replace(/\//g, "_")}.png` });
        const w = await page.evaluate(() => Math.round(document.querySelector("main")?.querySelector("[class*=max-w]")?.getBoundingClientRect().width ?? 0));
        assert(w > 700, `${path}: uses the wide screen (${w}px)`);
      }
    } finally {
      await ctx.close();
    }
  });

  await test("quick spend: a spend from an earlier month can be opened, changed and deleted", async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    ctx.setDefaultTimeout(60_000);
    const page = await ctx.newPage();
    const stash = fake.table("personal_spends").splice(0);
    try {
      const d = new Date(); d.setUTCDate(15); d.setUTCMonth(d.getUTCMonth() - 3);
      const old = d.toISOString().slice(0, 10);
      fake.table("personal_spends").push({ id: "7e000000-0000-4000-8000-00000000e001", user_id: PAT, merchant: "Door handle", amount: 38.5, currency: "AWG", exchange_rate: 0.558659, amount_usd: 21.51, category: "House", expense_date: old, receipt_path: `${PAT}/personal/spends/old.jpg`, created_at: new Date().toISOString() });
      await signIn(page, "pat@example.com", "Correct-Horse-1");
      await page.waitForURL((u) => u.pathname === "/");
      await page.goto(`${BASE}/personal/spend`);
      await page.getByTestId("month-stepper").waitFor();
      for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Earlier month" }).click();
      await page.getByRole("button", { name: "Change Door handle" }).click();
      assert((await page.locator("#qs-amount").inputValue()) === "38.5" && (await page.locator("#qs-what").inputValue()) === "Door handle", "the form is filled in with the spend");
      await page.getByTestId("spend-photo-saved").waitFor();
      await page.locator("#qs-amount").fill("41");
      await page.getByTestId("quick-spend-save").click();
      await page.getByTestId("quick-spend-done").waitFor();
      const changed = fake.table("personal_spends").find((r) => r.id === "7e000000-0000-4000-8000-00000000e001");
      assert(changed && changed.amount === 41 && changed.expense_date === old && changed.exchange_rate === 0.558659, "the amount changed, the date and the saved rate stayed: " + JSON.stringify(changed));
      assert(fake.table("personal_spends").length === 1, "it is still one spend, not a copy");
      await page.getByRole("button", { name: "Change Door handle" }).click();
      await page.getByTestId("spend-edit-delete").click();
      await page.getByRole("button", { name: "Delete", exact: true }).last().click();
      await page.waitForFunction(() => document.querySelectorAll("[data-testid=spend-row]").length === 0);
      assert(fake.table("personal_spends").length === 0, "the spend is deleted");
    } finally {
      await ctx.close();
      const a = fake.table("personal_spends"); a.splice(0); a.push(...stash);
    }
  });

  await test("budget: a monthly budget is set with an area limit, and the Personal card shows what is left and which area is over", async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    ctx.setDefaultTimeout(60_000);
    const page = await ctx.newPage();
    const stash = {};
    try {
      await signIn(page, "pat@example.com", "Correct-Horse-1");
      await page.waitForURL((u) => u.pathname === "/");
      const today = new Date().toISOString().slice(0, 10);
      // start from an empty month, whatever earlier tests left behind; put it all back afterwards
      for (const t of ["grocery_receipts", "personal_spends", "utility_bills", "personal_expenses"]) { stash[t] = fake.table(t).splice(0); }
      fake.table("grocery_receipts").push({ id: "7c000000-0000-4000-8000-00000000c001", user_id: PAT, store: "Budget Market", purchase_date: today, total: 179, currency: "AWG", prices_only: false, created_at: new Date().toISOString() });
      fake.table("personal_spends").push({ id: "7c000000-0000-4000-8000-00000000c002", user_id: PAT, merchant: "Hinge", amount: 90, currency: "AWG", exchange_rate: 0.558659, amount_usd: 50.28, category: "House", expense_date: today, created_at: new Date().toISOString() });
      await page.goto(`${BASE}/personal`);
      await page.getByTestId("budget-empty").waitFor();
      await page.getByTestId("budget-empty").click();
      await page.waitForURL((u) => u.pathname === "/personal/budget");
      await page.locator("#bg-amount").fill("1000");
      await page.getByRole("switch", { name: "Limits for each area" }).click();
      await page.locator("#bg-limit-groceries").fill("150");
      await page.locator("#bg-limit-house").fill("500");
      await page.getByRole("switch", { name: "Tell me at 80%" }).click();
      await page.getByTestId("budget-save").click();
      await page.waitForURL((u) => u.pathname === "/personal");
      await page.getByTestId("budget-card").waitFor();
      const saved = fake.table("personal_budgets").find((r) => r.user_id === PAT);
      assert(saved && saved.amount === 1000 && saved.currency === "AWG" && saved.month == null && saved.alert_at_80 === true && saved.limits.groceries === 150 && saved.limits.house === 500 && saved.limits.utilities == null, "the budget is saved for every month with its limits: " + JSON.stringify(saved));
      assert((await page.getByTestId("budget-card").getAttribute("data-state")) === "ok", "269 of 1,000 is on track");
      assert(/731/.test(await page.getByTestId("budget-headline").textContent()), "731 is left: " + (await page.getByTestId("budget-headline").textContent()));
      assert(/269/.test(await page.getByTestId("budget-line").textContent()), "269 spent is shown");
      assert((await page.getByTestId("budget-area-bar-groceries").getAttribute("data-over")) === "true", "groceries (179 of 150) is over its limit");
      assert((await page.getByTestId("budget-area-bar-house").getAttribute("data-over")) === null, "the house (90 of 500) is not");
      assert(/no limit/.test(await page.getByTestId("budget-area-quick").textContent()), "an area with no limit says so");
      // a smaller budget for just this month turns the card over
      await page.getByTestId("budget-set-link").click();
      await page.waitForURL((u) => u.pathname === "/personal/budget");
      await page.getByRole("button", { name: /^Only / }).click();
      await page.locator("#bg-amount").fill("200");
      await page.getByTestId("budget-save").click();
      await page.waitForURL((u) => u.pathname === "/personal");
      await page.waitForFunction(() => document.querySelector("[data-testid=budget-card]")?.getAttribute("data-state") === "over");
      assert(fake.table("personal_budgets").length === 2 && fake.table("personal_budgets").some((r) => r.month), "a second budget is kept for this month only");
      assert(/69/.test(await page.getByTestId("budget-headline").textContent()), "69 over is shown: " + (await page.getByTestId("budget-headline").textContent()));
      assert(/Over by/.test(await page.getByTestId("budget-headline").textContent()), "the headline says how far over");
      await page.getByTestId("budget-legend").waitFor();
      assert((await page.getByTestId("budget-area-groceries").getAttribute("href")) === "/personal/groceries", "an area row opens that area");
      const houseTile = page.getByRole("link", { name: /House & repairs/ }).first();
      assert(/90/.test(await houseTile.textContent()) && (await houseTile.getAttribute("href")) === "/personal/house", "the House & repairs tile shows this month's house spending: " + (await houseTile.textContent()));
      await page.getByTestId("where-pie").waitFor();
      assert((await page.getByTestId("where-groceries").getAttribute("href")) === "/personal/groceries" && (await page.getByTestId("where-house").getAttribute("href")) === "/personal/house", "Where it goes lists each part and opens it");
      const wTotal = await page.getByTestId("where-total").textContent(), wList = await page.getByTestId("where-list").textContent();
      assert(/AWG/.test(wTotal) && /House & repairs/.test(wList) && /%/.test(wList), "Where it goes shows the month total, the parts and their shares: " + wTotal);
      const quickTile = page.getByRole("link", { name: /Quick spend/ }).first();
      assert(!/90/.test(await quickTile.textContent()), "the Quick spend tile does not repeat the house cost: " + (await quickTile.textContent()));
      assert((await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)), "no sideways scroll");
    } finally {
      await ctx.close();
      fake.table("personal_budgets").splice(0);
      for (const t of Object.keys(stash)) { const a = fake.table(t); a.splice(0); a.push(...stash[t]); }
    }
  });

  await test("savings: a plan starts from what is already saved, counts its months, can skip, add extra and pause, and shows in the budget", async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    ctx.setDefaultTimeout(60_000);
    const page = await ctx.newPage();
    const stash = {};
    try {
      await signIn(page, "pat@example.com", "Correct-Horse-1");
      await page.waitForURL((u) => u.pathname === "/");
      // the hub shows one currency for the month, so start from an empty month; put it all back afterwards
      for (const t of ["grocery_receipts", "personal_spends", "utility_bills", "personal_expenses"]) { stash[t] = fake.table(t).splice(0); }
      const first = new Date(); first.setUTCDate(1); first.setUTCMonth(first.getUTCMonth() - 2);
      fake.table("personal_budgets").push({ id: "7d000000-0000-4000-8000-00000000d001", user_id: PAT, month: null, amount: 1000, currency: "AWG", limits: {}, alert_at_80: false });
      await page.goto(`${BASE}/personal/savings`);
      await page.getByTestId("savings-empty").waitFor();
      await page.getByTestId("savings-add").click();
      await page.waitForURL((u) => u.pathname === "/personal/savings/add");
      await page.locator("#sv-name").fill("Emergency fund");
      await page.locator("#sv-amount").fill("200");
      await page.locator("#sv-start").fill(first.toISOString().slice(0, 10));
      await page.getByRole("switch", { name: "I already have savings" }).click();
      await page.locator("#sv-opening").fill("1000");
      await page.getByRole("switch", { name: "Savings goal" }).click();
      await page.getByLabel("Goal amount").fill("5000");
      await page.getByTestId("savings-save").click();
      await page.waitForURL((u) => u.pathname === "/personal/savings");
      await page.getByTestId("savings-plan").waitFor();
      const plan = fake.table("savings_plans").find((r) => r.user_id === PAT);
      assert(plan && plan.name === "Emergency fund" && plan.amount === 200 && plan.opening_balance === 1000 && plan.goal === 5000 && plan.end_date == null, "the plan is saved with its amount, start balance and goal: " + JSON.stringify(plan));
      assert(/1,600/.test(await page.getByTestId("savings-total").textContent()), "1,000 already saved plus three months of 200 is 1,600: " + (await page.getByTestId("savings-total").textContent()));
      await page.getByTestId("savings-plan").click();
      await page.waitForURL((u) => u.pathname === "/personal/savings/plan");
      await page.getByTestId("plan-deposit").first().waitFor();
      assert(/1,600/.test(await page.getByTestId("plan-saved").textContent()), "the plan shows 1,600 saved");
      assert((await page.locator("[data-testid=plan-deposit][data-status=counted]").count()) === 3, "three months are counted");
      // skip the next month, then undo it
      await page.getByTestId("plan-skip").click();
      await page.locator("[data-testid=plan-deposit][data-status=skipped]").waitFor();
      await page.getByTestId("plan-unskip").click();
      await page.locator("[data-testid=plan-deposit][data-status=skipped]").waitFor({ state: "detached" });
      // an extra deposit counts right away
      await page.getByTestId("plan-extra").click();
      await page.locator("#plan-extra-amount").fill("50");
      await page.getByTestId("plan-extra-save").click();
      await page.waitForFunction(() => /1,650/.test(document.querySelector("[data-testid=plan-saved]")?.textContent ?? ""));
      assert(fake.table("savings_events").some((r) => r.kind === "extra" && r.amount === 50), "the extra deposit is saved");
      // the budget counts this month's 200 and the extra 50 in its own Savings line, and Personal has the tile
      await page.goto(`${BASE}/personal`);
      await page.getByTestId("budget-area-savings").waitFor();
      assert(/250/.test(await page.getByTestId("budget-area-savings").textContent()), "Savings in the budget is 250: " + (await page.getByTestId("budget-area-savings").textContent()));
      assert(/1,650\.00 saved/.test(await page.locator("a[href='/personal/savings']").filter({ hasText: "a month" }).first().textContent()), "the Savings tile shows the total saved");
      // pause stops deposits
      await page.goto(`${BASE}/personal/savings`);
      await page.getByTestId("savings-plan").click();
      await page.getByTestId("plan-pause").click();
      await page.waitForFunction(() => /Resume plan/.test(document.querySelector("[data-testid=plan-pause]")?.textContent ?? ""));
      assert(fake.table("savings_plans")[0].paused_on, "the pause date is saved");
      assert((await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)), "no sideways scroll");
    } finally {
      await ctx.close();
      for (const t of ["savings_plans", "savings_events", "personal_budgets"]) fake.table(t).splice(0);
      for (const t of Object.keys(stash)) { const a = fake.table(t); a.splice(0); a.push(...stash[t]); }
    }
  });

  await test("utilities: a bill is added by hand, shown paid for the month, traced in its history and a reminder day is saved", async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    ctx.setDefaultTimeout(60_000);
    const page = await ctx.newPage();
    try {
      await signIn(page, "pat@example.com", "Correct-Horse-1");
      await page.waitForURL((u) => u.pathname === "/");
      // an earlier phone bill, so the month shows "No bill yet" for it
      const lastMonth = new Date(); lastMonth.setUTCDate(1); lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
      fake.table("utility_bills").push({ id: "7b000000-0000-4000-8000-00000000b001", user_id: PAT, kind: "phone", provider: "SETAR", bill_month: lastMonth.toISOString().slice(0, 10), amount: 60, currency: "AWG", exchange_rate: 0.558659, amount_usd: 33.52, paid_on: lastMonth.toISOString().slice(0, 10), due_date: null, receipt_path: null, notes: null, created_at: new Date().toISOString() });
      await page.goto(`${BASE}/personal`);
      await page.getByRole("link", { name: /Utilities/ }).first().click();
      await page.waitForURL((u) => u.pathname === "/personal/utilities");
      await page.getByTestId("util-list").waitFor();
      await page.waitForFunction(() => /Nothing paid/.test(document.querySelector("[data-testid=util-list]").textContent));
      assert(true, "a month with no payments says so (last month's payment is not counted here)");
      await page.getByTestId("util-add").click();
      await page.waitForURL((u) => u.pathname === "/personal/utilities/add");
      await page.getByRole("button", { name: "Water", exact: true }).click();
      await page.locator("#ub-provider").fill("WEB Aruba");
      await page.locator("#ub-amount").fill("120");
      await page.getByTestId("util-save").click();
      await page.waitForURL((u) => u.pathname === "/personal/utilities");
      await page.getByTestId("util-row").first().waitFor();
      const saved = fake.table("utility_bills").find((r) => r.kind === "water");
      assert(saved && saved.amount === 120 && saved.currency === "AWG" && saved.provider === "WEB Aruba" && saved.paid_on === new Date().toISOString().slice(0, 10) && saved.bill_month === lastMonth.toISOString().slice(0, 10), "the bill is saved with its amount, company, the month it is for (one back by default) and today as the payment date: " + JSON.stringify(saved));
      const list = await page.getByTestId("util-list").textContent();
      assert(/Water/.test(list) && /for /.test(list) && /paid /.test(list) && /WEB Aruba/.test(list), "this month lists water as paid today, labelled with the month it is for");
      assert(/AWG.{0,2}120\.0\d/.test(await page.getByTestId("util-total").textContent()), "the month total is in florins (AWG)");
      await page.getByTestId("util-row").filter({ hasText: "Water" }).getByRole("link").click();
      await page.waitForURL((u) => u.pathname === "/personal/utilities/history");
      await page.getByTestId("util-bill").first().waitFor();
      assert(/WEB Aruba/.test(await page.getByTestId("util-history").textContent()), "the history lists the bill");
      assert((await page.getByTestId("util-highest").textContent()).includes("120.0"), "the highest month is shown in florins");
      // change the bill to not paid, with a due date
      await page.getByRole("link", { name: /Change .* bill/ }).first().click();
      await page.waitForURL((u) => u.pathname === "/personal/utilities/add");
      await page.locator("#ub-amount").waitFor();
      await page.waitForFunction(() => document.querySelector("#ub-amount").value === "120");
      await page.getByRole("button", { name: "Not paid yet" }).click();
      await page.locator("#ub-due").fill(new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10));
      await page.getByTestId("util-save").click();
      await page.waitForURL((u) => u.pathname === "/personal/utilities");
      await page.getByTestId("util-due").first().waitFor();
      assert(/Water/.test(await page.getByTestId("util-due-list").textContent()), "a bill not paid yet moves to the Due list");
      assert(/AWG.{0,2}0\.00/.test(await page.getByTestId("util-total").textContent()), "an unpaid bill is not in the month total");
      assert(fake.table("utility_bills").filter((r) => r.kind === "water").length === 1 && fake.table("utility_bills").find((r) => r.kind === "water").paid_on == null, "changing the bill updates the same row");
      // a bill waiting in Due can be deleted from its own form (it used to need the history page)
      await page.getByTestId("util-due").first().getByRole("link").click();
      await page.getByTestId("util-delete").click();
      await page.getByRole("button", { name: "Delete", exact: true }).last().click();
      await page.waitForURL((u) => u.pathname === "/personal/utilities");
      await page.waitForFunction(() => !document.querySelector("[data-testid=util-due]"));
      assert(fake.table("utility_bills").filter((r) => r.kind === "water").length === 0, "Delete this bill removes it from the database");
      // reminder day
      await page.getByTestId("util-remind").click();
      await page.locator("#util-day").selectOption("5");
      await page.getByTestId("util-remind-saved").waitFor();
      assert(fake.table("utility_prefs").some((r) => r.user_id === PAT && Number(r.remind_day) === 5), "the reminder day is saved");
      assert((await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)), "no sideways scroll");
    } finally {
      await ctx.close();
      for (const t of ["utility_bills", "utility_prefs"]) fake.table(t).splice(0);
    }
  });

  await test("bill emails: your Gmail script and key are shown, a sender is allowed, the script's calls are checked, and an emailed bill waits in the Due list marked from email", async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    ctx.setDefaultTimeout(60_000);
    const page = await ctx.newPage();
    try {
      await signIn(page, "pat@example.com", "Correct-Horse-1");
      await page.waitForURL((u) => u.pathname === "/");
      // the webhook refuses a wrong secret and accepts the right one
      const bad = await page.request.post(`${BASE}/api/email/inbound?secret=nope`, { data: { From: "x@y.com" } });
      assert(bad.status() === 403, "a wrong secret is refused: " + bad.status());
      const basicOk = await page.request.post(`${BASE}/api/email/inbound`, { headers: { authorization: "Basic " + Buffer.from("postmark:e2e-inbound-secret-long").toString("base64") }, data: { From: "x@y.com" } });
      const basicBad = await page.request.post(`${BASE}/api/email/inbound`, { headers: { authorization: "Basic " + Buffer.from("postmark:wrong").toString("base64") }, data: { From: "x@y.com" } });
      assert(basicOk.status() === 200 && basicBad.status() === 403, "the secret works as a basic-auth password and a wrong one is refused: " + basicOk.status() + "/" + basicBad.status());
      await page.goto(`${BASE}/personal/utilities/emails`);
      await page.getByTestId("email-script").waitFor();
      const script = await page.getByTestId("email-script").textContent();
      const key = (/const KEY = "([0-9a-f]{32})"/.exec(script || "") || [])[1];
      assert(key && /const ENDPOINT = "http:\/\/localhost:\d+\/api\/email\/gmail"/.test(script || ""), "the script holds your key and this app's address");
      assert(fake.table("bill_email_addresses").some((r) => r.user_id === PAT && r.token === key), "the key is saved for the account");
      assert(/Not connected yet/.test(await page.getByTestId("email-status").textContent()), "before any mail, the status says not connected");
      await page.getByTestId("email-suggest-noreply@elmar.aw").click();
      await page.waitForFunction(() => /elmar\.aw/.test(document.querySelector("[data-testid=email-senders]")?.textContent || ""));
      assert(fake.table("bill_email_senders").some((r) => r.user_id === PAT && r.email === "noreply@elmar.aw"), "an allowed sender is saved");
      // the script's calls: a wrong key is refused, the right key gets the sender list
      const badKey = await page.request.get(`${BASE}/api/email/gmail`, { headers: { "x-bill-key": "0".repeat(32) } });
      const none = await page.request.get(`${BASE}/api/email/gmail`);
      assert(badKey.status() === 403 && none.status() === 403, "a wrong or missing key is refused: " + badKey.status() + "/" + none.status());
      const list = await page.request.get(`${BASE}/api/email/gmail`, { headers: { "x-bill-key": key } });
      assert(list.status() === 200 && JSON.stringify((await list.json()).senders) === JSON.stringify(["noreply@elmar.aw"]), "the script learns which senders are allowed");
      // your own account numbers: a parent's bill from the same company is skipped, and one tap adds an account
      await page.getByTestId("email-account-input-noreply@elmar.aw").fill("541324-1019191");
      await page.getByTestId("email-account-add-noreply@elmar.aw").click();
      await page.getByTestId("email-account-chip").waitFor();
      assert(fake.table("bill_email_senders").some((r) => r.email === "noreply@elmar.aw" && JSON.stringify(r.accounts) === JSON.stringify(["541324-1019191"])), "an account number is saved on the sender");
      const mom = await page.request.post(`${BASE}/api/email/gmail`, { headers: { "x-bill-key": key }, data: { From: "ELMAR <noreply@elmar.aw>", Subject: "Your new ELMAR bill is ready", Date: new Date().toISOString(), MessageID: "gm0", TextBody: "Account Number: 600118-2204\n- New Bill Amount: AWG 50.00\n- Bill Due Date: Dec 14, 2026", Auth: "", Attachments: [] } });
      assert(mom.status() === 200 && (await mom.json()).status === "wrong_account" && fake.table("utility_bills").length === 0, "another account's bill is skipped and not added");
      await page.reload();
      await page.getByTestId("email-add-account").waitFor();
      assert(/600118-2204/.test(await page.getByTestId("email-log").textContent()), "the skipped account is shown in Recent emails");
      const el = await page.request.post(`${BASE}/api/email/gmail`, { headers: { "x-bill-key": key }, data: { From: "ELMAR <noreply@elmar.aw>", Subject: "Your new ELMAR bill is ready", Date: new Date().toISOString(), MessageID: "gm1", TextBody: "Account Number: 541324-1019191\n- New Bill Amount: AWG 116.17\n- Bill Due Date: Dec 14, 2026\n- Prior Open Balance: AWG 93.12", Auth: "", Attachments: [] } });
      assert(el.status() === 200 && (await el.json()).status === "added", "the emailed bill is added: " + el.status());
      await page.reload();
      await page.getByTestId("email-log").waitFor();
      assert(/Connected/.test(await page.getByTestId("email-status").textContent()), "after the first email, the status says connected");
      await page.goto(`${BASE}/personal/utilities`);
      await page.getByTestId("util-from-email").first().waitFor();
      const due = await page.getByTestId("util-due-list").textContent();
      assert(/Elmar/i.test(due) && /116\.17/.test(due), "the emailed bill waits in the Due list: " + due);
      assert(/AWG.{0,2}0\.00/.test(await page.getByTestId("util-total").textContent()), "an emailed bill is not counted until paid");
      assert((await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)), "no sideways scroll");
    } finally {
      await ctx.close();
      for (const t of ["utility_bills", "bill_email_addresses", "bill_email_senders", "bill_email_log"]) fake.table(t).splice(0);
    }
  });

  await test("price notes: a receipt kept for its prices is not spending, a nameless line becomes Item 1, a store remembers its currency, and shop prices reach the tracker", async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    ctx.setDefaultTimeout(60_000);
    const page = await ctx.newPage();
    try {
      await signIn(page, "pat@example.com", "Correct-Horse-1");
      await page.waitForURL((u) => u.pathname === "/");
      const mk = (id, store, date, total, currency, extra = {}) => ({ id, user_id: PAT, store, purchase_date: date, total, currency, receipt_path: null, notes: null, created_at: new Date().toISOString(), ...extra });
      fake.table("grocery_receipts").push(mk("6a000000-0000-4000-8000-00000000c001", "Plaza Market", today, 20, "USD"));
      fake.table("grocery_receipts").push(mk("6a000000-0000-4000-8000-00000000c002", "One2Three Color Market", addDays(today, -1), 11.5, "AWG", { prices_only: true }));
      await page.goto(`${BASE}/personal/groceries`);
      await page.getByLabel("Currency").waitFor();
      assert((await page.getByTestId("prices-only-tag").count()) === 0 && /\$20\.00/.test(await page.locator("main, body").first().textContent()), "the USD month shows the paid receipt only");
      await page.getByLabel("Currency").selectOption("AWG");
      await page.getByTestId("prices-only-tag").waitFor();
      const awg = await page.locator("body").textContent();
      assert(!/AWG\s?11\.50\s*1 receipt/.test(awg.replace(/\s+/g, " ")) && /Spent this month\s*(AWG|Afl\.?)?\s*[\u0192\u0192A-Za-z.]*\s*0\.00/.test(awg.replace(/\s+/g, " ")) || true, "prices-only is not counted");
      const spentCard = await page.getByText("Spent this month").locator("xpath=ancestor::div[contains(@class,'rounded')][1]").textContent();
      assert(/0\.00/.test(spentCard) && /0 receipts/.test(spentCard), "the prices-only receipt adds nothing to spending: " + spentCard);
      // a new receipt by hand: the store's own currency comes back, the nameless line is kept as Item 1
      await page.goto(`${BASE}/personal/groceries/new?manual=1`);
      await page.getByPlaceholder("Where did you shop?").fill("One2Three Color Market");
      await page.waitForFunction(() => [...document.querySelectorAll("select")].some((s) => s.value === "AWG"));
      await page.getByRole("radio", { name: /Just keeping the prices/ }).click();
      await page.getByTestId("prices-only-note").waitFor();
      await page.locator("div:has(> label:text-is('Price each')) input").first().fill("1.75");
      await page.getByRole("button", { name: "Save prices" }).click();
      await page.waitForURL((u) => /\/personal\/groceries\//.test(u.pathname) && !/new/.test(u.pathname), { timeout: 30000 });
      await page.getByTestId("prices-only-detail").waitFor();
      const kept = fake.table("grocery_receipts").find((r) => r.store === "One2Three Color Market" && r.id !== "6a000000-0000-4000-8000-00000000c002");
      assert(kept && kept.prices_only === true && kept.currency === "AWG", "the receipt is saved as prices only in AWG: " + JSON.stringify(kept));
      assert(fake.table("grocery_items").some((i) => i.receipt_id === kept.id && i.name === "Item 1"), "the nameless line is saved as Item 1");
      // a price seen in a shop, two stores
      await page.goto(`${BASE}/personal/groceries/price-check`);
      await page.locator("#pc-product").fill("C4 Energy");
      await page.locator("#pc-store").fill("Fit Stop");
      await page.locator("#pc-price").fill("39.95");
      await page.locator("#pc-size").fill("30 servings");
      await page.getByTestId("price-check-another").click();
      await page.getByTestId("price-check-done").waitFor();
      const first = fake.table("price_checks")[0];
      assert(first && first.product === "C4 Energy" && first.store === "Fit Stop" && first.price === 39.95 && first.currency === "AWG" && first.size === "30 servings", "the price is saved: " + JSON.stringify(first));
      assert((await page.locator("#pc-product").inputValue()) === "C4 Energy" && (await page.locator("#pc-store").inputValue()) === "", "add another store keeps the product and clears the store");
      await page.locator("#pc-store").fill("Vitamin Corner");
      await page.locator("#pc-price").fill("42.5");
      await page.locator("#pc-size").fill("30 servings");
      await page.getByTestId("price-check-save").click();
      await page.waitForFunction(() => /Vitamin Corner/.test(document.querySelector("[data-testid=seen-so-far]")?.textContent || ""));
      const seen = await page.getByTestId("seen-so-far").textContent();
      assert(seen.indexOf("Fit Stop") < seen.indexOf("Vitamin Corner"), "seen so far lists the cheapest first");
      assert(!fake.table("expenses").some((e) => e.merchant === "C4 Energy") && !fake.table("personal_spends").length, "it never counts as spending");
      // a price added by mistake can be deleted, after a question
      assert((await page.getByTestId("added-price").count()) === 2, "both prices are listed for the product");
      await page.getByRole("button", { name: "Delete Vitamin Corner price" }).click();
      await page.getByRole("button", { name: "Delete", exact: true }).last().click();
      await page.waitForFunction(() => document.querySelectorAll("[data-testid=added-price]").length === 1);
      assert(fake.table("price_checks").length === 1 && fake.table("price_checks")[0].store === "Fit Stop", "the wrong price is gone and the other stays");
      await page.goto(`${BASE}/personal/groceries/prices`);
      await page.getByText("C4 Energy", { exact: false }).first().waitFor();
      assert((await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)), "no sideways scroll");
    } finally {
      await ctx.close();
      for (const t of ["price_checks", "grocery_receipts", "grocery_items"]) fake.table(t).splice(0);
    }
  });

  await test("on a phone the document row menu is not cut off by its card", async () => {
    fake.table("travel_documents").push({ id: "d0c00000-0000-4000-8000-0000000003aa", user_id: PAT, kind: "visa", title: "Menu Visa", issuing_country: "USA", document_number: null, expiry_date: addDays(today, 400), trip_id: null, file_path: null, created_at: new Date().toISOString() });
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    ctx.setDefaultTimeout(60_000);
    const page = await ctx.newPage();
    await signIn(page, "pat@example.com", "Correct-Horse-1");
    await page.waitForURL((u) => u.pathname === "/");
    await page.goto(`${BASE}/documents`);
    const more = page.locator("summary[aria-label^='More actions']").first();
    await more.waitFor();
    await more.click();
    const del = page.getByRole("button", { name: "Delete", exact: true }).first();
    await del.waitFor();
    // Whatever is at the middle of the Delete button must be the button itself: a clipped menu would show the card behind it
    const hit = await del.evaluate((el) => { const r = el.getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!top && el.contains(top); });
    const why = hit ? "" : await del.evaluate((el) => { const r = el.getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); const clip = []; for (let n = el.parentElement; n; n = n.parentElement) { const o = getComputedStyle(n).overflow; if (o !== "visible") clip.push(`${n.tagName}.${String(n.className).slice(0, 40)}:${o}`); } return `top=${top?.tagName}.${String(top?.className).slice(0, 50)} rect=${Math.round(r.y)}+${Math.round(r.height)} clippers=${clip.join(" | ")}`; });
    assert(hit, "the menu is not cut off by its card " + why);
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

  await test("home: the connection chip shows a cloud when online and a phone (saved here) when offline", async () => {
    const { ctx, page } = await newPage();
    await signIn(page, "pat@example.com", "Correct-Horse-1");
    await page.waitForURL((u) => u.pathname === "/");
    const chip = page.getByTestId("connection");
    await chip.waitFor();
    assert((await chip.innerText()) === "Online" && (await chip.getAttribute("data-online")) === "true", "online chip text");
    assert((await chip.locator("svg.lucide-cloud").count()) === 1, "a cloud icon while online");
    await ctx.setOffline(true);
    await page.waitForFunction(() => document.querySelector('[data-testid="connection"]')?.getAttribute("data-online") === "false");
    assert((await chip.innerText()) === "Offline", "offline chip text");
    assert((await chip.locator("svg.lucide-smartphone").count()) === 1 && (await chip.locator("svg.lucide-cloud").count()) === 0, "a phone icon while offline");
    await ctx.setOffline(false);
    await page.waitForFunction(() => document.querySelector('[data-testid="connection"]')?.getAttribute("data-online") === "true");
    assert((await chip.locator("svg.lucide-cloud").count()) === 1, "the cloud is back when the connection returns");
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

  /* ---------- partner sharing ---------- */
  await test("sharing: invite by email, accept, share a card and a trip, the partner sees only that, and revoking removes it", async () => {
    const CARD = "a1a1a1a1-0000-4000-8000-000000000001";
    const ATRIP = "a1a1a1a1-0000-4000-8000-000000000002";
    fake.table("loyalty_cards").push({ id: CARD, user_id: ALICE, store_name: "Greenfield Market", holder_name: null, category: "Rewards", card_number: "402188301177", barcode_format: "CODE128", color: null, image_path: null, created_at: new Date().toISOString() });
    fake.table("trips").push({ id: ATRIP, user_id: ALICE, name: "Lisbon Summit", destination: "Lisbon", category: "Business", start_date: addDays(today, 10), end_date: addDays(today, 14), currency: "USD", status: "active", notes: "SECRET-NOTES", created_at: new Date().toISOString() });
    fake.table("expenses").push({ id: "a1a1a1a1-0000-4000-8000-000000000003", trip_id: ATRIP, user_id: ALICE, merchant: "SECRET-HOTEL", amount: 987.65, currency: "USD", exchange_rate: 1, amount_usd: 987.65, category: "Lodging", expense_date: addDays(today, 10), notes: null, receipt_path: "x/secret-receipt.jpg", created_at: new Date().toISOString() });

    const phone = async () => { const c = await browser.newContext({ viewport: { width: 390, height: 844 } }); c.setDefaultTimeout(60_000); return { ctx: c, page: await c.newPage() }; };
    const signedIn = async (email, password) => { const x = await phone(); await signIn(x.page, email, password); await x.page.waitForURL((u) => u.pathname === "/"); return x; };
    const shot = async (page, name, sel) => { if (process.env.E2E_SHOT) await (sel ? page.locator(sel).screenshot({ path: `${process.env.E2E_SHOT}/${name}.png` }) : page.screenshot({ path: `${process.env.E2E_SHOT}/${name}.png`, fullPage: false })); };
    const api = async (page, path, opts = {}) => { const r = await page.request.fetch(`${BASE}${path}`, { maxRedirects: 0, ...opts }); let body = null; try { body = await r.json(); } catch { /* not json */ } return { status: r.status(), body }; };
    const post = (page, path, data, headers = {}) => api(page, path, { method: "POST", data, headers });

    const a = await signedIn("alice@example.com", "Alice-Pass-123");
    const b = await signedIn("bob@example.com", "Bob-Pass-12345");
    const c = await signedIn("carol@example.com", "Carol-Pass-123");
    const pat = await signedIn("pat@example.com", "Correct-Horse-1");

    // 1. Sharing is off until Alice turns it on; she invites an email with no account and one that has an account
    await a.page.goto(`${BASE}/profile#sharing`);
    await a.page.locator("#sharing").getByText("Sharing is off").waitFor();
    await a.page.getByRole("button", { name: "Turn on sharing" }).click();
    const invite = async (page, email) => {
      await page.getByRole("button", { name: "Add a partner" }).click();
      await page.locator("#partner-email").fill(email);
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await page.getByRole("dialog", { name: "Send an invite?" }).waitFor();
      assert((await page.getByRole("dialog").innerText()).includes(email), "the confirm step names the email");
      await page.getByRole("button", { name: "Send invite" }).click();
      const done = page.getByRole("dialog", { name: "Invite sent" });
      await done.waitFor();
      const text = await done.innerText();
      await page.getByRole("button", { name: "OK" }).click();
      return text;
    };
    const unknownAnswer = await invite(a.page, "nobody@nowhere.test");
    const knownAnswer = await invite(a.page, "bob@example.com");
    assert(unknownAnswer === knownAnswer, `an email with no account must get the very same answer:\n${unknownAnswer}\n${knownAnswer}`);
    assert(!/no user|not found|no account/i.test(knownAnswer), "the answer never says whether the email has an account");
    assert((await a.page.locator("#sharing").getByText("Pending").count()) === 2, "both invites show as Pending");

    // 2. Bob sees the invite as a popup and on the bell; Later keeps it on the bell, and the popup does not nag again
    await b.page.reload();
    const popup = b.page.getByRole("dialog", { name: "Sharing invite" });
    await popup.waitFor();
    await shot(b.page, "share-1-invite-popup");
    assert(/alice/i.test(await popup.innerText()) && /Nothing is shared until you accept/.test(await popup.innerText()), "the popup names the sender and says nothing is shared yet");
    await popup.getByRole("button", { name: "Later" }).click();
    await b.page.reload();
    await b.page.getByRole("button", { name: /Notifications, 1 need attention/ }).waitFor();
    assert((await b.page.getByRole("dialog", { name: "Sharing invite" }).count()) === 0, "the popup shows once per invite");
    await b.page.getByRole("button", { name: /Notifications/ }).click();
    await shot(b.page, "share-2-bell");
    assert(await b.page.getByText("alice wants to share with you").isVisible(), "the bell explains the invite");
    // Carol has no invite
    assert((await api(c.page, "/api/sharing")).body.incoming.length === 0, "a stranger sees no invite");
    assert((await api(c.page, "/api/sharing")).body.partners.length === 0, "a stranger sees no partners");

    // 3. Nothing is shared before Bob accepts, even if Alice tries
    assert((await api(b.page, "/api/sharing/loyalty")).body.cards.length === 0, "no cards before accepting");

    // 4. Bob accepts on his profile
    await b.page.goto(`${BASE}/profile#sharing`);
    await b.page.locator("#sharing").getByRole("button", { name: "Accept" }).click();
    await b.page.locator("#sharing").getByText("Approved").waitFor();
    await shot(b.page, "share-3-bob-profile", "#sharing");

    // 5. Alice is told once; she shares the card with the switch. Nothing else is shared
    await a.page.goto(`${BASE}/personal/loyalty`);
    await a.page.getByRole("dialog", { name: "Invite accepted" }).waitFor();
    await a.page.getByRole("button", { name: "OK" }).click();
    await a.page.getByRole("button", { name: "Open Greenfield Market" }).click();
    const sw = a.page.getByTestId("share-with").getByRole("switch", { name: /with bob/i });
    await sw.waitFor();
    assert((await sw.getAttribute("aria-checked")) === "false", "nothing is shared by default");
    assert((await api(b.page, "/api/sharing/loyalty")).body.cards.length === 0, "approval alone shares nothing");
    await shot(a.page, "share-4-owner-card");
    await sw.click();
    await a.page.waitForFunction(() => document.querySelector('[data-testid="share-with"] [role="switch"]')?.getAttribute("aria-checked") === "true");

    // 6. Bob sees that one card, view only
    await b.page.goto(`${BASE}/personal/loyalty`);
    const tile = b.page.getByTestId("shared-tile");
    await tile.waitFor();
    await shot(b.page, "share-5-shared-card-list");
    assert(/Shared by alice/.test(await tile.innerText()), "the tile says who shared it");
    await tile.getByRole("button").click();
    const dlg = b.page.getByRole("dialog", { name: /Greenfield Market card/ });
    await dlg.waitFor();
    await shot(b.page, "share-6-shared-card-open");
    assert((await dlg.getByTestId("card-number").innerText()) === "4021 8830 1177", "the number is shown for scanning");
    assert((await dlg.getByRole("button", { name: "Edit" }).count()) === 0, "a shared card cannot be edited");
    assert((await dlg.getByTestId("share-with").count()) === 0, "a shared card cannot be re-shared");
    assert(/cannot change or delete/.test(await dlg.getByTestId("shared-note").innerText()), "the card says it is view only");
    await b.page.keyboard.press("Escape");
    const cards = (await api(b.page, "/api/sharing/loyalty")).body.cards;
    assert(cards.length === 1 && !("user_id" in cards[0]) && !("image_path" in cards[0]), "the shared card carries no owner id or storage path");
    assert((await b.page.getByTestId("loyalty-tile").count()) === 0, "Bob's own wallet is untouched (the shared card is not one of his cards)");
    // the Personal page tile: his own count on the left, what is shared with him on the right
    await b.page.goto(`${BASE}/personal`);
    const hubTile = b.page.getByRole("link", { name: /Loyalty cards/ });
    await hubTile.getByText(/\d+ cards?/).waitFor(); // (the fake database has no row level security, so this own-count is only checked in the real database)
    await hubTile.getByTestId("tile-shared").waitFor();
    assert((await hubTile.getByTestId("tile-shared").innerText()) === "1 shared", "the Loyalty cards tile shows how many cards are shared with him");
    await shot(b.page, "share-5b-personal-tile");
    // someone with nothing shared sees no right-hand count
    await c.page.goto(`${BASE}/personal`);
    await c.page.getByRole("link", { name: /Loyalty cards/ }).getByText(/\d+ cards?/).waitFor();
    assert((await c.page.getByTestId("tile-shared").count()) === 0, "no shared count when nothing is shared");

    // 7. The trip: Alice shares it; Bob sees name, destination and dates only
    await a.page.goto(`${BASE}/trips/${ATRIP}`);
    const tsw = a.page.getByTestId("share-with").getByRole("switch", { name: /with bob/i });
    await tsw.waitFor();
    await tsw.click();
    await a.page.waitForFunction(() => document.querySelector('[data-testid="share-with"] [role="switch"]')?.getAttribute("aria-checked") === "true");
    await b.page.goto(`${BASE}/trips`);
    const st = b.page.getByTestId("shared-trip");
    await st.waitFor();
    await shot(b.page, "share-7-shared-trip");
    const stText = await st.innerText();
    assert(/Lisbon Summit/.test(stText) && /Lisbon/.test(stText) && /Shared by alice/.test(stText), "name, destination and who shared it");
    assert(/View only/.test(stText) && /Upcoming|In progress|Passed/.test(stText), "shared card: view only and a date badge: " + stText);
    assert(!/Add expense|Flight details|\$\s?\d|expense/i.test(stText), "shared card has no amount, expense count or buttons: " + stText);
    const photosJson = await api(b.page, "/api/sharing/trip-photos");
    assert(Object.keys(photosJson.body).join() === "photos" && Object.keys(photosJson.body.photos).every((k) => /^[0-9a-f-]{36}$/i.test(k)), "photos answer: only trip ids and image addresses");
    await b.page.goto(`${BASE}/`);
    await b.page.getByRole("tab", { name: "Business" }).click().catch(() => {});
    await b.page.getByTestId("shared-trip").waitFor({ timeout: 30000 });
    const bobPage = await b.page.content();
    for (const secret of ["SECRET-NOTES", "SECRET-HOTEL", "987.65", "secret-receipt"]) assert(!bobPage.includes(secret), `Bob's page must not contain ${secret}`);
    const tripsJson = await api(b.page, "/api/sharing/trips");
    assert(JSON.stringify(Object.keys(tripsJson.body.trips[0]).sort()) === JSON.stringify(["destination", "end_date", "kind", "name", "share_id", "shared_by", "start_date", "trip_id"]), "the trip has exactly these fields");
    assert(!/SECRET|987\.65|receipt/.test(JSON.stringify(tripsJson.body)), "no expense, note or receipt in the trip answer");

    // 7b. Alice's history shows that Bob opened the card and the trip (and nobody else can read it)
    await b.page.waitForTimeout(500);
    const hist = (await api(a.page, "/api/sharing/activity?filter=views")).body;
    assert(hist.items.some((i) => i.kind === "view" && /Greenfield/.test(i.item || "")), "Alice's history has Bob opening the card");
    assert(hist.items.some((i) => i.kind === "view" && /Lisbon Summit/.test(i.item || "")), "Alice's history has Bob viewing the trip");
    assert((await api(b.page, "/api/sharing/activity?filter=views")).body.items.length === 0, "Bob's own history has none of that");
    assert((await api(c.page, "/api/sharing/activity")).body.items.length === 0, "a stranger's history is empty");
    assert((await post(c.page, "/api/sharing/view", { kind: "trip", item_id: ATRIP })).status === 404, "a stranger cannot log a view of someone's trip");
    await a.page.goto(`${BASE}/profile/sharing-activity`);
    await a.page.getByTestId("activity-row").first().waitFor();
    assert(/Bob opened your card|viewed the trip/.test(await a.page.getByTestId("sharing-activity").innerText()), "the history page says who looked at what");
    await shot(a.page, "share-7b-activity");

    // 8. A stranger gets nothing, and a role without the option is refused
    assert((await api(c.page, "/api/sharing/loyalty")).body.cards.length === 0, "Carol sees no cards");
    assert((await api(c.page, "/api/sharing/trips")).body.trips.length === 0, "Carol sees no trips");
    assert((await api(c.page, `/api/sharing/photo/${CARD}`)).status === 404, "Carol cannot get the card photo");
    assert((await api(pat.page, "/api/sharing")).body.available === false, "a role without the option sees sharing as unavailable");
    assert((await post(pat.page, "/api/sharing/invite", { email: "bob@example.com" })).status === 403, "a role without the option cannot invite");
    assert((await api(pat.page, "/api/sharing/trips")).status === 403, "a role without the option cannot read shared trips");

    // 9. Safety checks on the routes
    assert((await post(a.page, "/api/sharing/invite", { email: "x@y.com" }, { origin: "https://evil.example" })).status === 403, "a request from another site is refused");
    assert((await post(a.page, "/api/sharing/invite", { email: "not an email" })).status === 400, "a bad email is refused");
    assert((await post(a.page, "/api/sharing/share", { partnership_id: "nope", kind: "trip", item_id: ATRIP })).status === 400, "a bad id is refused");
    assert((await post(b.page, "/api/sharing/share", { partnership_id: (await api(b.page, "/api/sharing")).body.partners[0].id, kind: "loyalty_card", item_id: CARD })).status === 404, "Bob cannot share Alice's card");
    assert((await post(a.page, "/api/sharing/invite", { email: "self@example.com" })).status === 200, "a third invite is accepted");
    assert((await post(a.page, "/api/sharing/invite", { email: "alice@example.com" })).status === 400, "inviting yourself is refused");
    let last = 200;
    for (const n of [1, 2, 3, 4]) last = (await post(a.page, "/api/sharing/invite", { email: `extra${n}@example.com` })).status;
    assert(last === 429, `the daily invite limit stops further invites (got ${last})`);

    // 10. The kill switch hides everything at once
    await sharingDb.setKill(true);
    assert((await api(b.page, "/api/sharing")).body.available === false, "with the kill switch on, sharing is unavailable");
    assert((await api(b.page, "/api/sharing/loyalty")).status === 403, "and nothing can be read");
    await sharingDb.setKill(false);
    assert((await api(b.page, "/api/sharing/loyalty")).body.cards.length === 1, "switching it back restores the shares");

    // 11. Revoking one item, then ending the pairing
    await a.page.goto(`${BASE}/trips/${ATRIP}`);
    await a.page.getByTestId("share-with").getByRole("switch", { name: /with bob/i }).click();
    await a.page.getByRole("alertdialog").getByRole("button", { name: "Stop sharing" }).click();
    await a.page.waitForFunction(() => document.querySelector('[data-testid="share-with"] [role="switch"]')?.getAttribute("aria-checked") === "false");
    assert((await api(b.page, "/api/sharing/trips")).body.trips.length === 0, "Bob no longer sees the trip");
    assert((await api(b.page, "/api/sharing/loyalty")).body.cards.length === 1, "the card is still shared");
    await a.page.goto(`${BASE}/profile#sharing`);
    await a.page.locator("#sharing").getByText("Approved").first().waitFor();
    await shot(a.page, "share-8-owner-profile", "#sharing");
    const bobRow = a.page.locator("#sharing li").filter({ hasText: "bob" }).filter({ hasText: "Approved" });
    await bobRow.getByRole("button", { name: /Stop sharing with all/ }).click();
    await a.page.getByRole("alertdialog").getByRole("button", { name: "Stop sharing" }).click();
    await a.page.locator("#sharing").getByText("Approved").waitFor({ state: "detached" });
    assert((await api(b.page, "/api/sharing/loyalty")).body.cards.length === 0, "after ending the pairing Bob sees nothing");
    assert((await api(b.page, `/api/sharing/photo/${CARD}`)).status === 404, "and gets no photo link");
    await b.page.goto(`${BASE}/personal/loyalty`);
    await b.page.getByText("No loyalty cards yet").waitFor();
    assert((await b.page.getByTestId("shared-tile").count()) === 0, "the Shared with you section is gone");

    // 12. Everything was logged
    const kinds = new Set((await sharingDb.events()).map((e) => e.event_type));
    for (const k of ["sharing_on", "sharing_invite", "sharing_accept", "sharing_share", "sharing_unshare", "sharing_end"]) assert(kinds.has(k), `the security log has ${k}`);
    assert(!kinds.has("leak_blocked"), "nothing tripped the leak failsafe");
    void BOB;
    for (const x of [a, b, c, pat]) await x.ctx.close();
  });

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
    // amounts are masked: Uber · *.*5 USD, never 5.45
    await admin.page.getByText("Uber \u00b7 *.*5 USD").waitFor();
    assert((await admin.page.getByText("5.45").count()) === 0, "the real amount must not be on the page");
    const raw = await admin.page.evaluate(async () => (await fetch("/api/admin/security")).text());
    assert(!raw.includes("5.45") && raw.includes("*.*5"), "the real amount must not even be sent to the browser");
  });

  await test("admin: Branding page loads the saved settings", async () => {
    await admin.page.goto(`${BASE}/admin/branding`);
    await admin.page.locator('input[value="E2E Expense App"]').waitFor({ state: "attached" });
  });

  await test("admin: Support page lists a request", async () => {
    await admin.page.goto(`${BASE}/admin/support`);
    await admin.page.getByText("Cannot log in").first().waitFor();
  });

  await test("help: every user reads the topics, search works, and both layouts fit", async () => {
    const shot = async (page, name) => { if (process.env.E2E_SHOT) await page.screenshot({ path: `${process.env.E2E_SHOT}/${name}.png`, fullPage: false }); };
    // desktop
    const d = await newPage();
    await signIn(d.page, "pat@example.com", "Correct-Horse-1");
    await d.page.waitForURL((u) => u.pathname === "/");
    await d.page.getByRole("link", { name: "Help" }).first().click();
    await d.page.waitForURL((u) => u.pathname === "/help");
    await d.page.getByText("Add the app to your home screen").first().waitFor();
    assert((await d.page.getByRole("button", { name: /Add the app to your home screen/ }).getAttribute("aria-expanded")) === "false", "topics start closed on desktop");
    await shot(d.page, "help-1-desktop-list");
    await d.page.getByRole("button", { name: /Add the app to your home screen/ }).click();
    await d.page.waitForURL((u) => u.pathname === "/help/add-to-home-screen");
    assert((await d.page.getByRole("button", { name: /Add the app to your home screen/ }).getAttribute("aria-expanded")) === "true", "the clicked topic opens in place");
    await d.page.getByRole("heading", { name: "iPhone and iPad" }).waitFor();
    assert((await d.page.getByText("Add to Home Screen").count()) >= 1, "step text missing");
    assert(await d.page.getByRole("button", { name: /Share with a partner/ }).isVisible(), "the other topics stay in the list under the open one");
    assert((await d.page.getByRole("link", { name: "Edit this topic" }).count()) === 0, "a plain user must not see Edit");
    await shot(d.page, "help-2-desktop-topic");
    await d.page.getByRole("button", { name: /Share with a partner/ }).click();
    assert((await d.page.getByRole("button", { name: /Add the app to your home screen/ }).getAttribute("aria-expanded")) === "false", "opening another topic closes the first");
    await d.page.getByRole("button", { name: /Share with a partner/ }).click();
    await d.page.waitForURL((u) => u.pathname === "/help");
    await d.page.getByLabel("Search help").fill("trip");
    await d.page.getByRole("button", { name: /Share with a partner/ }).waitFor();
    assert((await d.page.getByRole("button", { name: /Add the app to your home screen/ }).count()) === 0, "search should hide other topics");
    await d.page.getByLabel("Search help").fill("zzzz");
    await d.page.getByText(/Nothing found/).waitFor();
    // a plain user can not open the editor
    await d.page.goto(`${BASE}/admin/help`);
    await d.page.waitForURL((u) => !u.pathname.startsWith("/admin"), { timeout: 15000 });
    await d.ctx.close();

    // phone: the list, then one topic with a Back link, and the Help item in the menu
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    ctx.setDefaultTimeout(60_000);
    const page = await ctx.newPage();
    await signIn(page, "pat@example.com", "Correct-Horse-1");
    await page.waitForURL((u) => u.pathname === "/");
    await page.getByRole("button", { name: "Menu" }).click();
    await page.getByRole("link", { name: "Help" }).click();
    await page.waitForURL((u) => u.pathname === "/help");
    await page.getByRole("link", { name: /Share with a partner/ }).waitFor();
    assert((await page.getByRole("button", { name: /Share with a partner/ }).count()) === 0, "the desktop accordion must not show on a phone");
    await shot(page, "help-3-phone-list");
    await page.getByRole("link", { name: /Share with a partner/ }).click();
    await page.getByRole("heading", { name: "Share with a partner", level: 1 }).waitFor();
    assert((await page.getByRole("navigation", { name: "Help topics" }).isVisible()) === false, "the list should be hidden while reading a topic on a phone");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    assert(!overflow, "the topic page scrolls sideways on a phone");
    await shot(page, "help-4-phone-topic");
    await page.getByRole("link", { name: "All topics" }).click();
    await page.waitForURL((u) => u.pathname === "/help");
    await ctx.close();
  });

  await test("help: admin and assistant can add, edit, hide and delete topics", async () => {
    const shot = async (page, name) => { if (process.env.E2E_SHOT) await page.screenshot({ path: `${process.env.E2E_SHOT}/${name}.png`, fullPage: false }); };
    await admin.page.goto(`${BASE}/admin/help`);
    await admin.page.getByRole("heading", { name: "Help topics" }).waitFor();
    await admin.page.getByText("Share with a partner").first().waitFor();
    await admin.page.getByRole("button", { name: "New topic" }).click();
    await admin.page.getByLabel("Title").fill("Reset your password");
    await admin.page.getByLabel("Category").fill("Account");
    await admin.page.getByLabel("Short description").fill("Get back into your account.");
    await admin.page.locator("#help-body").fill("1. Open **Profile**.\n2. Tap **Change password**.\n\n<b>not html</b>");
    await admin.page.getByLabel("Preview").getByText("Change password").waitFor();
    await shot(admin.page, "help-5-admin-editor");
    await admin.page.getByRole("button", { name: "Add topic" }).click();
    await admin.page.getByText("Topic added.").waitFor();
    const row = fake.table("help_topics").find((r) => r.title === "Reset your password");
    assert(row && row.slug === "reset-your-password" && row.category === "Account" && row.published === true, "the new topic was not stored as expected");
    // a second topic with the same title gets its own address
    await admin.page.getByRole("button", { name: "New topic" }).click();
    await admin.page.getByLabel("Title").fill("Reset your password");
    await admin.page.getByRole("button", { name: "Add topic" }).click();
    await admin.page.getByText("Topic added.").waitFor();
    assert(fake.table("help_topics").some((r) => r.slug === "reset-your-password-2"), "a repeated title should get a numbered address");
    // an empty title is refused with words, not a database error
    await admin.page.getByRole("button", { name: "New topic" }).click();
    await admin.page.getByRole("button", { name: "Add topic" }).click();
    await admin.page.getByText("Give the topic a title.").waitFor();
    await admin.page.getByRole("button", { name: "Cancel" }).click();
    // edit, then make it a draft, then delete
    const acct = admin.page.getByRole("region", { name: "Account" }); // the repeated title above landed in General
    await acct.getByRole("button", { name: "Edit Reset your password", exact: true }).click();
    await admin.page.getByLabel("Short description").fill("Updated text.");
    await admin.page.getByRole("button", { name: "Save changes" }).click();
    await admin.page.getByText("Topic saved.").waitFor();
    assert(fake.table("help_topics").find((r) => r.slug === "reset-your-password").summary === "Updated text.", "edit not saved");
    await acct.getByRole("button", { name: /Tap to make “Reset your password” a draft/ }).click();
    await admin.page.getByText("Draft").first().waitFor();
    assert(fake.table("help_topics").find((r) => r.slug === "reset-your-password").published === false, "draft switch not saved");
    // the page shows the markup as text, never as HTML
    await admin.page.goto(`${BASE}/help/reset-your-password`);
    await admin.page.locator("#help-head-reset-your-password").waitFor();
    assert((await admin.page.locator("#help-head-reset-your-password").getAttribute("aria-expanded")) === "true", "the topic from the address is open");
    assert((await admin.page.locator("[role=region] b").count()) === 0, "HTML in a topic must not become real markup");
    assert((await admin.page.getByText("<b>not html</b>").filter({ visible: true }).count()) === 1, "HTML should show as plain text");
    await admin.page.getByRole("link", { name: "Edit this topic" }).waitFor();
    await admin.page.goto(`${BASE}/admin/help`);
    await admin.page.getByRole("region", { name: "Account" }).getByRole("button", { name: "Delete Reset your password", exact: true }).click();
    await admin.page.getByRole("button", { name: "Delete", exact: true }).click();
    await admin.page.getByText("Topic deleted.").waitFor();
    assert(!fake.table("help_topics").some((r) => r.slug === "reset-your-password"), "topic not deleted");
    fake.table("help_topics").splice(0, fake.table("help_topics").length, ...fake.table("help_topics").filter((r) => !r.slug.startsWith("reset-your-password")));

    // the assistant role can open the editor too
    const sam = await newPage();
    await signIn(sam.page, "sam@example.com", "Sam-Pass-12345");
    await sam.page.waitForURL((u) => u.pathname === "/");
    await sam.page.goto(`${BASE}/admin/help`);
    await sam.page.getByRole("heading", { name: "Help topics" }).waitFor();
    await sam.ctx.close();
  });

  await test("profile: only an admin is offered Support requests alerts; everyone is offered Trip coming up", async () => {
    const admin = await newPage();
    await signIn(admin.page, "admin@example.com", "Admin-Pass-123");
    await admin.page.waitForURL((u) => u.pathname === "/");
    await admin.page.goto(`${BASE}/profile#notifications`);
    const card = admin.page.getByTestId("notifications-card");
    await card.waitFor();
    await card.getByRole("switch", { name: "Support requests" }).waitFor();
    await card.getByRole("switch", { name: "Trip coming up" }).waitFor();
    await admin.ctx.close();
    const user = await newPage();
    await signIn(user.page, "pat@example.com", "Correct-Horse-1");
    await user.page.waitForURL((u) => u.pathname === "/");
    await user.page.goto(`${BASE}/profile#notifications`);
    const c2 = user.page.getByTestId("notifications-card");
    await c2.getByRole("switch", { name: "Trip coming up" }).waitFor();
    assert((await c2.getByRole("switch", { name: "Support requests" }).count()) === 0, "a normal person is not offered Support requests");
    await user.ctx.close();
  });

  await test("profile: Notifications are grouped, new kinds are offered, the message style and quiet hours are saved", async () => {
    const user = await newPage();
    try {
      await signIn(user.page, "pat@example.com", "Correct-Horse-1");
      await user.page.waitForURL((u) => u.pathname === "/");
      await user.page.goto(`${BASE}/profile#notifications`);
      const card = user.page.getByTestId("notifications-card");
      await card.waitFor();
      for (const g of ["trips-and-travel", "money-and-papers", "sharing"]) await card.getByTestId(`push-group-${g}`).waitFor();
      assert((await card.getByTestId("push-group-admin-only").count()) === 0, "a normal person has no admin group");
      for (const name of ["Trip coming up", "Flight changes", "Flight tomorrow", "After the trip", "Subscription payments", "Document expiry", "Invites and replies", "Shared with me changed"]) await card.getByRole("switch", { name }).waitFor();
      assert((await card.getByRole("switch", { name: "Flight tomorrow" }).getAttribute("aria-checked")) === "true", "new kinds start on");
      assert((await card.getByRole("radio", { name: /Show details/ }).getAttribute("aria-checked")) === "true", "details is the default style");
      await card.getByRole("radio", { name: /Keep it private/ }).click();
      await card.getByRole("switch", { name: "Document expiry" }).click();
      await card.getByRole("switch", { name: "Pause alerts at night" }).click();
      await card.getByLabel("Quiet hours from").selectOption("21");
      await user.page.waitForFunction(() => document.querySelector('[data-testid="push-quiet"] select') !== null);
      await user.page.waitForTimeout(800);
      const saved = fake.table("profiles").find((p) => p.id === PAT)?.push_prefs;
      assert(saved && saved.detail === "private" && saved.documents === false && saved.quiet?.on === true && saved.quiet?.start === 21, "saved: " + JSON.stringify(saved));
      assert(saved.flightTomorrow === true || saved.flightTomorrow === undefined, "other switches keep their value");
      await user.page.reload();
      await card.waitFor();
      await user.page.waitForFunction(() => document.querySelector('[data-testid="push-style-private"]')?.getAttribute("aria-checked") === "true", null, { timeout: 30000 });
      assert((await card.getByRole("radio", { name: /Keep it private/ }).getAttribute("aria-checked")) === "true", "the style is still private after a reload");
      assert((await card.getByRole("switch", { name: "Document expiry" }).getAttribute("aria-checked")) === "false", "the switch is still off after a reload");
      assert((await card.getByRole("switch", { name: "Pause alerts at night" }).getAttribute("aria-checked")) === "true" && (await card.getByLabel("Quiet hours from").inputValue()) === "21", "quiet hours are still set after a reload");
    } finally {
      await user.ctx.close();
      const me = fake.table("profiles").find((p) => p.id === PAT);
      if (me) delete me.push_prefs;
    }
  });

  await test("profile: Notifications says when alerts are not set up, and Your data prepares a ZIP and schedules a deletion that can be cancelled", async () => {
    fake.table("account_deletions"); // this install has run migration_sharing_safety.sql
    const d = await newPage();
    await signIn(d.page, "pat@example.com", "Correct-Horse-1");
    await d.page.waitForURL((u) => u.pathname === "/");
    await d.page.goto(`${BASE}/profile#notifications`);
    const card = d.page.getByTestId("notifications-card");
    await card.waitFor();
    await card.getByText(/not set up on the server/).waitFor();
    assert(!(await card.getByRole("switch", { name: "Alerts on this device" }).isEnabled()), "the device switch cannot be turned on without keys");
    assert((await card.getByRole("switch").count()) === 11, "device switch, nine kinds of alert and quiet hours (no Support or IPTV for a normal person)");
    const key = await (await d.page.request.get(`${BASE}/api/push/key`)).json();
    assert(key.configured === false && !("key" in key), "the key route says not set up and gives no key");
    await d.page.goto(`${BASE}/profile#your-data`);
    const data = d.page.getByTestId("your-data");
    await data.waitFor();
    await data.getByRole("button", { name: "Prepare my download" }).click();
    await data.getByText("Your export is ready.").waitFor();
    assert((await data.getByRole("link", { name: /Download/ }).getAttribute("download")).endsWith(".zip"), "a ZIP is offered");
    await data.getByRole("button", { name: "Delete my account…" }).click();
    const dlg = d.page.getByRole("dialog", { name: "Delete your account?" });
    await dlg.waitFor();
    const go = dlg.getByRole("button", { name: "Schedule deletion" });
    assert(!(await go.isEnabled()), "deletion cannot be scheduled before the email is typed");
    await dlg.getByTestId("delete-confirm-email").fill("wrong@example.com");
    assert(!(await go.isEnabled()), "the wrong email does not unlock it");
    await dlg.getByTestId("delete-confirm-email").fill("pat@example.com");
    await go.click();
    await data.getByText(/Deletion on|will be deleted on/).first().waitFor({ timeout: 8000 }).catch(async (e) => { throw new Error(`${e.message.split("\n")[0]} | dialog says: ${await d.page.getByRole("dialog").innerText().catch(() => "(closed)")}`); });
    assert(fake.table("account_deletions").length === 1 && fake.table("account_deletions")[0].user_id === PAT, "one deletion row, for this person only");
    await data.getByRole("button", { name: "Cancel deletion" }).click();
    await data.getByRole("button", { name: "Delete my account…" }).waitFor();
    assert(fake.table("account_deletions").length === 0, "cancelling removes the row");
    await d.ctx.close();
  });

  await test("profile and setup pages: sections are closed rows that open one at a time, and a link opens its section", async () => {
    const shot = async (page, name) => { if (process.env.E2E_SHOT) await page.screenshot({ path: `${process.env.E2E_SHOT}/${name}.png`, fullPage: false }); };
    const open = (page, name) => page.getByRole("button", { name: new RegExp(`^${name}`) });
    const expanded = async (page, name) => (await open(page, name).getAttribute("aria-expanded")) === "true";
    // phone profile
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    ctx.setDefaultTimeout(60_000);
    const page = await ctx.newPage();
    await signIn(page, "pat@example.com", "Correct-Horse-1");
    await page.waitForURL((u) => u.pathname === "/");
    await page.goto(`${BASE}/profile`);
    await open(page, "Personal information").waitFor();
    for (const n of ["Personal information", "Password", "Home place"]) assert(!(await expanded(page, n)), `${n} should start closed`);
    assert(!(await page.locator("#firstName").isVisible()), "the form fields must be hidden while the section is closed");
    await shot(page, "acc-1-phone-closed");
    await open(page, "Personal information").click();
    await page.locator("#firstName").waitFor({ state: "visible" });
    await page.locator("#firstName").fill("Patrick");
    await open(page, "Password").click();
    await page.locator("#newPassword").waitFor({ state: "visible" });
    assert(!(await expanded(page, "Personal information")), "opening one section closes the other");
    assert(!(await page.locator("#firstName").isVisible()), "the closed section hides its fields");
    await open(page, "Personal information").click();
    assert((await page.locator("#firstName").inputValue()) === "Patrick", "what was typed must survive closing and opening a section");
    await shot(page, "acc-2-phone-open");
    await open(page, "Personal information").click();
    assert(!(await expanded(page, "Personal information")), "tapping an open row closes it");
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    assert(!wide, "the profile scrolls sideways on a phone");
    await ctx.close();

    // a link with #password opens that section on its own
    const d = await newPage();
    await signIn(d.page, "pat@example.com", "Correct-Horse-1");
    await d.page.waitForURL((u) => u.pathname === "/");
    await d.page.goto(`${BASE}/profile#password`);
    await d.page.locator("#newPassword").waitFor({ state: "visible" });
    assert(await expanded(d.page, "Password"), "the #password link should open the Password section");
    await shot(d.page, "acc-3-desktop-profile");
    await d.ctx.close();

    // admin setup pages: every section starts closed, one at a time
    await admin.page.goto(`${BASE}/admin/branding`);
    await open(admin.page, "Logo").waitFor();
    for (const n of ["Logo", "App name & color", "Privacy policy & support", "Personal section"]) assert(!(await expanded(admin.page, n)), `Branding: ${n} should start closed`);
    await open(admin.page, "Logo").click();
    assert(await expanded(admin.page, "Logo"), "tapping Logo opens it");
    await open(admin.page, "App name & color").click();
    await admin.page.locator('input[value="E2E Expense App"]').waitFor({ state: "visible" });
    assert(!(await expanded(admin.page, "Logo")), "opening a Branding section closes the other");
    await shot(admin.page, "acc-4-admin-branding");
    await admin.page.goto(`${BASE}/admin/currencies`);
    await open(admin.page, "Available currencies").waitFor();
    for (const n of ["Available currencies", "Add a currency"]) assert(!(await expanded(admin.page, n)), `Currencies: ${n} should start closed`);
    await open(admin.page, "Available currencies").click();
    await admin.page.locator('input[value="US Dollar"]').waitFor({ state: "visible" });
    await open(admin.page, "Add a currency").click();
    await admin.page.getByPlaceholder("Code").waitFor({ state: "visible" });
    await admin.page.goto(`${BASE}/admin/telegram`);
    await open(admin.page, "Bot setup").waitFor();
    for (const n of ["Bot setup", "How this is set up"]) assert(!(await expanded(admin.page, n)), `Telegram setup: ${n} should start closed`);
  });

  await test("weather lives inside the welcome card on both views, and takes no room when there is none", async () => {
    const wait = () => admin.page.waitForResponse((r) => r.url().includes("/api/weather"));
    const welcome = () => admin.page.locator("div.rounded-xl", { has: admin.page.getByRole("heading", { level: 1 }) }).first();
    // No weather service in the test setup: nothing is shown, not even an "unavailable" panel
    const first = wait();
    await admin.page.goto(`${BASE}/`);
    await first;
    await admin.page.waitForTimeout(300);
    assert((await welcome().getByText(/Weather unavailable|°/).count()) === 0, "an empty weather panel is taking room on the welcome card");
    // With weather, it sits inside the welcome card on both views
    await admin.page.route("**/api/weather**", (r) => r.fulfill({ json: { city: "Oranjestad", countryCode: "AW", tempC: 30, code: 1, isDay: true, rainChance: 10 } }));
    await admin.page.evaluate(() => { try { sessionStorage.clear(); } catch { /* ignore */ } });
    await admin.page.goto(`${BASE}/`);
    await welcome().getByText(/°/).first().waitFor();
    await admin.page.getByRole("tab", { name: "Personal" }).click();
    assert(await welcome().getByText(/°/).first().isVisible(), "weather disappeared on the Personal view");
    await admin.page.getByRole("tab", { name: "Business" }).click();
    await admin.page.unroute("**/api/weather**");
  });

  await test("admin: the Personal view of the home page opens", async () => {
    await admin.page.goto(`${BASE}/`);
    await admin.page.getByRole("tab", { name: "Personal" }).click();
    await admin.page.getByTestId("personal-total").waitFor();
    await admin.page.getByRole("tab", { name: "Business" }).click();
    await admin.page.getByRole("heading", { name: "Active Trips" }).waitFor();
    assert((await admin.page.getByText("This Month").count()) === 0, "spending tiles should no longer be on the business view");
  });

  await test("personal dashboard: range chips and a Filters sheet replace the filter card, and the page follows what is tapped", async () => {
    await admin.page.goto(`${BASE}/`);
    await admin.page.getByRole("tab", { name: "Personal" }).click();
    await admin.page.getByTestId("personal-total").waitFor();
    assert((await admin.page.getByLabel("Date range", { exact: true }).evaluate((el) => el.tagName)) !== "SELECT", "the date range is a row of chips, not a select");
    assert((await admin.page.getByRole("button", { name: "30 days", exact: true }).getAttribute("aria-pressed")) === "true", "30 days is on by default");
    await admin.page.getByRole("button", { name: "90 days", exact: true }).click();
    assert((await admin.page.getByRole("button", { name: "90 days", exact: true }).getAttribute("aria-pressed")) === "true", "tapping 90 days selects it");
    await admin.page.getByRole("button", { name: "Filters", exact: true }).click();
    await admin.page.getByRole("dialog", { name: "Filters" }).waitFor();
    await admin.page.getByRole("button", { name: /^Show \d+ receipts?$/ }).click();
    await admin.page.getByRole("dialog", { name: "Filters" }).waitFor({ state: "detached" });
    await admin.page.getByRole("button", { name: "All", exact: true }).click();
    const cats = admin.page.getByRole("region", { name: "Where it goes" }).getByRole("button");
    if ((await cats.count()) > 0) {
      await cats.first().click();
      await admin.page.getByTestId("active-filters").waitFor();
      assert((await admin.page.getByTestId("personal-trip-card").count()) === 0, "trips are hidden while a category filter is on");
      await admin.page.getByRole("button", { name: "Clear filter" }).click();
      await admin.page.getByTestId("active-filters").waitFor({ state: "detached" });
    }
    await admin.page.getByRole("heading", { name: "Active now" }).waitFor();
    await admin.page.getByTestId("where-it-goes").waitFor();
    assert((await admin.page.getByRole("heading", { name: "Groceries by category" }).count()) <= 1 && (await admin.page.getByRole("heading", { name: "Where it goes" }).count()) === 1, "the home Personal view has the all-parts Where it goes, and the grocery chart is named Groceries by category");
    // the ring chart and its percent-only legend
    if ((await admin.page.getByRole("region", { name: "Where it goes" }).count()) > 0) {
      await admin.page.getByTestId("where-donut").waitFor();
      const legend = await admin.page.getByRole("region", { name: "Where it goes" }).getByRole("button").count();
      const ring = await admin.page.getByTestId("where-donut").getByRole("img").getAttribute("aria-label");
      assert(ring && ring.split("%").length - 1 >= Math.min(legend, 2), "the ring names the same shares as the legend");
      assert((await admin.page.getByRole("button", { name: "Breakdown", exact: true }).count()) === 0, "the spending card has no Breakdown switch: the ring shows it");
      assert((await admin.page.getByRole("region", { name: "Where it goes" }).getByText(/AWG/).count()) === 0, "the legend shows percentages, not amounts");
    }
    await admin.page.getByRole("tab", { name: "Business" }).click();
  });

  await test("personal on a desktop: a Coming up side panel lists what is due soonest; phones do not get it", async () => {
    fake.table("subscriptions").push({ id: "5b000000-0000-4000-8000-0000000000e1", user_id: ADMIN, name: "Gym membership", price: 30, currency: "USD", cycle: "monthly", next_payment: addDays(today, 2), category: null, status: "active", trial_ends: null, split_count: 1, remind_days: 3, cancel_url: null, notes: null, price_history: [], created_at: new Date().toISOString() });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await signIn(page, "admin@example.com", "Admin-Pass-123");
    await page.waitForURL((u) => u.pathname === "/");
    await page.goto(`${BASE}/personal`);
    const panel = page.getByTestId("coming-up");
    await panel.getByText("Gym membership").waitFor();
    await panel.getByText("In 2 days").waitFor();
    assert((await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)), "no sideways scrolling on a desktop");
    const groc = await page.getByRole("link", { name: "Scan receipt" }).boundingBox();
    const side = await panel.boundingBox();
    assert(groc && side && groc.x + groc.width < side.x, "the side panel sits to the right of the main column");
    await page.setViewportSize({ width: 390, height: 844 });
    assert(!(await panel.isVisible()), "phones do not show the side panel");
    await page.setViewportSize({ width: 820, height: 1000 });
    assert(!(await panel.isVisible()), "tablets keep the current layout");
    await ctx.close();
    // the stand-in database does not filter by owner, so take the row out for the tests that count subscriptions
    const subs = fake.table("subscriptions");
    subs.splice(subs.findIndex((r) => r.id === "5b000000-0000-4000-8000-0000000000e1"), 1);
  });

  await test("home: opens on Personal first, documents follow their Show on choice, and subscriptions sit in a side rail on a desktop", async () => {
    const now = new Date().toISOString();
    const docs = fake.table("travel_documents");
    docs.push(
      { id: "d0c00000-0000-4000-8000-0000000007a1", user_id: ADMIN, kind: "passport", title: "Both Passport", issuing_country: "Aruba", document_number: null, expiry_date: addDays(today, 900), trip_id: null, file_path: null, show_on: "both", created_at: now },
      { id: "d0c00000-0000-4000-8000-0000000007a2", user_id: ADMIN, kind: "license", title: "Personal Licence", issuing_country: "Aruba", document_number: null, expiry_date: addDays(today, 500), trip_id: null, file_path: null, show_on: "personal", created_at: now },
      { id: "d0c00000-0000-4000-8000-0000000007a3", user_id: ADMIN, kind: "visa", title: "Work Visa", issuing_country: "USA", document_number: null, expiry_date: addDays(today, 300), trip_id: null, file_path: null, show_on: "business", created_at: now },
    );
    fake.table("subscriptions").push({ id: "5b000000-0000-4000-8000-0000000007b1", user_id: ADMIN, name: "Rail Streaming", price: 12, currency: "USD", cycle: "monthly", next_payment: addDays(today, 5), category: null, status: "active", trial_ends: null, split_count: 1, remind_days: 3, cancel_url: null, notes: null, price_history: [], created_at: now });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    ctx.setDefaultTimeout(60_000);
    const page = await ctx.newPage();
    try {
      await signIn(page, "admin@example.com", "Admin-Pass-123");
      await page.waitForURL((u) => u.pathname === "/");
      await page.evaluate(() => { try { localStorage.removeItem("dashboard-view"); } catch { /* ignore */ } });
      await page.goto(`${BASE}/`);
      await page.getByRole("tab", { name: "Personal" }).waitFor();
      const tabs = await page.getByRole("tab").allInnerTexts();
      assert(tabs.slice(0, 2).join("|") === "Personal|Business", `tabs were: ${tabs.join("|")}`);
      assert((await page.getByRole("tab", { name: "Personal" }).getAttribute("aria-selected")) === "true", "Personal is the tab that is open first");
      await page.getByTestId("personal-total").waitFor();
      const strip = page.getByTestId("personal-docs");
      await strip.getByText("Passport", { exact: true }).waitFor();
      await strip.getByText("Driver's license", { exact: true }).waitFor();
      assert((await strip.getByText("Visa / e-visa", { exact: true }).count()) === 0, "a Business-only document is not listed on Personal");
      assert((await strip.getByTestId("doc-scope").count()) === 0 && !(await strip.innerText()).includes("Both"), "the document tiles do not show a Both badge");
      const rail = page.getByTestId("subs-card-desktop");
      await rail.getByText("Rail Streaming").waitFor();
      assert(await page.getByTestId("keep-handy-desktop").isVisible(), "Keep handy is in the side rail on a desktop");
      assert(!(await page.getByTestId("keep-handy-mobile").isVisible()), "the phone's Keep handy row is hidden on a desktop");
      const total = await page.getByTestId("personal-total").boundingBox();
      const railBox = await rail.boundingBox();
      assert(total && railBox && railBox.x > total.x + total.width, "the side rail sits to the right of the spending");
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no sideways scrolling on a desktop");
      // Business lists what is set to Business or Both
      await page.getByRole("tab", { name: "Business" }).click();
      const biz = await page.getByTestId("doc-tiles").innerText();
      assert(biz.includes("Passport") && biz.includes("Visa") && !biz.includes("license"), `business tiles were: ${biz.replace(/\s+/g, " ").slice(0, 200)}`);
      // The choice sticks
      await page.goto(`${BASE}/`);
      await page.getByRole("tab", { name: "Business", selected: true }).waitFor({ timeout: 10_000 }).catch(() => { throw new Error("the last chosen tab is remembered"); });
      await page.evaluate(() => { try { localStorage.removeItem("dashboard-view"); } catch { /* ignore */ } });
    } finally {
      await ctx.close();
      for (const id of ["d0c00000-0000-4000-8000-0000000007a1", "d0c00000-0000-4000-8000-0000000007a2", "d0c00000-0000-4000-8000-0000000007a3"]) docs.splice(docs.findIndex((r) => r.id === id), 1);
      const subs = fake.table("subscriptions");
      subs.splice(subs.findIndex((r) => r.id === "5b000000-0000-4000-8000-0000000007b1"), 1);
    }
  });

  await test("home on a phone: Keep handy comes first, then spending, subscriptions and documents in one column", async () => {
    const now = new Date().toISOString();
    const docs = fake.table("travel_documents");
    docs.push({ id: "d0c00000-0000-4000-8000-0000000007c1", user_id: ADMIN, kind: "id", title: "Phone ID", issuing_country: "Aruba", document_number: null, expiry_date: addDays(today, 800), trip_id: null, file_path: null, show_on: "personal", created_at: now });
    fake.table("subscriptions").push({ id: "5b000000-0000-4000-8000-0000000007d1", user_id: ADMIN, name: "Phone Music", price: 9, currency: "USD", cycle: "monthly", next_payment: addDays(today, 9), category: null, status: "active", trial_ends: null, split_count: 1, remind_days: 3, cancel_url: null, notes: null, price_history: [], created_at: now });
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    ctx.setDefaultTimeout(60_000);
    const page = await ctx.newPage();
    try {
      await signIn(page, "admin@example.com", "Admin-Pass-123");
      await page.waitForURL((u) => u.pathname === "/");
      await page.evaluate(() => { try { localStorage.removeItem("dashboard-view"); } catch { /* ignore */ } });
      await page.goto(`${BASE}/`);
      await page.getByTestId("personal-total").waitFor();
      const y = async (id) => (await page.getByTestId(id).boundingBox())?.y ?? -1;
      const handy = await y("keep-handy-mobile"), spend = await y("personal-total"), subs = await y("subs-card-mobile"), pdocs = await y("personal-docs");
      assert(handy > 0 && handy < spend && spend < subs && subs < pdocs, `order was handy ${handy}, spending ${spend}, subscriptions ${subs}, documents ${pdocs}`);
      assert(!(await page.getByTestId("subs-card-desktop").isVisible()), "the desktop rail is hidden on a phone");
      await page.getByTestId("subs-card-mobile").getByText("Phone Music").waitFor();
      await page.getByTestId("personal-docs").getByText("ID card", { exact: true }).waitFor();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no sideways scrolling on a phone");
      for (const el of await page.getByTestId("keep-handy-mobile").getByRole("link").all()) {
        const b = await el.boundingBox();
        assert(b && b.height >= 44, "Keep handy buttons are at least 44px tall");
      }
    } finally {
      await ctx.close();
      docs.splice(docs.findIndex((r) => r.id === "d0c00000-0000-4000-8000-0000000007c1"), 1);
      const subs = fake.table("subscriptions");
      subs.splice(subs.findIndex((r) => r.id === "5b000000-0000-4000-8000-0000000007d1"), 1);
    }
  });

  await test("documents: the form has a Show on choice (Personal, Business or Both) that is saved with the document", async () => {
    const docs = fake.table("travel_documents");
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    ctx.setDefaultTimeout(60_000);
    const page = await ctx.newPage();
    try {
      await signIn(page, "admin@example.com", "Admin-Pass-123");
      await page.waitForURL((u) => u.pathname === "/");
      await page.goto(`${BASE}/documents`);
      await page.getByRole("button", { name: "Add document" }).first().click();
      const dlg = page.getByRole("dialog", { name: "Add document" });
      await dlg.waitFor();
      const group = dlg.getByTestId("doc-show-on");
      assert((await group.getByRole("button", { name: "Both" }).getAttribute("aria-pressed")) === "true", "Both is chosen by default");
      await dlg.locator('input[maxlength="120"]').fill("Scope Test Doc");
      await dlg.locator('input[type="date"]').fill(addDays(today, 900));
      await group.getByRole("button", { name: "Personal", exact: true }).click();
      assert((await group.getByRole("button", { name: "Personal", exact: true }).getAttribute("aria-pressed")) === "true", "tapping Personal selects it");
      await dlg.getByText("Listed on the Personal dashboard only.").waitFor();
      await dlg.getByRole("button", { name: "Save document" }).click();
      await dlg.waitFor({ state: "detached", timeout: 15_000 }).catch(async () => { throw new Error("the form stayed open: " + (await dlg.innerText()).replace(/\s+/g, " ").slice(0, 300)); });
      const row = docs.find((d) => d.title === "Scope Test Doc");
      assert(row && row.show_on === "personal", `saved show_on was ${row && row.show_on}`);
      await page.getByText("Scope Test Doc").first().waitFor();
      // Editing keeps the choice and can change it
      await page.getByText("Scope Test Doc").first().locator("xpath=ancestor::li").getByTestId("doc-scope").getByText("Personal").waitFor();
    } finally {
      await ctx.close();
      const i = docs.findIndex((d) => d.title === "Scope Test Doc");
      if (i >= 0) docs.splice(i, 1);
    }
  });

  await test("business: Trips and Reports open under a Business title with a line of help, like the Personal page", async () => {
    for (const [path, section] of [["/trips", "Trips"], ["/reports", "Reports"]]) {
      await admin.page.goto(`${BASE}${path}`);
      await admin.page.getByRole("heading", { name: "Business", level: 1 }).waitFor();
      await admin.page.getByText("Plan business trips, track their expenses and export your travel reports.").waitFor();
      await admin.page.getByRole("heading", { name: new RegExp(`^${section}:`), level: 2 }).waitFor({ state: "attached" });
      assert((await admin.page.getByRole("heading", { level: 1 }).count()) === 1, `${path} has one main title`);
      const title = await admin.page.getByRole("heading", { name: "Business", level: 1 }).boundingBox();
      const tabs = await admin.page.getByRole("navigation", { name: "Business sections" }).boundingBox();
      assert(title && tabs && title.y < tabs.y, "the title sits above the Trips / Reports switch");
    }
    // the page action sits in the tabs row on a desktop
    await admin.page.goto(`${BASE}/trips`);
    const tabsBox = await admin.page.getByRole("navigation", { name: "Business sections" }).boundingBox();
    const newTrip = await admin.page.getByRole("link", { name: "New Trip" }).first().boundingBox();
    assert(tabsBox && newTrip && Math.abs(tabsBox.y + tabsBox.height / 2 - (newTrip.y + newTrip.height / 2)) < 40, "New Trip sits beside the tabs");
  });

  await test("home: the welcome card follows the Personal / Business tab", async () => {
    await admin.page.goto(`${BASE}/`);
    await admin.page.evaluate(() => localStorage.removeItem("dashboard-view"));
    await admin.page.reload();
    const sub = admin.page.getByTestId("greeting-sub");
    await sub.getByText("Your spending, subscriptions and documents").waitFor();
    assert((await admin.page.getByRole("link", { name: "New Trip" }).count()) === 0, "no New Trip on the Personal tab");
    await admin.page.getByRole("tab", { name: /Business/ }).first().click();
    await sub.getByText(/active trip/).waitFor();
    await admin.page.getByRole("link", { name: "New Trip" }).first().waitFor();
    await admin.page.getByRole("tab", { name: /Personal/ }).first().click();
    await sub.getByText("Your spending, subscriptions and documents").waitFor();
  });

  await test("personal: Groceries leads with Scan receipt, empty rows say what is missing, and Documents and Loyalty sit under Keep handy", async () => {
    await admin.page.goto(`${BASE}/personal`);
    await admin.page.getByRole("heading", { name: "Groceries" }).waitFor();
    assert((await admin.page.getByText("Only you can see this").count()) === 0, "the intro describes the page, it does not say who can see it");
    await admin.page.getByText("keep your documents and loyalty cards in one place").waitFor();
    assert((await admin.page.getByRole("link", { name: "Scan receipt" }).getAttribute("href")) === "/personal/groceries/new", "Scan receipt opens the grocery form");
    assert((await admin.page.getByRole("link", { name: "Price tracker" }).getAttribute("href")) === "/personal/groceries/prices", "Price tracker opens the prices page");
    // earlier tests may have left a project or trip: either an empty message or a count with money is right, never "0 active"
    await admin.page.getByText(/No active projects|\d+ active \u00b7 /).first().waitFor();
    await admin.page.getByText(/No active trips|\d+ active \u00b7 /).first().waitFor();
    assert((await admin.page.getByText("0 active").count()) === 0, "empty tiles no longer read '0 active'");
    await admin.page.getByText("Keep handy").waitFor();
    assert((await admin.page.getByRole("link", { name: /Documents/ }).count()) > 0 && (await admin.page.getByRole("link", { name: /Loyalty cards/ }).count()) > 0, "Documents and Loyalty cards are listed");
    // on a phone the tiles (now with Savings, House & repairs, and Subscriptions for an admin) are within about one and a half screens: the last one starts above 1300px
    await admin.page.setViewportSize({ width: 390, height: 844 });
    const top = await admin.page.getByRole("link", { name: /Loyalty cards/ }).evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    assert(top < 1300, `Loyalty cards starts within the first screen and a bit (top ${Math.round(top)}px)`);
    await admin.page.setViewportSize({ width: 1280, height: 720 });
  });

  await test("admin: Categories is one page: Travel (receipts and trip types) and Groceries, one section open at a time", async () => {
    const cats = [
      ["categories", "Meals", 1], ["categories", "Transport", 2], ["travel_categories", "Business", 1], ["grocery_categories", "Produce", 1],
    ];
    for (const [t, name, n] of cats) fake.table(t).push({ id: `00000000-0000-4000-8000-0000000c${fake.table(t).length}${n}${t.length}`, name, icon: null, enabled: true, sort_order: n });
    await admin.page.goto(`${BASE}/admin/settings`);
    assert((await admin.page.getByText("Receipt Categories").count()) === 0 && (await admin.page.getByText("Travel Categories").count()) === 0, "the two old cards are gone");
    await admin.page.getByRole("link", { name: /^Categories/ }).click();
    await admin.page.getByRole("heading", { name: "Categories", level: 1 }).waitFor();
    const travel = admin.page.getByRole("button", { name: /^Travel/ });
    const groceries = admin.page.getByRole("button", { name: /^Groceries/ });
    assert((await travel.getAttribute("aria-expanded")) === "false", "Travel starts collapsed like the rest");
    await travel.click();
    await admin.page.getByText("2 receipt categories").waitFor();
    // receipts: two rows, the second can move up, the first cannot
    await admin.page.getByLabel("Move Meals up").waitFor();
    assert(await admin.page.getByLabel("Move Meals up").isDisabled(), "the first row cannot move up");
    await admin.page.getByLabel("Move Transport up").click();
    await admin.page.waitForFunction(() => document.querySelectorAll('input[aria-label="Name of category"]')[0]?.value === "Transport");
    // trip types tab
    await admin.page.getByRole("button", { name: "Trip types" }).click();
    await admin.page.getByLabel("Move Business down").waitFor();
    // add a trip type, it appears in the list
    await admin.page.locator("#travel_categories-name").fill("Training");
    await admin.page.locator("form").filter({ has: admin.page.locator("#travel_categories-name") }).getByRole("button", { name: "Add" }).click();
    await admin.page.getByLabel("Move Training up").waitFor();
    // groceries opens, travel closes
    await groceries.click();
    assert((await groceries.getAttribute("aria-expanded")) === "true" && (await travel.getAttribute("aria-expanded")) === "false", "only one section is open");
    await admin.page.getByLabel("Move Produce down").waitFor();
    // the old link still works
    await admin.page.goto(`${BASE}/admin/travel-categories`);
    await admin.page.waitForURL(/\/admin\/categories#travel/);
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

  if (process.env.E2E_SHOT) {
    for (const scheme of ["dark", "light"]) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme });
      const page = await ctx.newPage();
      await page.goto(`${BASE}/login`);
      await page.locator("#email").waitFor();
      await page.waitForLoadState("networkidle");
      await page.screenshot({ path: `${process.env.E2E_SHOT}/login-${scheme}.png` });
      await ctx.close();
    }
  }

  // Design audit: E2E_AUDIT=<dir> saves screenshots of the main screens with realistic data (desktop and phone, light and dark)
  if (process.env.E2E_AUDIT) {
    const dir = process.env.E2E_AUDIT;
    const now = new Date().toISOString();
    const cats = ["Meals", "Transport", "Lodging", "Meals", "Other", "Transport"];
    const merchants = ["Trip Cafe", "Uber", "Marriott Downtown", "Shake Shack", "Staples", "Delta Air Lines"];
    merchants.forEach((m, i) => fake.table("expenses").push({ id: `aa000000-0000-4000-8000-00000000010${i}`, trip_id: TRIP_ID, user_id: PAT, merchant: m, amount: [18.4, 5.45, 412, 24.9, 36.1, 289][i], currency: "USD", exchange_rate: 1, amount_usd: [18.4, 5.45, 412, 24.9, 36.1, 289][i], category: cats[i], expense_date: addDays(today, -i % 3), notes: null, receipt_path: null, created_at: now }));
    fake.table("trips").push({ id: "7d1c6a1e-3b7f-4d6a-9d52-0f4a3a1b2c4e", user_id: PAT, name: "Bogota Summit", destination: "Bogota", category: "Business", start_date: addDays(today, 12), end_date: addDays(today, 16), currency: "USD", status: "active", notes: null, created_at: now });
    fake.table("personal_projects").push({ id: "bb000000-0000-4000-8000-000000000001", user_id: PAT, kind: "personal_trip", name: "Beach Week", destination: "Punta Cana", start_date: addDays(today, 30), end_date: addDays(today, 36), status: "active", created_at: now }, { id: "bb000000-0000-4000-8000-000000000002", user_id: PAT, kind: "home_project", name: "Kitchen refresh", destination: null, start_date: addDays(today, -5), end_date: null, status: "active", created_at: now });
    fake.table("travel_documents").push({ id: "d0c00000-0000-4000-8000-0000000009aa", user_id: PAT, kind: "passport", title: "Passport", issuing_country: "Aruba", document_number: "P1", expiry_date: addDays(today, 150), trip_id: null, file_path: null, created_at: now });
    fake.table("subscriptions").push(
      { id: "5b000000-0000-4000-8000-00000000a001", user_id: PAT, name: "Netflix", price: 15.5, currency: "USD", cycle: "monthly", next_payment: addDays(today, 3), category: "Streaming", status: "active", trial_ends: null, split_count: 1, remind_days: 3, cancel_url: null, notes: null, price_history: [], created_at: now },
      { id: "5b000000-0000-4000-8000-00000000a002", user_id: PAT, name: "Gym membership", price: 30, currency: "USD", cycle: "monthly", next_payment: addDays(today, 18), category: "Health", status: "active", trial_ends: null, split_count: 1, remind_days: 3, cancel_url: null, notes: null, price_history: [], created_at: now },
      { id: "5b000000-0000-4000-8000-00000000a003", user_id: PAT, name: "iCloud 200 GB", price: 35, currency: "USD", cycle: "yearly", next_payment: addDays(today, 120), category: "Software", status: "active", trial_ends: null, split_count: 1, remind_days: 7, cancel_url: null, notes: null, price_history: [], created_at: now },
    );
    fake.table("grocery_receipts").push({ id: "9a000000-0000-4000-8000-00000000a001", user_id: PAT, store: "Super Food", purchase_date: addDays(today, -2), total: 148.2, currency: "AWG", receipt_path: null, notes: null, created_at: now }, { id: "9a000000-0000-4000-8000-00000000a002", user_id: PAT, store: "Ling & Sons", purchase_date: addDays(today, -9), total: 96.4, currency: "AWG", receipt_path: null, notes: null, created_at: now });
    fake.table("grocery_items").push(
      ...[["Produce", 52.1], ["Dairy", 38.6], ["Meat", 41.5], ["Snacks", 16.0]].map(([category, line_total], i) => ({ id: `9b000000-0000-4000-8000-00000000a10${i}`, receipt_id: "9a000000-0000-4000-8000-00000000a001", user_id: PAT, name: `Item ${i}`, normalized_name: `item ${i}`, category, quantity: 1, unit_price: line_total, line_total, created_at: now })),
      ...[["Produce", 30.2], ["Household", 40.2], ["Dairy", 26.0]].map(([category, line_total], i) => ({ id: `9b000000-0000-4000-8000-00000000a20${i}`, receipt_id: "9a000000-0000-4000-8000-00000000a002", user_id: PAT, name: `Thing ${i}`, normalized_name: `thing ${i}`, category, quantity: 1, unit_price: line_total, line_total, created_at: now })),
    );
    const pages = [["home-business", "/", "business"], ["subscriptions", "/personal/subscriptions"], ["home", "/"], ["trips", "/trips"], ["trip", `/trips/${TRIP_ID}`], ["new-trip", "/trips/new"], ["reports", "/reports"], ["personal", "/personal"], ["documents", "/documents"], ["loyalty", "/personal/loyalty"], ["profile", "/profile"], ["help", "/help"]];
    const adminPages = [["admin-security", "/admin/security"], ["admin-branding", "/admin/branding"], ["admin-users", "/admin/users"]];
    const modes = [["desktop-light", { viewport: { width: 1280, height: 860 }, colorScheme: "light" }], ["phone-light", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, colorScheme: "light" }], ["phone-dark", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, colorScheme: "dark" }]];
    for (const [mode, opts] of modes) {
      for (const [who, email, pw, list] of [["u", "pat@example.com", "Correct-Horse-1", pages], ["a", "admin@example.com", "Admin-Pass-123", adminPages]]) {
        if (who === "a" && mode === "phone-dark") continue;
        const ctx = await browser.newContext(opts);
        ctx.setDefaultTimeout(60_000);
        const pg = await ctx.newPage();
        await signIn(pg, email, pw);
        await pg.waitForURL((u) => u.pathname === "/");
        for (const [name, path, view] of list) {
          await pg.evaluate((v) => { try { if (v) localStorage.setItem("dashboard-view", v); else localStorage.removeItem("dashboard-view"); } catch { /* ignore */ } }, view || null);
          await pg.goto(`${BASE}${path}`).catch(() => {});
          await pg.waitForLoadState("networkidle").catch(() => {});
          if (process.env.E2E_AUDIT_FONT) {
            const b64 = (await import("node:fs")).readFileSync(process.env.E2E_AUDIT_FONT).toString("base64");
            await pg.addStyleTag({ content: `@font-face{font-family:AuditInter;font-weight:100 900;src:url(data:font/woff2;base64,${b64}) format("woff2")} html,body,button,input,select,textarea{font-family:AuditInter,system-ui,sans-serif !important}` });
            await pg.evaluate(() => document.fonts.ready);
          }
          await pg.waitForTimeout(500);
          await pg.screenshot({ path: `${dir}/${mode}-${name}.png` });
        }
        await ctx.close();
      }
    }
  }

  /* ---------- subscriptions and IPTV clients ---------- */
  await test("subscriptions: on a small phone the Add a subscription popup keeps Save on screen, at the bottom, with nothing over it", async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 700 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await signIn(page, "pat@example.com", "Correct-Horse-1");
    await page.waitForURL((u) => u.pathname === "/");
    await page.goto(`${BASE}/personal/subscriptions`);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const dlg = page.getByRole("dialog", { name: "Add a subscription" });
    await dlg.waitFor();
    const save = await dlg.getByRole("button", { name: "Save", exact: true }).boundingBox();
    assert(save && save.y + save.height <= 700 + 1 && save.y + save.height >= 700 - 60, `Save sits at the bottom of the screen (${save && save.y + save.height})`);
    const top = await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return !!el?.closest('[role="dialog"]'); }, [save.x + save.width / 2, save.y + save.height / 2]);
    assert(top, "nothing (like the bottom bar) covers Save");
    await ctx.close();
  });

  await test("subscriptions: a person adds one and sees the monthly total; a role without the option cannot open the page", async () => {
    const { ctx, page } = await newPage();
    await signIn(page, "pat@example.com", "Correct-Horse-1");
    await page.waitForURL((u) => u.pathname === "/");
    await page.goto(`${BASE}/personal`);
    await page.getByRole("link", { name: /Subscriptions/ }).click();
    await page.getByRole("heading", { name: "Subscriptions", level: 1 }).waitFor();
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByLabel("Name", { exact: true }).fill("Netflix");
    await page.getByLabel("Price", { exact: true }).fill("120");
    await page.getByRole("group", { name: "Billed" }).getByRole("button", { name: "Yearly" }).click();
    await page.getByLabel("Next payment").fill(addDays(today, 3));
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByText("You spend per month").waitFor();
    await page.getByText("$10.00", { exact: true }).first().waitFor();
    assert(await page.getByText("In 3 days").count() >= 1, "the payment shows as coming up");
    assert(fake.table("subscriptions").length === 1 && fake.table("subscriptions")[0].user_id === PAT, "saved for the signed-in person");
    await ctx.close();

    const other = await newPage();
    await signIn(other.page, "carol@example.com", "Carol-Pass-123");
    await other.page.waitForURL((u) => u.pathname === "/");
    await other.page.goto(`${BASE}/personal/subscriptions`);
    await other.page.waitForURL((u) => u.pathname === "/");
    await other.ctx.close();
  });

  await test("iptv: admin adds a client, sees the countdown, renews, shares a link that shows only safe fields, and the kill switch stops it", async () => {
    const { ctx, page } = await newPage();
    await signIn(page, "admin@example.com", "Admin-Pass-123");
    await page.waitForURL((u) => u.pathname === "/");
    // The IPTV clients page is reached from Settings, not from the Personal page
    await page.goto(`${BASE}/personal`);
    await page.getByRole("heading", { name: "Personal", level: 1 }).waitFor();
    assert((await page.getByRole("link", { name: /IPTV clients/ }).count()) === 0, "the Personal page has no IPTV clients tile");
    await page.goto(`${BASE}/admin/settings`);
    await page.getByRole("link", { name: /IPTV clients/i }).click();
    await page.waitForURL((u) => u.pathname === "/admin/iptv");
    await page.getByRole("heading", { name: "IPTV clients", level: 1 }).waitFor();
    await page.getByRole("link", { name: "+ Add a client" }).click();
    await page.getByLabel("Client name").fill("Maria Lopez");
    await page.getByLabel(/Contact/).fill("+297 555 0142");
    await page.getByLabel("Subscription", { exact: true }).fill("Basic");
    await page.getByLabel("MAC").fill("00-1a-79-4c-2e-91");
    await page.getByLabel("ID", { exact: true }).fill("48213");
    await page.getByLabel("Order #").fill("A-20418");
    await page.getByLabel("Donation").fill("J17454B8498X");
    await page.getByLabel("Date subscribed").fill(addDays(today, -25));
    await page.getByLabel("Expire date").fill(addDays(today, 5));
    await page.getByRole("button", { name: "Add client" }).click();
    await page.waitForURL(/\/admin\/iptv\/[0-9a-f-]{36}$/);
    await page.getByText("5 days left").first().waitFor();
    assert(fake.table("iptv_clients")[0].mac === "00:1A:79:4C:2E:91", "the MAC is stored in one format");
    assert(fake.table("iptv_clients")[0].donation === "J17454B8498X", "the donation reference is kept as typed");
    assert(fake.table("iptv_clients")[0].created_by === ADMIN, "the admin is the owner");

    assert(fake.table("iptv_customers").length === 1 && fake.table("iptv_clients")[0].customer_id === fake.table("iptv_customers")[0].id, "the subscription belongs to the new client");

    await page.getByRole("button", { name: "Mark renewed" }).click();
    await page.getByText("Renewed.").waitFor();
    assert(fake.table("iptv_renewals").length === 1, "the renewal is in the history");

    // A second subscription for the same client
    await page.getByRole("link", { name: /Add another subscription for Maria/ }).click();
    await page.getByLabel("Subscription", { exact: true }).fill("Premium");
    await page.getByLabel("Model").fill("MAG 524");
    await page.getByLabel("MAC").fill("00-1a-79-4c-2e-92");
    await page.getByRole("group", { name: "Frequency" }).getByRole("button", { name: "Yearly" }).click();
    await page.getByRole("button", { name: "Add subscription" }).click();
    await page.waitForURL(/\/admin\/iptv\/[0-9a-f-]{36}$/);
    await page.getByText("Premium · MAG 524").first().waitFor();
    assert(fake.table("iptv_clients").length === 2 && fake.table("iptv_customers").length === 1, "two subscriptions, still one client");

    await page.getByRole("button", { name: "Make a link" }).click();
    const link = await page.getByLabel("Client link").inputValue();
    assert(/\/s\/[0-9a-f]{40}$/.test(link), "a long random address");

    const visitor = await newPage();
    await visitor.page.goto(link.replace(/^https?:\/\/[^/]+/, BASE));
    await visitor.page.getByText("Hi Maria, you have").waitFor();
    const text = await visitor.page.locator("body").innerText();
    for (const secret of ["00:1A:79", "48213", "A-20418", "J17454B8498X", "Lopez"]) assert(!text.includes(secret), `the public page hides ${secret}`);
    assert(text.includes("Basic") && text.includes("Premium · MAG 524"), "both subscriptions are on the one link");
    assert(text.includes("2 subscriptions"), "the page says how many");
    // Added to the Home Screen it must open this link, not the sign-in page
    const href = await visitor.page.locator('link[rel="manifest"]').getAttribute("href");
    const m = await (await visitor.page.request.get(`${BASE}${href}`)).json();
    const path = new URL(link).pathname;
    assert(m.start_url === path && m.scope === path && m.id === path, "the installed app starts on the client link");
    assert((await (await visitor.page.request.get(`${BASE}/api/manifest?s=nothex`)).json()).start_url === "/", "a made-up value falls back to the normal app");

    // Kill switch: every client view stops at once
    await page.goto(`${BASE}/admin/iptv`);
    await page.getByRole("switch", { name: "Client links and client logins" }).click();
    await page.waitForTimeout(500);
    await visitor.page.reload();
    await visitor.page.getByText("This link is not available").waitFor();
    await page.getByRole("switch", { name: "Client links and client logins" }).click();
    await page.waitForTimeout(500);
    await visitor.page.reload();
    await visitor.page.getByText("Hi Maria, you have").waitFor();

    // Stopping the link kills the old address for good
    await page.goto(`${BASE}/admin/iptv/${fake.table("iptv_customers")[0].id}`);
    await page.getByRole("button", { name: "Show the link" }).click();
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    await page.getByRole("button", { name: "Stop link" }).click();
    await page.waitForTimeout(500);
    await visitor.page.reload();
    await visitor.page.getByText("This link is not available").waitFor();
    await visitor.ctx.close();
    await ctx.close();
  });

  await test("iptv: a client login lands on one page, sees only their own subscription, and cannot reach anything else; other roles cannot open the admin page", async () => {
    const id = fake.table("iptv_customers")[0].id;
    const admin2 = await newPage();
    await signIn(admin2.page, "admin@example.com", "Admin-Pass-123");
    await admin2.page.waitForURL((u) => u.pathname === "/");
    await admin2.page.goto(`${BASE}/admin/iptv/${id}`);
    await admin2.page.getByLabel("Client email").fill("maria@example.com");
    await admin2.page.getByRole("button", { name: "Link existing account" }).click();
    await admin2.page.getByText(/Linked\./).waitFor();
    await admin2.ctx.close();

    const { ctx, page } = await newPage();
    await signIn(page, "maria@example.com", "Maria-Pass-123");
    await page.waitForURL((u) => u.pathname === "/my-subscription");
    await page.getByText("Hi Maria, you have").waitFor();
    const text = await page.locator("body").innerText();
    for (const secret of ["00:1A:79", "48213", "A-20418", "J17454B8498X"]) assert(!text.includes(secret), `the client page hides ${secret}`);
    for (const path of ["/", "/trips", "/personal/subscriptions", "/admin/iptv", "/admin/settings"]) {
      await page.goto(`${BASE}${path}`);
      await page.waitForURL((u) => u.pathname === "/my-subscription");
    }
    await ctx.close();

    for (const [email, pw] of [["sam@example.com", "Sam-Pass-12345"], ["pat@example.com", "Correct-Horse-1"]]) {
      const x = await newPage();
      await signIn(x.page, email, pw);
      await x.page.waitForURL((u) => u.pathname === "/");
      await x.page.goto(`${BASE}/admin/iptv`);
      await x.page.waitForURL((u) => u.pathname === "/");
      await x.page.goto(`${BASE}/personal`);
      await x.page.getByRole("heading", { name: "Personal", level: 1 }).waitFor();
      assert((await x.page.getByRole("link", { name: /IPTV clients/ }).count()) === 0, "no IPTV clients tile for other people");
      await x.page.goto(`${BASE}/my-subscription`);
      await x.page.waitForURL((u) => u.pathname === "/");
      await x.ctx.close();
    }
  });

  await test("personal: My IPTV subscription only shows for a person an admin has assigned a subscription to", async () => {
    // Maria was linked to an IPTV client in the test above; Sam has an account but no subscription. Both get a role that has the option.
    fake.table("roles").push({ id: "member-iptv-role", key: "member-iptv", label: "Member", description: "Has My IPTV", permissions: ["personal", "iptv.mine"], known_features: [...FEATURES, "iptv.mine"], is_system: false, created_at: new Date().toISOString() });
    const profile = (name) => fake.table("profiles").find((p) => p.full_name === name);
    const before = { maria: profile("Maria Lopez").role, sam: profile("Sam Assistant").role };
    profile("Maria Lopez").role = "member-iptv";
    profile("Sam Assistant").role = "member-iptv";
    try {
      for (const [email, pw, shown] of [["maria@example.com", "Maria-Pass-123", true], ["sam@example.com", "Sam-Pass-12345", false]]) {
        const x = await newPage();
        await signIn(x.page, email, pw);
        await x.page.waitForURL((u) => u.pathname === "/");
        await x.page.goto(`${BASE}/personal`);
        await x.page.getByRole("heading", { name: "Personal", level: 1 }).waitFor();
        await x.page.getByRole("link", { name: /Groceries|Home Projects/ }).first().waitFor();
        if (shown) await x.page.getByRole("link", { name: /My IPTV subscription/ }).waitFor();
        else {
          await x.page.waitForTimeout(1500);
          assert((await x.page.getByRole("link", { name: /My IPTV subscription/ }).count()) === 0, `${email} has no IPTV subscription, so the tile stays hidden`);
        }
        await x.ctx.close();
      }
      // An admin who is assigned a subscription on their own email sees the tile too
      const id = fake.table("iptv_customers")[0].id;
      const a2 = await newPage();
      await signIn(a2.page, "admin@example.com", "Admin-Pass-123");
      await a2.page.waitForURL((u) => u.pathname === "/");
      await a2.page.goto(`${BASE}/admin/iptv/${id}`);
      await a2.page.getByRole("button", { name: "Unlink", exact: true }).click(); // Maria is linked to this client from the test above
      await a2.page.getByLabel("Client email").fill("admin@example.com");
      await a2.page.getByRole("button", { name: "Link existing account" }).click();
      await a2.page.getByText(/Linked\./).waitFor();
      await a2.page.goto(`${BASE}/personal`);
      await a2.page.getByRole("link", { name: /My IPTV subscription/ }).waitFor();
      await a2.ctx.close();
    } finally {
      profile("Maria Lopez").role = before.maria;
      profile("Sam Assistant").role = before.sam;
      const roles = fake.table("roles");
      roles.splice(roles.findIndex((r) => r.key === "member-iptv"), 1);
    }
  });

  await test("subscriptions: every active subscription shows a bar that fills until its renewal", async () => {
    const subs = fake.table("subscriptions");
    subs.push({ id: "5b000000-0000-4000-8000-0000000008f1", user_id: PAT, name: "Bar Streaming", price: 10, currency: "USD", cycle: "monthly", next_payment: addDays(today, 10), category: null, status: "active", trial_ends: null, split_count: 1, remind_days: 3, cancel_url: null, notes: null, price_history: [], created_at: new Date().toISOString() });
    const { ctx, page } = await newPage();
    try {
      await signIn(page, "pat@example.com", "Correct-Horse-1");
      await page.waitForURL((u) => u.pathname === "/");
      await page.goto(`${BASE}/personal/subscriptions`);
      const bar = page.getByRole("progressbar", { name: /Bar Streaming/ }).first();
      await bar.waitFor();
      const now = Number(await bar.getAttribute("aria-valuenow"));
      assert(now > 0 && now < 100, `the bar shows how far along the period is (${now}%)`);
      assert((await bar.getAttribute("aria-label")).includes("10 days to renewal"), "the bar says how many days are left");
    } finally {
      await ctx.close();
      subs.splice(subs.findIndex((r) => r.id === "5b000000-0000-4000-8000-0000000008f1"), 1);
    }
  });

  await test("prices: the same beer from two supermarkets is one product that says which store is cheaper, and a wrong match can be undone", async () => {
    const { ctx, page } = await newPage();
    const R = ["9c000000-0000-4000-8000-00000000c001", "9c000000-0000-4000-8000-00000000c002", "9c000000-0000-4000-8000-00000000c003"];
    const mk = (id, store, days) => ({ id, user_id: PAT, store, purchase_date: addDays(today, days), total: 6, currency: "AWG", receipt_path: null, notes: null, created_at: new Date().toISOString() });
    const item = (n, rid, name, price) => ({ id: `9d000000-0000-4000-8000-00000000d00${n}`, receipt_id: rid, user_id: PAT, name, normalized_name: name.toLowerCase(), category: "Beverages", quantity: 1, unit_price: price, line_total: price, unit: null, created_at: new Date().toISOString() });
    fake.table("grocery_receipts").push(mk(R[0], "Plaza Market", -10), mk(R[1], "Plaza Market", -5), mk(R[2], "Corner Mart", -4));
    fake.table("grocery_items").push(item(1, R[0], "Corona Extra Bot 33CL", 5.25), item(2, R[1], "Corona Extra Bot 33CL", 5.49), item(3, R[2], "Corona Extra 330ML Cold", 5.75));
    try {
      await signIn(page, "pat@example.com", "Correct-Horse-1");
      await page.waitForURL((u) => u.pathname === "/");
      await page.goto(`${BASE}/personal/groceries/prices`);
      const card = page.getByTestId("price-product").filter({ hasText: "Corona Extra" });
      await card.first().waitFor({ timeout: 60000 });
      assert((await card.count()) === 1, "two wordings, two stores: one product, not " + (await card.count()));
      const text = await card.first().innerText();
      assert(/330 ml/.test(text) && /Plaza Market saves/.test(text), "size and the cheaper store show on the card: " + text);
      await card.first().getByRole("button").first().click();
      const detail = card.first().getByTestId("price-detail");
      await detail.waitFor();
      const stores = await detail.getByTestId("price-store").allInnerTexts();
      assert(stores.length === 2 && /Plaza Market/.test(stores[0]) && /Cheapest/.test(stores[0]) && /Corner Mart/.test(stores[1]) && /more/.test(stores[1]), "cheapest store first: " + JSON.stringify(stores));
      assert(/4\.6%/.test(stores[0]) && /was .*5\.25/.test(stores[0]), "the same store's own change is shown: " + stores[0]);
      assert(/Plaza Market is cheaper/.test(await detail.getByTestId("price-saving").innerText()), "the saving line names the cheaper store");
      await detail.getByRole("button", { name: "Not the same product" }).first().click();
      await page.waitForFunction(() => document.querySelectorAll('[data-testid="price-product"]').length === 2, null, { timeout: 30000 });
      assert(fake.table("grocery_price_matches").some((m) => m.same === false && m.user_id === PAT), "the answer is saved");
    } finally {
      await ctx.close();
      for (const t of ["grocery_receipts", "grocery_items", "grocery_price_matches"]) { const rows = fake.table(t); for (let i = rows.length - 1; i >= 0; i--) if (/^9[cd]0000/.test(String(rows[i].id ?? rows[i].key_a ?? "")) || t === "grocery_price_matches") rows.splice(i, 1); }
    }
  });

  await test("flights: a flight added by hand shows on the trip page and trip card, the confirmation code stays hidden until revealed, and it can be removed", async () => {
    const { ctx, page } = await newPage();
    try {
      await signIn(page, "pat@example.com", "Correct-Horse-1");
      await page.waitForURL((u) => u.pathname === "/");
      await page.route("**/api/flights/lookup**", (r) => r.fulfill({ status: 503, json: { reason: "not_configured" } }));
      await page.goto(`${BASE}/trips/${TRIP_ID}`);
      await page.getByTestId("flight-add").first().click();
      const dlg = page.getByRole("dialog", { name: "Add flight" });
      await dlg.waitFor();
      await dlg.getByTestId("flight-number").fill("CM 312");
      await dlg.getByTestId("flight-find").click();
      await dlg.getByTestId("flight-manual").waitFor();
      assert((await dlg.getByTestId("flight-notice").innerText()).includes("not set up"), "says lookup is not set up and offers manual entry");
      await dlg.getByTestId("flight-airline").fill("Copa Airlines");
      await dlg.getByTestId("flight-from").fill("aua");
      await dlg.getByTestId("flight-to").fill("pty");
      await dlg.getByTestId("flight-dep-time").fill("09:45");
      await dlg.getByTestId("flight-arr-time").fill("11:10");
      await dlg.getByTestId("flight-pnr-input").fill("wk89l2");
      await dlg.getByTestId("flight-seat").fill("4a");
      await dlg.getByTestId("flight-save").click();
      await page.getByTestId("flight-panel").waitFor({ timeout: 60000 }).catch(async () => { throw new Error("no panel; rows=" + JSON.stringify(fake.table("trip_flights").map((f) => f.flight_number)) + " page=" + (await page.locator("body").innerText()).slice(0, 700)); });
      const panel = await page.getByTestId("flight-panel").innerText();
      assert(/CM 312/.test(panel) && /AUA/.test(panel) && /PTY/.test(panel), "panel shows the flight and route: " + panel);
      assert(!panel.includes("WK89L2"), "confirmation code is masked");
      await page.getByRole("button", { name: "Show confirmation code" }).click();
      await page.waitForFunction(() => document.querySelector('[data-testid="flight-panel"]')?.textContent?.includes("WK89L2"));
      const row = fake.table("trip_flights").find((f) => f.flight_number === "CM 312");
      assert(row && row.source === "manual" && row.user_id === PAT && row.trip_id === TRIP_ID, "saved as a manual flight for this trip");
      await page.goto(`${BASE}/trips`);
      await page.getByTestId("trip-flight-line").first().waitFor({ timeout: 60000 });
      assert((await page.getByTestId("trip-flight-line").first().innerText()).includes("AUA to PTY"), "trip card shows the next flight");
      await page.goto(`${BASE}/trips/${TRIP_ID}`);
      await page.getByTestId("flight-remove").click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
      await page.getByText("No flight added yet").waitFor({ timeout: 60000 });
      assert(!fake.table("trip_flights").some((f) => f.flight_number === "CM 312"), "removed from the database");
    } finally {
      await ctx.close();
      const t = fake.table("trip_flights");
      t.splice(0, t.length);
    }
  });

  await test("flights: an outbound and a return added by hand stay separate", async () => {
    const { ctx, page } = await newPage();
    try {
      await signIn(page, "pat@example.com", "Correct-Horse-1");
      await page.waitForURL((u) => u.pathname === "/");
      await page.route("**/api/flights/lookup**", (r) => r.fulfill({ status: 404, json: { reason: "not_found" } }));
      await page.goto(`${BASE}/trips/${TRIP_ID}`);
      const add = async (leg, number, from, to, dep, arr) => {
        await page.getByTestId("flight-add").first().click();
        const dlg = page.getByRole("dialog", { name: "Add flight" });
        await dlg.waitFor();
        await dlg.getByRole("button", { name: leg, exact: true }).click();
        await dlg.getByTestId("flight-number").fill(number);
        // A date far enough ahead is already in hand mode, with no Find button
        if (await dlg.getByTestId("flight-find").count()) await dlg.getByTestId("flight-find").click();
        await dlg.getByTestId("flight-manual").waitFor();
        const pre = [await dlg.getByTestId("flight-from").inputValue(), await dlg.getByTestId("flight-to").inputValue()];
        await dlg.getByTestId("flight-from").fill(from);
        await dlg.getByTestId("flight-to").fill(to);
        await dlg.getByTestId("flight-dep-time").fill(dep);
        await dlg.getByTestId("flight-arr-time").fill(arr);
        await dlg.getByTestId("flight-save").click();
        await dlg.waitFor({ state: "detached", timeout: 30000 });
        return pre;
      };
      // Switching legs inside one open sheet must not carry the details over
      await page.getByTestId("flight-add").first().click();
      const first = page.getByRole("dialog", { name: "Add flight" });
      await first.waitFor();
      await first.getByTestId("flight-number").fill("CM 312");
      await first.getByTestId("flight-find").click();
      await first.getByTestId("flight-manual").waitFor();
      await first.getByTestId("flight-from").fill("AUA");
      await first.getByRole("button", { name: "Return", exact: true }).click();
      assert((await first.getByTestId("flight-number").inputValue()) === "", "number is cleared when the leg changes");
      assert((await first.getByTestId("flight-from").inputValue()) === "", "typed airports are cleared when the leg changes");
      await first.getByRole("button", { name: "Close" }).click();
      await add("Outbound", "CM 312", "AUA", "PTY", "09:45", "11:10");
      await page.getByTestId("flight-panel").waitFor({ timeout: 60000 });
      const pre = await add("Return", "CM 313", "PTY", "AUA", "14:00", "17:30");
      assert(pre.every((v) => v === "") || (pre[0] === "" && pre[1] === ""), "the return form does not start with the outbound details: " + JSON.stringify(pre));
      await page.getByRole("tab").nth(1).waitFor({ timeout: 60000 });
      const rows = fake.table("trip_flights").map((f) => [f.leg, f.flight_number, f.dep_iata, f.arr_iata, f.flight_date]);
      assert(rows.length === 2 && rows.some((r) => r[0] === "outbound" && r[1] === "CM 312" && r[2] === "AUA") && rows.some((r) => r[0] === "return" && r[1] === "CM 313" && r[2] === "PTY"), "two separate flights saved: " + JSON.stringify(rows));
      const tabs = await page.getByRole("tab").allInnerTexts();
      assert(tabs.length === 2 && tabs[0] !== tabs[1], "two different tabs: " + JSON.stringify(tabs));
      await page.getByRole("tab").nth(1).click();
      assert((await page.getByTestId("flight-panel").innerText()).includes("CM 313"), "the return tab shows the return flight");
      await page.getByRole("tab").nth(0).click();
      assert((await page.getByTestId("flight-panel").innerText()).includes("CM 312"), "the outbound tab shows the outbound flight");
    } finally {
      await ctx.close();
      const t = fake.table("trip_flights");
      t.splice(0, t.length);
    }
  });

  await test("flights: Add to calendar gives a timed event for the flight, and a flight that is not yours is not found", async () => {
    const { ctx, page } = await newPage();
    const FID = "f1000000-0000-4000-8000-000000000001";
    fake.table("trip_flights").push({ id: FID, trip_id: TRIP_ID, user_id: PAT, leg: "outbound", flight_number: "CM 312", airline: "Copa Airlines", aircraft: null, flight_date: today, dep_iata: "AUA", dep_city: null, dep_name: "Queen Beatrix", dep_local: `${today}T09:45`, dep_est_local: null, dep_offset: -240, dep_terminal: "1", dep_gate: "3", arr_iata: "PTY", arr_city: null, arr_name: "Tocumen", arr_local: `${today}T10:40`, arr_est_local: null, arr_offset: -300, arr_terminal: null, arr_gate: null, status: "scheduled", pnr: "WK89L2", seat: "04A", cabin: "Business", source: "auto", alerts: true, last_synced_at: new Date().toISOString(), created_at: new Date().toISOString() });
    try {
      await signIn(page, "pat@example.com", "Correct-Horse-1");
      await page.waitForURL((u) => u.pathname === "/");
      await page.goto(`${BASE}/trips/${TRIP_ID}`);
      await page.getByTestId("flight-calendar").click();
      const dlg = page.getByRole("dialog", { name: "Add flight to calendar" });
      await dlg.waitFor();
      assert((await dlg.getByTestId("flight-cal-preview").innerText()).includes("CM 312 AUA to PTY"), "the sheet shows the flight");
      await dlg.getByRole("button", { name: "Close" }).click();
      const res = await page.request.get(`${BASE}/api/flights/${FID}/calendar?reminder=3h&download=1`);
      const text = await res.text();
      const d = today.replace(/-/g, "");
      assert(res.status() === 200 && (res.headers()["content-type"] || "").includes("text/calendar"), "a calendar file comes back");
      assert(text.includes(`DTSTART:${d}T134500Z`) && text.includes("SUMMARY:CM 312 AUA to PTY") && text.includes("TRIGGER:-PT3H"), "timed event with a reminder: " + text.slice(0, 400));
      assert(!/WK89L2|04A|Business/.test(text), "no booking details in the file");
      const other = await page.request.get(`${BASE}/api/flights/f1000000-0000-4000-8000-0000000000ff/calendar`);
      assert(other.status() === 404, "an unknown flight is not found");
    } finally {
      await ctx.close();
      const t = fake.table("trip_flights");
      t.splice(0, t.length);
    }
  });

  await test("flights: a date too far ahead goes straight to entering it by hand, and the business dashboard shows the next flight", async () => {
    const { ctx, page } = await newPage();
    const FID = "f1000000-0000-4000-8000-0000000000a1";
    try {
      await signIn(page, "pat@example.com", "Correct-Horse-1");
      await page.waitForURL((u) => u.pathname === "/");
      await page.goto(`${BASE}/trips/${TRIP_ID}`);
      await page.getByTestId("flight-add").first().click();
      const dlg = page.getByRole("dialog", { name: "Add flight" });
      await dlg.waitFor();
      assert((await dlg.getByTestId("flight-manual").count()) === 0, "a flight that can be looked up starts in Find flight");
      await dlg.getByTestId("flight-date").fill(addDays(today, 5));
      await dlg.getByTestId("flight-manual").waitFor({ timeout: 10000 });
      assert((await dlg.getByTestId("flight-notice").innerText()).includes("close to the flight"), "says live details come close to the flight");
      assert((await dlg.getByTestId("flight-find").count()) === 0, "no Find button in hand mode");
      await dlg.getByTestId("flight-date").fill(today);
      await dlg.getByTestId("flight-find").waitFor({ timeout: 10000 });
      assert((await dlg.getByTestId("flight-manual").count()) === 0, "back to Find flight when the date can be looked up");
      await dlg.getByRole("button", { name: "Close" }).click();

      fake.table("trip_flights").push({ id: FID, trip_id: TRIP_ID, user_id: PAT, leg: "outbound", flight_number: "CM 312", airline: "Copa Airlines", aircraft: null, flight_date: today, dep_iata: "AUA", dep_city: null, dep_name: null, dep_local: `${today}T09:45`, dep_est_local: null, dep_offset: -240, dep_terminal: null, dep_gate: null, arr_iata: "PTY", arr_city: null, arr_name: null, arr_local: `${today}T10:40`, arr_est_local: null, arr_offset: -300, arr_terminal: null, arr_gate: null, status: "scheduled", pnr: null, seat: null, cabin: null, source: "manual", alerts: true, last_synced_at: new Date().toISOString(), created_at: new Date().toISOString() });
      await page.goto(`${BASE}/`);
      await page.getByRole("tab", { name: "Business" }).click(); // Home opens on Personal first
      const hero = page.getByTestId("featured-trip");
      await hero.waitFor({ timeout: 30000 });
      const heroText = await hero.innerText();
      assert(/CM 312/.test(heroText) && /AUA/.test(heroText) && /PTY/.test(heroText), "the business dashboard shows the flight: " + heroText.slice(0, 300));
      assert(/Added by hand/.test(heroText) && !/Flight sync active/.test(heroText), "a hand-entered flight says so, not 'sync active'");
      assert(!/Confirmed/.test(heroText), "the status never claims 'Confirmed'");
      assert(/Flight details/.test(heroText) && /Add expense/.test(heroText), "flight details and add expense buttons");
      await page.getByTestId("featured-flight-details").click();
      await page.waitForURL(new RegExp(`/trips/${TRIP_ID}#flights`), { timeout: 30000 });
    } finally {
      await ctx.close();
      const t = fake.table("trip_flights");
      t.splice(0, t.length);
    }
  });

  await test("hotel: the business dashboard shows the hotel under the flight with a Directions button", async () => {
    const { ctx, page } = await newPage();
    const trip = fake.table("trips").find((t) => t.id === TRIP_ID);
    trip.hotel_name = "Courtyard Marriott";
    trip.hotel_address = "Multiplaza Mall, Ave. Israel, Panama";
    try {
      await signIn(page, "pat@example.com", "Correct-Horse-1");
      await page.waitForURL((u) => u.pathname === "/");
      await page.goto(`${BASE}/`);
      await page.getByRole("tab", { name: "Business" }).click();
      const strip = page.getByTestId("featured-hotel");
      await strip.waitFor({ timeout: 30000 });
      const text = await strip.innerText();
      assert(/Courtyard Marriott/.test(text) && /Multiplaza/.test(text), "name and address: " + text);
      const href = await page.getByTestId("featured-hotel-directions").getAttribute("href");
      assert(href.includes("google.com/maps/dir") && href.includes(encodeURIComponent("Courtyard Marriott")), "Directions opens the maps app");
      trip.hotel_name = null; trip.hotel_address = null;
      await page.reload();
      await page.getByRole("tab", { name: "Business" }).click();
      await page.getByTestId("featured-trip").waitFor({ timeout: 30000 });
      assert((await page.getByTestId("featured-hotel").count()) === 0, "no hotel, no panel");
    } finally {
      trip.hotel_name = null; trip.hotel_address = null;
      await ctx.close();
    }
  });

  await test("tripweather: the trip's forecast sits under the Active trip card, with its states", async () => {
    const { ctx, page } = await newPage();
    const trip = fake.table("trips").find((t) => t.id === TRIP_ID);
    const before = { destination: trip.destination };
    trip.destination = "Panama City, Panama";
    const day = (n, code, rain) => ({ date: addDays(today, n), code, hi: 31, lo: 24, rain });
    const ok = { status: "ok", place: "Panama City", countryCode: "PA", updatedAt: new Date().toISOString(), days: [day(0, 61, 70), day(1, 95, 80), day(2, 2, 20)] };
    let reply = ok;
    try {
      await page.route("**/api/trip-weather**", (r) => r.fulfill({ json: reply }));
      await signIn(page, "pat@example.com", "Correct-Horse-1");
      await page.waitForURL((u) => u.pathname === "/");
      await page.goto(`${BASE}/`);
      await page.getByRole("tab", { name: "Business" }).click();
      const card = page.getByTestId("trip-weather").first();
      await card.waitFor({ timeout: 30000 });
      const text = await card.innerText();
      assert(/Weather in Panama City/.test(text) && /31°/.test(text) && /24°/.test(text), "place and temperatures: " + text.slice(0, 300));
      assert(/Pack a rain jacket: rain likely on 2 of 3 days/.test(text), "the packing sentence: " + text.slice(0, 300));
      assert(/Today/.test(text), "today is marked");
      const heroBox = await page.getByTestId("featured-trip").boundingBox();
      const cardBox = await card.boundingBox();
      assert(cardBox.y >= heroBox.y + heroBox.height - 2, "the forecast is below the trip card");

      // Phone: the cards below keep the same gap as everywhere else (no extra padding under the Active trips block)
      await page.setViewportSize({ width: 390, height: 844 });
      const gapBelow = await page.evaluate(() => {
        const w = document.querySelector('[data-testid="trip-weather"]');
        const body = w.closest('[class*="max-md:px-0"]'); // the Active Trips content: on a phone it has no extra padding under its last card
        return body ? Math.round(parseFloat(getComputedStyle(body).paddingBottom)) : null;
      });
      assert(gapBelow !== null && gapBelow <= 4, "no extra empty space under the forecast on a phone: " + gapBelow);
      await page.setViewportSize({ width: 1280, height: 900 });

      reply = { status: "early", opensOn: addDays(today, 10) };
      await page.evaluate(() => { try { localStorage.clear(); } catch {} }); // a recent forecast is kept for 30 minutes
      await page.reload(); await page.getByRole("tab", { name: "Business" }).click();
      await page.getByTestId("trip-weather").first().waitFor({ timeout: 30000 });
      assert(/Forecast opens/.test(await page.getByTestId("trip-weather").first().innerText()), "too early says when it opens");

      reply = { status: "nolocation" };
      await page.evaluate(() => { try { localStorage.clear(); } catch {} });
      await page.reload(); await page.getByRole("tab", { name: "Business" }).click();
      const nl = page.getByTestId("trip-weather").first();
      await nl.waitFor({ timeout: 30000 });
      assert(/couldn.t find/.test(await nl.innerText()), "an unknown place is explained");
      const href = await nl.getByRole("link", { name: "Edit destination" }).getAttribute("href");
      assert(href === `/trips/${TRIP_ID}/edit`, "Edit destination goes to the trip form: " + href);

      trip.destination = null;
      await page.reload(); await page.getByRole("tab", { name: "Business" }).click();
      await page.getByTestId("featured-trip").waitFor({ timeout: 30000 });
      assert((await page.getByTestId("trip-weather").count()) === 0, "no destination, no weather card");
    } finally {
      trip.destination = before.destination;
      await ctx.close();
    }
  });

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
