// Runs migration_sharing + migration_sharing_safety on a real Postgres engine (PGlite): the activity history, the closed
// tables, who can see whose data, phone-notification rows, and scheduled account deletion.
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

let fail = 0;
let checks = 0;
const ok = (m: string, cond: unknown) => { checks++; if (!cond) { fail++; console.error(`FAIL ${m}`); } };
const eq = (m: string, a: unknown, b: unknown) => { checks++; if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };

const db = new PGlite();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [A, B, C] = [id(1), id(2), id(3)];

async function as<T = Record<string, unknown>>(uid: string | null | "service", sql: string, params: unknown[] = []): Promise<{ rows: T[]; error?: string }> {
  const role = uid === "service" ? "service_role" : uid ? "authenticated" : "anon";
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid && uid !== "service" ? uid : ""}', false); set role ${role};`);
  try {
    return { rows: (await db.query<T>(sql, params)).rows };
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message : String(e) };
  } finally {
    await db.exec("reset role");
  }
}
const admin = async (sql: string, params: unknown[] = []) => { await db.exec("reset role"); return (await db.query(sql, params)).rows as Record<string, unknown>[]; };
const call = (uid: string | null | "service", fn: string, ...args: unknown[]) => as(uid, `select ${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) as v`, args);
type Activity = { items: { kind: string; partner: string; item: string | null; partner_id: string | null }[]; more: boolean; partners: { id: string; name: string }[] };
const history = async (uid: string, filter = "all", partner: string | null = null, before: string | null = null, limit = 30) =>
  (await call(uid, "sharing_activity", filter, partner, before, limit)).rows[0]?.v as Activity;

async function main() {
  await db.exec(readFileSync("tests/sharing/stub.sql", "utf8"));
  await db.exec(readFileSync("supabase/migration_sharing.sql", "utf8"));
  await db.exec(readFileSync("supabase/migration_sharing_safety.sql", "utf8"));
  await db.exec(readFileSync("supabase/migration_sharing_safety.sql", "utf8")); // safe to run twice

  await admin("insert into roles (key, permissions) values ('user', array['sharing','loyalty']), ('admin', array[]::text[])");
  for (const [uid, name] of [[A, "alice"], [B, "bob"], [C, "carol"]]) {
    await admin("insert into auth.users (id, email) values ($1, $2)", [uid, `${name}@example.com`]);
    await admin("insert into profiles (id, first_name, email, role) values ($1, $2, $3, 'user')", [uid, name[0].toUpperCase() + name.slice(1), `${name}@example.com`]);
  }
  const card = id(101), trip = id(201), bobCard = id(102);
  await admin("insert into loyalty_cards (id, user_id, store_name, card_number) values ($1,$2,'Cafe','1234567'), ($3,$4,'Shop','5555')", [card, A, bobCard, B]);
  await admin("insert into trips (id, user_id, name, destination, start_date, end_date, budget, notes) values ($1,$2,'Miami','Florida','2026-12-01','2026-12-08',5000,'private')", [trip, A]);

  // ---- closed tables: nobody reads or writes them directly
  for (const t of ["share_activity"]) {
    ok(`signed-in person cannot read ${t}`, (await as(A, `select * from ${t}`)).error?.includes("permission denied"));
    ok(`signed-in person cannot write ${t}`, (await as(A, `insert into ${t} (owner_id, kind) values ('${A}', 'view')`)).error?.includes("permission denied"));
    ok(`anonymous cannot read ${t}`, (await as(null, `select * from ${t}`)).error?.includes("permission denied"));
  }
  for (const fn of ["sharing_item_label('card', null)", "share_activity_purge()", `push_user_by_email('a@b.c')`, `push_other_party('${id(9)}', '${A}')`, `push_view_owner('${A}', 'trip', '${id(9)}')`, "account_deletions_due()"]) {
    ok(`signed-in person cannot call ${fn}`, (await as(A, `select * from ${fn}`.replace("select * from ", "select ") )).error?.includes("permission denied"));
  }
  ok("anonymous cannot ask for history", (await call(null, "sharing_activity")).error?.includes("permission denied"));
  ok("anonymous cannot log a view", (await call(null, "log_share_view", "trip", trip)).error?.includes("permission denied"));

  // ---- pairing and sharing write the history by themselves
  await call(A, "set_sharing", true);
  await call(A, "invite_partner", "bob@example.com");
  const inv = (await admin("select id from partnerships limit 1"))[0].id as string;
  eq("alice's history has the invite, with the invited email", (await history(A)).items.map((i) => [i.kind, i.partner]), [["invite", "bob@example.com"]]);
  eq("bob's history is empty", (await history(B)).items.length, 0);
  await call(B, "respond_to_invite", inv, "accept");
  eq("alice is told bob accepted", (await history(A)).items.map((i) => [i.kind, i.partner]).slice(0, 1), [["accept", "Bob"]]);
  eq("bob gets no 'accept' entry", (await history(B)).items.length, 0);
  await call(A, "share_item", inv, "loyalty_card", card);
  await call(A, "share_item", inv, "trip", trip);
  await call(A, "share_item", inv, "trip", trip); // repeat does nothing
  const a1 = await history(A);
  eq("sharing twice is one entry per item", a1.items.filter((i) => i.kind === "share").map((i) => i.item).sort(), ["Cafe", "Miami"]);
  eq("bob still has no history of alice's sharing", (await history(B)).items.length, 0);

  // ---- views
  eq("a stranger cannot log a view", (await call(C, "log_share_view", "loyalty_card", card)).error?.includes("not_found"), true);
  eq("alice cannot log a view of her own card", (await call(A, "log_share_view", "loyalty_card", card)).error?.includes("not_found"), true);
  eq("bob cannot log a view of an unshared item", (await call(B, "log_share_view", "loyalty_card", bobCard)).error?.includes("not_found"), true);
  ok("bad kind is refused", (await call(B, "log_share_view", "document", card)).error?.includes("bad_kind"));
  eq("bob opening the shared card is logged", (await call(B, "log_share_view", "loyalty_card", card)).rows[0]?.v, true);
  eq("the same again within the hour is not", (await call(B, "log_share_view", "loyalty_card", card)).rows[0]?.v, false);
  eq("a different item is", (await call(B, "log_share_view", "trip", trip)).rows[0]?.v, true);
  const views = await history(A, "views");
  eq("alice sees both views, newest first", views.items.map((i) => [i.kind, i.partner, i.item]), [["view", "Bob", "Miami"], ["view", "Bob", "Cafe"]]);
  eq("bob sees none of that in his own history", (await history(B, "views")).items.length, 0);
  eq("changes filter hides views", (await history(A, "changes")).items.some((i) => i.kind === "view"), false);
  eq("partner filter finds bob's entries", (await history(A, "all", B)).items.every((i) => i.partner === "Bob"), true);
  eq("partner filter with someone else finds nothing", (await history(A, "all", C)).items.length, 0);
  eq("partners list names bob", (await history(A)).partners.map((p) => p.name), ["Bob"]);
  eq("bad filter is refused", (await call(A, "sharing_activity", "everything", null, null, 10)).error?.includes("bad_action"), true);
  await admin("update share_activity set created_at = created_at - interval '2 hours' where kind = 'view'");
  eq("after an hour the same item is logged again", (await call(B, "log_share_view", "loyalty_card", card)).rows[0]?.v, true);

  // ---- who can reach what: the server-only lookups work for the service role
  eq("service role finds a person by email", (await call("service", "push_user_by_email", " BOB@example.com ")).rows[0]?.v, B);
  eq("service role finds the other person in a pairing", (await call("service", "push_other_party", inv, A)).rows[0]?.v, B);
  eq("a stranger has no other party", (await call("service", "push_other_party", inv, C)).rows[0]?.v, null);
  eq("service role finds who owns what bob viewed", (await call("service", "push_view_owner", B, "trip", trip)).rows[0]?.v, A);
  const shareId = (await admin("select id from shares where kind = 'loyalty_card'"))[0].id as string;
  eq("service role finds who an unshare tells", (await call("service", "push_share_partner", shareId, A)).rows[0]?.v, B);
  eq("only the owner's side counts", (await call("service", "push_share_partner", shareId, B)).rows[0]?.v, null);

  // ---- unshare and end
  await call(A, "unshare_item", shareId);
  eq("unshare is in the history", (await history(A, "changes")).items[0]?.kind, "unshare");
  await call(B, "end_partnership", inv);
  eq("bob's history says he ended it", (await history(B)).items.map((i) => [i.kind, i.partner]), [["end", "Alice"]]);
  ok("alice's history says bob ended it", (await history(A, "changes")).items.some((i) => i.kind === "end_by_partner" && i.partner === "Bob"));

  // ---- pages of history
  for (let i = 0; i < 7; i++) await admin("insert into share_activity (owner_id, partner_id, kind, item_label, created_at) values ($1, $2, 'share', $3, now() - ($4 || ' minutes')::interval)", [C, A, `Item ${i}`, i + 1]);
  const p1 = await history(C, "all", null, null, 3);
  eq("first page has three", p1.items.length, 3);
  eq("and says there is more", p1.more, true);
  const last = (await admin("select min(created_at) as t from (select created_at from share_activity where owner_id = $1 order by created_at desc limit 3) x", [C]))[0].t as Date;
  const p2 = await history(C, "all", null, last.toISOString(), 10);
  eq("the next page has the other four", p2.items.length, 4);
  eq("and nothing more", p2.more, false);
  eq("limit is capped", (await call(C, "sharing_activity", "all", null, null, 100000)).rows[0] !== undefined, true);

  // ---- export of my own history only
  eq("export gives alice only her own rows", ((await call(A, "sharing_activity_export")).rows[0]?.v as unknown[]).length, (await admin("select count(*)::int as n from share_activity where owner_id = $1", [A]))[0].n);
  eq("carol's export has only carol's", ((await call(C, "sharing_activity_export")).rows[0]?.v as unknown[]).length, 7);
  ok("anonymous cannot export", (await call(null, "sharing_activity_export")).error?.includes("permission denied"));

  // ---- 12 month clean-up
  await admin("update share_activity set created_at = now() - interval '13 months' where owner_id = $1 and item_label = 'Item 0'", [C]);
  eq("the daily clean-up removes entries older than 12 months", (await call("service", "share_activity_purge")).rows[0]?.v, 1);
  ok("signed-in people cannot run the clean-up", (await call(A, "share_activity_purge")).error?.includes("permission denied"));

  // ---- phone notifications
  eq("new people get sensible defaults", (await admin("select push_prefs->>'invites' as i, push_prefs->>'shared' as s, push_prefs->>'views' as v from profiles where id = $1", [A]))[0], { i: "true", s: "true", v: "false" });
  await admin("insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://push.example/a', 'k', 's'), ($2, 'https://push.example/b', 'k', 's')", [A, B]);
  eq("alice sees only her own device", (await as(A, "select endpoint from push_subscriptions")).rows.map((r) => r.endpoint), ["https://push.example/a"]);
  eq("bob cannot see alice's device", (await as(B, "select endpoint from push_subscriptions where user_id = $1", [A])).rows.length, 0);
  ok("the browser cannot add a device itself", (await as(A, `insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ('${A}', 'https://push.example/x', 'k', 's')`)).error?.includes("permission denied"));
  ok("the browser cannot change a device", (await as(A, "update push_subscriptions set endpoint = 'https://x'")).error?.includes("permission denied"));
  eq("alice can switch her own device off", (await as(A, "delete from push_subscriptions returning endpoint")).rows.length, 1);
  eq("which does not touch bob's", (await admin("select count(*)::int as n from push_subscriptions"))[0].n, 1);

  // ---- scheduled deletion
  ok("a deletion sooner than the waiting time is refused", (await as(A, `insert into account_deletions (user_id, delete_after) values ('${A}', now() + interval '1 day')`)).error?.includes("row-level security"));
  ok("nobody can schedule someone else's account", (await as(B, `insert into account_deletions (user_id) values ('${A}')`)).error?.includes("row-level security"));
  eq("alice schedules her own with the default wait", (await as(A, `insert into account_deletions (user_id) values ('${A}') returning user_id`)).rows.length, 1);
  const days = (await admin("select extract(epoch from (delete_after - requested_at)) / 86400 as d from account_deletions where user_id = $1", [A]))[0].d as number;
  ok("the wait is 7 days", Math.round(days) === 7);
  eq("bob cannot see alice's scheduled deletion", (await as(B, "select * from account_deletions")).rows.length, 0);
  eq("alice sees hers", (await as(A, "select * from account_deletions")).rows.length, 1);
  ok("alice cannot bring the date forward", (await as(A, "update account_deletions set delete_after = now()")).error?.includes("permission denied"));
  eq("nothing is due yet", (await call("service", "account_deletions_due")).rows.length, 0);
  await admin("update account_deletions set delete_after = now() - interval '1 minute' where user_id = $1", [A]);
  eq("when it is due the daily job finds it", (await as("service", "select user_id from account_deletions_due()")).rows.map((r) => r.user_id), [A]);
  ok("signed-in people cannot list what is due", (await as(B, "select * from account_deletions_due()")).error?.includes("permission denied"));
  eq("cancelling removes it", (await as(A, "delete from account_deletions returning user_id")).rows.length, 1);

  // ---- removing an account takes its history, devices and shares with it and never fails on the history triggers
  await admin("insert into account_deletions (user_id) values ($1)", [A]);
  await call(B, "set_sharing", true);
  await call(B, "invite_partner", "alice@example.com");
  const inv2 = (await admin("select id from partnerships where requester_id = $1 and status = 'pending'", [B]))[0].id as string;
  await call(A, "respond_to_invite", inv2, "accept");
  await call(A, "share_item", inv2, "loyalty_card", card);
  let removed = true;
  try { await admin("delete from auth.users where id = $1", [A]); } catch (e) { removed = false; console.error(e); }
  ok("removing an account with shares and history works", removed);
  eq("its history is gone", (await admin("select count(*)::int as n from share_activity where owner_id = $1", [A]))[0].n, 0);
  eq("its shares are gone", (await admin("select count(*)::int as n from shares where owner_id = $1", [A]))[0].n, 0);
  eq("its scheduled deletion is gone", (await admin("select count(*)::int as n from account_deletions"))[0].n, 0);
  eq("other people's data is untouched", (await admin("select count(*)::int as n from loyalty_cards where user_id = $1", [B]))[0].n, 1);

  if (fail) { console.error(`${fail} of ${checks} sharing safety checks failed`); process.exit(1); }
  console.log(`all ${checks} sharing safety checks passed`);
}
main().catch((e) => { console.error(e); process.exit(1); });
