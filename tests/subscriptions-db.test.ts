// Runs migration_subscriptions on a real Postgres engine (PGlite): own-rows only for subscriptions, IPTV admin only,
// renewal dates, client links, the kill switch, and exactly which fields a client can ever see.
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { addMonths } from "../src/lib/iptv";

let fail = 0;
const ok = (m: string, cond: unknown) => { if (!cond) { fail++; console.error(`FAIL ${m}`); } };
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };

const db = new PGlite();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [ADMIN, A, B, CLIENT] = [id(1), id(2), id(3), id(4)];

async function as<T = Record<string, unknown>>(uid: string | null | "service", sql: string, params: unknown[] = []): Promise<{ rows: T[]; error?: string }> {
  const role = uid === "service" ? "service_role" : uid ? "authenticated" : "anon";
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid && uid !== "service" ? uid : ""}', false); set role ${role};`);
  try { return { rows: (await db.query<T>(sql, params)).rows }; }
  catch (e) { return { rows: [], error: e instanceof Error ? e.message : String(e) }; }
  finally { await db.exec("reset role"); }
}
const admin = async (sql: string, params: unknown[] = []) => { await db.exec("reset role"); return (await db.query(sql, params)).rows as Record<string, unknown>[]; };
const call = (uid: string | null | "service", fn: string, ...args: unknown[]) => as(uid, `select ${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) as v`, args);
const day = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

async function main() {
  await db.exec(readFileSync("tests/sharing/stub.sql", "utf8"));
  await db.exec(readFileSync("supabase/migration_subscriptions.sql", "utf8"));
  await db.exec(readFileSync("supabase/migration_subscriptions.sql", "utf8")); // safe to run twice

  await admin("insert into roles (key, permissions, known_features) values ('user', array['loyalty'], array['loyalty']), ('assistant', array[]::text[], array[]::text[]), ('admin', array[]::text[], array[]::text[])");
  // roles from the migration
  await admin("update roles set permissions = permissions where key = 'user'");
  for (const [uid, name, role] of [[ADMIN, "owner", "admin"], [A, "alice", "user"], [B, "bob", "user"], [CLIENT, "maria", "iptv-client"]]) {
    await admin("insert into auth.users (id, email) values ($1, $2)", [uid, `${name}@example.com`]);
    await admin("insert into profiles (id, first_name, email, role) values ($1, $2, $3, $4)", [uid, name[0].toUpperCase() + name.slice(1), `${name}@example.com`, role]);
  }

  // ---- migration 37 upgrades what migration 36 already holds: one customer with one subscription, link and login kept
  await admin("insert into auth.users (id, email) values ($1, 'old@example.com')", [id(9)]);
  await admin("insert into profiles (id, first_name, email, role) values ($1, 'Old', 'old@example.com', 'iptv-client')", [id(9)]);
  await admin("insert into iptv_clients (id, created_by, client_name, contact, plan, date_subscribed, frequency, expire_date, share_token, share_enabled, client_user_id) values ($1, $2, 'Old Client', '+297 1', 'Basic', '2026-01-01', 'yearly', '2027-01-01', $3, true, $4)", [id(100), ADMIN, "d".repeat(40), id(9)]);
  await db.exec(readFileSync("supabase/migration_iptv_customers.sql", "utf8"));
  await db.exec(readFileSync("supabase/migration_iptv_customers.sql", "utf8")); // twice is fine
  await db.exec(readFileSync("supabase/migration_iptv_manage.sql", "utf8"));
  await db.exec(readFileSync("supabase/migration_iptv_manage.sql", "utf8")); // twice is fine
  eq("old client became one customer", (await admin("select name, contact, share_enabled, client_user_id from iptv_customers where id = $1", [id(100)]))[0], { name: "Old Client", contact: "+297 1", share_enabled: true, client_user_id: id(9) });
  eq("old client's subscription points at it", (await admin("select customer_id, plan from iptv_clients where id = $1", [id(100)]))[0], { customer_id: id(100), plan: "Basic" });
  ok("old link still opens", ((await call("service", "iptv_public_view", "d".repeat(40))).rows[0].v as Record<string, unknown>)?.first_name === "Old");
  eq("old login still sees it", (((await call(id(9), "my_iptv_subscriptions")).rows[0].v as Record<string, unknown>[])[0].subscriptions as unknown[]).length, 1);
  await admin("delete from iptv_customers where id = $1", [id(100)]);
  eq("deleting the customer deletes its subscriptions", Number((await admin("select count(*)::int as n from iptv_clients"))[0].n), 0);
  await admin("delete from auth.users where id = $1", [id(9)]);

  // ---- roles
  const roleRow = (await admin("select permissions, known_features, is_system from roles where key = 'iptv-client'"))[0];
  eq("client role has only the one permission", roleRow.permissions, ["iptv.mine"]);
  eq("client role count after two runs", (await admin("select count(*)::int as n from roles where key = 'iptv-client'"))[0].n, 1);

  // ---- personal subscriptions: own rows only
  const ins = "insert into subscriptions (user_id, name, price, currency, cycle, next_payment) values ($1, $2, 9.99, 'USD', 'monthly', '2026-12-01') returning id";
  await admin("update roles set permissions = array_append(permissions, 'subscriptions') where key = 'user'");
  ok("user can add their own", !(await as(A, ins, [A, "Netflix"])).error);
  ok("user cannot add for someone else", !!(await as(A, ins, [B, "Hack"])).error);
  await as(B, ins, [B, "Spotify"]);
  eq("alice sees only hers", (await as(A, "select name from subscriptions")).rows.map((r) => r.name), ["Netflix"]);
  eq("bob sees only his", (await as(B, "select name from subscriptions")).rows.map((r) => r.name), ["Spotify"]);
  ok("anonymous has no access", !!(await as(null, "select * from subscriptions")).error);
  ok("bad currency refused", !!(await as(A, "insert into subscriptions (user_id, name, price, currency, cycle, next_payment) values ($1,'x',1,'usd','monthly','2026-12-01')", [A])).error);
  ok("bad cycle refused", !!(await as(A, "insert into subscriptions (user_id, name, price, currency, cycle, next_payment) values ($1,'x',1,'USD','daily','2026-12-01')", [A])).error);
  ok("split over 20 refused", !!(await as(A, "insert into subscriptions (user_id, name, price, currency, cycle, next_payment, split_count) values ($1,'x',1,'USD','monthly','2026-12-01',21)", [A])).error);
  ok("bad cancel link refused", !!(await as(A, "insert into subscriptions (user_id, name, price, currency, cycle, next_payment, cancel_url) values ($1,'x',1,'USD','monthly','2026-12-01','javascript:alert(1)')", [A])).error);
  eq("alice cannot change bob's", (await as(A, "update subscriptions set name = 'x' where user_id = $1 returning id", [B])).rows.length, 0);

  // ---- IPTV is admin only
  const custSql = "insert into iptv_customers (created_by, name, contact) values ($1, 'Maria Lopez', '+297 555 0142') returning id";
  ok("normal user cannot add a customer", !!(await as(A, custSql, [A])).error);
  ok("client role cannot add a customer", !!(await as(CLIENT, custSql, [CLIENT])).error);
  ok("anonymous cannot add a customer", !!(await as(null, custSql, [A])).error);
  // a role given the "IPTV clients" option can manage clients; taking it away stops it at once
  await admin("update roles set permissions = array_append(permissions, 'iptv.manage') where key = 'user'");
  const delegated = await as<{ id: string }>(A, custSql, [A]);
  ok("a role given IPTV clients can add a customer", !delegated.error);
  ok("...and sees it", (await as(A, "select id from iptv_customers")).rows.length === 1);
  ok("...but another role still cannot", !!(await as(CLIENT, custSql, [CLIENT])).error);
  await admin("update roles set permissions = array_remove(permissions, 'iptv.manage') where key = 'user'");
  ok("taken away, it cannot add", !!(await as(A, custSql, [A])).error);
  eq("taken away, it sees nothing", (await as(A, "select id from iptv_customers")).rows.length, 0);
  await admin("delete from iptv_customers");
  const cust = await as<{ id: string }>(ADMIN, custSql, [ADMIN]);
  ok("admin can add a customer", !cust.error);
  const cu = cust.rows[0].id;
  const sub = "insert into iptv_clients (created_by, customer_id, plan, model, date_subscribed, frequency, expire_date, mac, order_no, donation, portal, device_id, location, notes) values ($1, $2, $3, $4, '2026-01-14', 'monthly', '2026-11-14', $5, 'A-1', 'J17454B8498X', 'https://p.example', '48213', 'Noord', 'secret note') returning id";
  ok("normal user cannot add a subscription", !!(await as(A, sub, [A, cu, "Basic", "Firestick", "00:1A:79:4C:2E:91"])).error);
  ok("client role cannot add a subscription", !!(await as(CLIENT, sub, [CLIENT, cu, "Basic", "Firestick", "00:1A:79:4C:2E:91"])).error);
  const s1 = await as<{ id: string }>(ADMIN, sub, [ADMIN, cu, "Basic", "Firestick", "00:1A:79:4C:2E:91"]);
  ok("admin can add a subscription", !s1.error);
  const cid = s1.rows[0].id;
  eq("normal user sees no customers", (await as(A, "select id from iptv_customers")).rows.length, 0);
  eq("normal user sees no subscriptions", (await as(A, "select id from iptv_clients")).rows.length, 0);
  ok("anonymous cannot read subscriptions", !!(await as(null, "select * from iptv_clients")).error);
  ok("a subscription needs a customer", !!(await as(ADMIN, "insert into iptv_clients (created_by, plan, date_subscribed, frequency, expire_date) values ($1, 'x', '2026-01-01', 'monthly', '2026-02-01')", [ADMIN])).error);
  ok("bad MAC refused", !!(await as(ADMIN, "update iptv_clients set mac = 'nonsense' where id = $1", [cid])).error);
  ok("donation reference with odd characters refused", !!(await as(ADMIN, "update iptv_clients set donation = 'x y<' where id = $1", [cid])).error);
  ok("expiry before start refused", !!(await as(ADMIN, "update iptv_clients set expire_date = '2025-01-01' where id = $1", [cid])).error);
  ok("bad frequency refused", !!(await as(ADMIN, "update iptv_clients set frequency = 'weekly' where id = $1", [cid])).error);
  ok("normal user cannot renew", !!(await call(A, "iptv_renew", cid, "2026-11-10")).error);
  ok("normal user cannot make a link", !!(await call(A, "iptv_create_link", cu)).error);
  ok("normal user cannot link a login", !!(await call(A, "iptv_link_user", cu, "alice@example.com")).error);

  // ---- renewals
  eq("renew before expiry adds a period to the old expiry", day((await call(ADMIN, "iptv_renew", cid, "2026-11-10")).rows[0].v), "2026-12-14");
  eq("renewal date recorded", day((await admin("select renewal_date from iptv_clients where id = $1", [cid]))[0].renewal_date), "2026-11-10");
  eq("renew after lapse counts from today", day((await call(ADMIN, "iptv_renew", cid, "2027-03-01")).rows[0].v), "2027-04-01");
  await admin("update iptv_clients set frequency = 'yearly', expire_date = '2026-02-28' where id = $1", [cid]);
  eq("yearly adds 12 months", day((await call(ADMIN, "iptv_renew", cid, "2026-02-01")).rows[0].v), "2027-02-28");
  await admin("update iptv_clients set frequency = 'monthly', expire_date = '2026-01-31' where id = $1", [cid]);
  eq("month end clamps (Jan 31 + 1 month)", day((await call(ADMIN, "iptv_renew", cid, "2026-01-01")).rows[0].v), "2026-02-28");
  for (const [d, n] of [["2026-01-31", 1], ["2024-02-29", 12], ["2024-02-29", 24], ["2026-08-31", 36], ["2026-12-31", 1], ["2026-05-31", 1]] as const) {
    const sql = (await admin("select (($1::date) + make_interval(months => $2))::date as d", [d, n]))[0].d;
    eq(`JS and SQL agree: ${d} + ${n}`, addMonths(d, n), day(sql));
  }
  ok("renewals are recorded", Number((await admin("select count(*)::int as n from iptv_renewals where client_id = $1", [cid]))[0].n) >= 4);
  ok("normal user cannot read renewals", (await as(A, "select * from iptv_renewals")).rows.length === 0);

  // ---- several subscriptions on one client, one link
  await admin("update iptv_clients set frequency = 'monthly', expire_date = '2026-11-14' where id = $1", [cid]);
  const s2 = (await as<{ id: string }>(ADMIN, sub, [ADMIN, cu, "Premium", "MAG 524", "00:1A:79:4C:2E:92"])).rows[0].id;
  await admin("update iptv_clients set expire_date = '2027-06-09', frequency = 'yearly' where id = $1", [s2]);
  await call(ADMIN, "iptv_renew", s2, "2027-07-01");
  const token = (await call(ADMIN, "iptv_create_link", cu)).rows[0].v as string;
  ok("token is long", token.length >= 32);
  eq("asking again gives the same address", (await call(ADMIN, "iptv_create_link", cu)).rows[0].v, token);
  ok("anonymous cannot open a link directly", !!(await call(null, "iptv_public_view", token)).error);
  ok("signed-in person cannot open a link directly", !!(await call(A, "iptv_public_view", token)).error);
  const view = (await call("service", "iptv_public_view", token)).rows[0].v as Record<string, unknown>;
  eq("a client sees only these fields", Object.keys(view).sort(), ["first_name", "owner_contact", "owner_name", "subscriptions"]);
  const subs = view.subscriptions as Record<string, unknown>[];
  eq("both subscriptions are on the one link", subs.length, 2);
  eq("soonest first", subs.map((x) => x.plan), ["Basic", "Premium"]);
  eq("each subscription shows only these fields", Object.keys(subs[0]).sort(), ["date_subscribed", "expire_date", "frequency", "history", "model", "plan"]);
  eq("first name only", view.first_name, "Maria");
  const text = JSON.stringify(view);
  for (const secret of ["00:1A", "48213", "A-1", "J17454B8498X", "secret note", "Noord", "p.example", "Lopez", "555"]) ok(`view hides ${secret}`, !text.includes(secret));
  ok("history is per subscription", Array.isArray(subs[1].history) && (subs[1].history as unknown[]).length === 1);
  eq("unknown token", (await call("service", "iptv_public_view", "x".repeat(40))).rows[0].v, null);
  eq("short token", (await call("service", "iptv_public_view", "abc")).rows[0].v, null);
  await admin("update app_settings set iptv_contact = '+297 555 0100'");
  eq("owner contact shown", ((await call("service", "iptv_public_view", token)).rows[0].v as Record<string, unknown>).owner_contact, "+297 555 0100");

  await admin("update app_settings set client_links_disabled = true");
  eq("kill switch stops links", (await call("service", "iptv_public_view", token)).rows[0].v, null);
  await admin("update app_settings set client_links_disabled = false");
  ok("link works again after the switch is back", (await call("service", "iptv_public_view", token)).rows[0].v !== null);
  await call(ADMIN, "iptv_stop_link", cu);
  eq("stopped link is dead", (await call("service", "iptv_public_view", token)).rows[0].v, null);
  const token2 = (await call(ADMIN, "iptv_create_link", cu)).rows[0].v as string;
  ok("a new address after stopping", token2 !== token);
  eq("old address stays dead", (await call("service", "iptv_public_view", token)).rows[0].v, null);

  // ---- a client with a login
  eq("unknown email is not linked", (await call(ADMIN, "iptv_link_user", cu, "nobody@example.com")).rows[0].v, false);
  eq("existing account is linked", (await call(ADMIN, "iptv_link_user", cu, " Maria@Example.com ")).rows[0].v, true);
  const mine = (await call(CLIENT, "my_iptv_subscriptions")).rows[0].v as Record<string, unknown>[];
  eq("client sees one customer record", mine.length, 1);
  eq("client sees the same safe fields", Object.keys(mine[0]).sort(), ["first_name", "owner_contact", "owner_name", "subscriptions"]);
  eq("with both subscriptions", (mine[0].subscriptions as unknown[]).length, 2);
  eq("another person sees none", (await call(A, "my_iptv_subscriptions")).rows[0].v, []);
  ok("anonymous cannot ask", !!(await call(null, "my_iptv_subscriptions")).error);
  ok("client cannot read the tables", (await as(CLIENT, "select * from iptv_clients")).rows.length === 0 && (await as(CLIENT, "select * from iptv_customers")).rows.length === 0);
  ok("client cannot change anything", (await as(CLIENT, "update iptv_clients set expire_date = '2099-01-01' where id = $1 returning id", [cid])).rows.length === 0);
  await admin("update app_settings set client_links_disabled = true");
  eq("kill switch stops logins", (await call(CLIENT, "my_iptv_subscriptions")).rows[0].v, []);
  await admin("update app_settings set client_links_disabled = false");
  await call(ADMIN, "iptv_unlink_user", cu);
  eq("unlinked client sees none", (await call(CLIENT, "my_iptv_subscriptions")).rows[0].v, []);

  // ---- cascades
  await call(ADMIN, "iptv_link_user", cu, "maria@example.com");
  await admin("delete from auth.users where id = $1", [CLIENT]);
  eq("deleting the login keeps the customer", (await admin("select client_user_id from iptv_customers where id = $1", [cu]))[0].client_user_id, null);
  await admin("delete from iptv_clients where id = $1", [s2]);
  eq("deleting one subscription keeps the other", Number((await admin("select count(*)::int as n from iptv_clients where customer_id = $1", [cu]))[0].n), 1);
  await admin("delete from iptv_customers where id = $1", [cu]);
  eq("deleting a customer removes subscriptions and history", [Number((await admin("select count(*)::int as n from iptv_clients"))[0].n), Number((await admin("select count(*)::int as n from iptv_renewals"))[0].n)], [0, 0]);
  await admin("delete from auth.users where id = $1", [A]);
  eq("deleting a person removes their subscriptions", (await admin("select count(*)::int as n from subscriptions where user_id = $1", [A]))[0].n, 0);

  console.log(fail ? `${fail} FAILED` : "subscriptions-db: all checks passed");
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
