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
fake.seed("app_settings", [{ id: 1, app_name: "E2E Expense App", logo_url: null, primary_color: "#4f46e5", login_logo_size: 56, privacy_policy: "", support_email: "help@example.com", personal_enabled: true }]);
fake.seed("currencies", [
  { code: "USD", name: "US Dollar", usd_rate: 1, enabled: true, sort_order: 1 },
  { code: "AWG", name: "Aruban Florin", usd_rate: 0.558659, enabled: true, sort_order: 2 },
  { code: "EUR", name: "Euro", usd_rate: 1.1, enabled: true, sort_order: 3 },
]);
for (const t of ["profiles", "trips", "expenses", "personal_projects", "personal_expenses", "grocery_receipts", "grocery_items", "travel_documents", "loyalty_cards", "security_events", "audit_logs", "support_requests"]) fake.table(t);

const PAT = fake.addUser({ email: "pat@example.com", password: "Correct-Horse-1", role: "user", full_name: "Pat Tester" });
fake.addUser({ email: "newbie@example.com", password: "Temp-Pass-1", role: "user", full_name: "New Person" });
const ADMIN = fake.addUser({ email: "admin@example.com", password: "Admin-Pass-123", role: "admin", full_name: "Ada Admin" });
const ALICE = fake.addUser({ email: "alice@example.com", password: "Alice-Pass-123", role: "family", full_name: "Alice Sharer" });
const BOB = fake.addUser({ email: "bob@example.com", password: "Bob-Pass-12345", role: "family", full_name: "Bob Partner" });
fake.addUser({ email: "carol@example.com", password: "Carol-Pass-123", role: "family", full_name: "Carol Stranger" });
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
fake.table("audit_logs").push({ id: "b0a6a8a2-0000-4000-8000-000000000002", created_at: new Date().toISOString(), action: "role.update", entity_type: "role", entity_id: "user", actor_id: ADMIN, actor_email: "admin@example.com", details: {} });

/* ---------------- start everything ---------------- */
// The sharing functions run as the real SQL from supabase/migration_sharing.sql on a real Postgres engine (PGlite)
const sharingDb = await createSharingBackend(fake);
fake.setRpcHook(sharingDb.hook);
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
        assert(r.bar[0] === (dark ? "#020817" : "#4f46e5"), `${path} ${scheme}: top bar colour ${r.bar[0]}`);
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

  await test("a photo sent to Groceries from the dashboard goes on to the crop step, and the document menu on a phone opens over the cards below", async () => {
    const { ctx, page } = await newPage();
    await signIn(page, "pat@example.com", "Correct-Horse-1");
    await page.waitForURL((u) => u.pathname === "/");
    await page.evaluate((b64) => sessionStorage.setItem("quick-scan-v2", JSON.stringify({ key: "grocery", name: "receipt.jpg", type: "image/jpeg", dataUrl: `data:image/jpeg;base64,${b64}`, at: Date.now(), reason: null })), JPEG.toString("base64"));
    await page.goto(`${BASE}/personal/groceries/new?quick=1`);
    await page.getByText(/Crop/).first().waitFor({ timeout: 20_000 });
    await ctx.close();
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
    await a.page.goto(`${BASE}/profile`);
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
    await b.page.goto(`${BASE}/profile`);
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
    const bobPage = await b.page.content();
    for (const secret of ["SECRET-NOTES", "SECRET-HOTEL", "987.65", "secret-receipt"]) assert(!bobPage.includes(secret), `Bob's page must not contain ${secret}`);
    const tripsJson = await api(b.page, "/api/sharing/trips");
    assert(JSON.stringify(Object.keys(tripsJson.body.trips[0]).sort()) === JSON.stringify(["destination", "end_date", "kind", "name", "share_id", "shared_by", "start_date", "trip_id"]), "the trip has exactly these fields");
    assert(!/SECRET|987\.65|receipt/.test(JSON.stringify(tripsJson.body)), "no expense, note or receipt in the trip answer");

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
    await a.page.goto(`${BASE}/profile`);
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
  });

  await test("admin: Branding page loads the saved settings", async () => {
    await admin.page.goto(`${BASE}/admin/branding`);
    await admin.page.locator('input[value="E2E Expense App"]').waitFor();
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
    await d.page.getByText("Choose a topic").waitFor();
    await shot(d.page, "help-1-desktop-list");
    await d.page.getByRole("link", { name: /Add the app to your home screen/ }).click();
    await d.page.waitForURL((u) => u.pathname === "/help/add-to-home-screen");
    await d.page.getByRole("heading", { name: "iPhone and iPad" }).waitFor();
    assert((await d.page.getByText("Add to Home Screen").count()) >= 1, "step text missing");
    assert(await d.page.getByText("Add the app to your home screen").first().isVisible(), "the list should stay beside the topic on desktop");
    assert((await d.page.getByRole("link", { name: "Edit this topic" }).count()) === 0, "a plain user must not see Edit");
    await shot(d.page, "help-2-desktop-topic");
    await d.page.getByLabel("Search help").fill("trip");
    await d.page.getByText("Share with a partner").first().waitFor();
    assert((await d.page.getByRole("link", { name: /Add the app to your home screen/ }).count()) === 0, "search should hide other topics");
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
    await page.getByText("Share with a partner").first().waitFor();
    assert((await page.getByText("Choose a topic").isVisible()) === false, "the desktop hint must not show on a phone");
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
    await admin.page.getByRole("heading", { name: "Reset your password", level: 1 }).waitFor();
    assert((await admin.page.locator("article b").count()) === 0, "HTML in a topic must not become real markup");
    assert((await admin.page.getByText("<b>not html</b>").count()) === 1, "HTML should show as plain text");
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
