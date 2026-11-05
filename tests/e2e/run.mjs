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
  const started = Date.now();
  try {
    await fn();
    results.push(`PASS ${name} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  } catch (e) {
    failed++;
    results.push(`FAIL ${name}\n     ${String(e?.message || e).split("\n").slice(0, 6).join("\n     ")}`);
  }
  console.log(results.at(-1));
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const todayAruba = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Aruba" }).format(new Date());
const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/* ---------------- fake backend + seed ---------------- */
const fake = createFakeSupabase();
const FEATURES = ["trips", "reports", "personal", "personal.dashboard", "documents", "users.manage", "security.view", "categories.manage", "currencies.manage", "branding.manage", "telegram.manage", "support.view"];
fake.seed("roles", [
  { key: "user", label: "User", description: "Regular user", permissions: ["trips", "reports", "personal", "personal.dashboard", "documents"], known_features: FEATURES, is_system: true },
  { key: "assistant", label: "Assistant", description: "Assistant", permissions: ["trips", "reports", "personal", "documents", "users.manage"], known_features: FEATURES, is_system: true },
  { key: "admin", label: "Admin", description: "Admin", permissions: FEATURES, known_features: FEATURES, is_system: true },
]);
fake.seed("app_settings", [{ id: 1, app_name: "E2E Expense App", logo_url: null, primary_color: "#4f46e5", login_logo_size: 56, privacy_policy: "", support_email: "help@example.com", personal_enabled: true }]);
fake.seed("currencies", [
  { code: "USD", name: "US Dollar", usd_rate: 1, enabled: true, sort_order: 1 },
  { code: "AWG", name: "Aruban Florin", usd_rate: 0.558659, enabled: true, sort_order: 2 },
  { code: "EUR", name: "Euro", usd_rate: 1.1, enabled: true, sort_order: 3 },
]);
for (const t of ["profiles", "trips", "expenses", "personal_projects", "personal_expenses", "grocery_receipts", "grocery_items", "travel_documents", "security_events", "audit_logs", "support_requests"]) fake.table(t);

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
  const newPage = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    ctx.setDefaultTimeout(60_000);
    return { ctx, page: await ctx.newPage() };
  };
  async function signIn(page, email, password) {
    await page.goto(`${BASE}/login`);
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

  await test("admin: the Personal view of the home page opens", async () => {
    await admin.page.goto(`${BASE}/`);
    await admin.page.getByRole("tab", { name: "Personal" }).click();
    await admin.page.getByText("Total spent (AWG)").waitFor();
    await admin.page.getByRole("tab", { name: "Business" }).click();
    await admin.page.getByText("This Month").waitFor();
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
