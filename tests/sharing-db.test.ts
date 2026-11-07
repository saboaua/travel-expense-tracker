// Runs supabase/migration_sharing.sql on a real Postgres engine (PGlite) and tries to break it as different people.
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

let fail = 0;
let checks = 0;
const ok = (m: string, cond: unknown) => { checks++; if (!cond) { fail++; console.error(`FAIL ${m}`); } };
const eq = (m: string, a: unknown, b: unknown) => { checks++; if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };

const db = new PGlite();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [A, B, C, D, E, F, G] = [id(1), id(2), id(3), id(4), id(5), id(6), id(7)];

// Run as a signed-in person (or anonymous when uid is null). Returns rows, or { error } with the database message.
async function as<T = Record<string, unknown>>(uid: string | null, sql: string, params: unknown[] = []): Promise<{ rows: T[]; error?: string }> {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false); set role ${uid ? "authenticated" : "anon"};`);
  try {
    const r = await db.query<T>(sql, params);
    return { rows: r.rows };
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message : String(e) };
  } finally {
    await db.exec("reset role");
  }
}
const admin = async (sql: string, params: unknown[] = []) => { await db.exec("reset role"); return (await db.query(sql, params)).rows as Record<string, unknown>[]; };
const call = (uid: string | null, fn: string, ...args: unknown[]) =>
  as(uid, `select ${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) as v`, args);

async function main() {
await db.exec(readFileSync("tests/sharing/stub.sql", "utf8"));
await db.exec(readFileSync("supabase/migration_sharing.sql", "utf8"));
await db.exec(readFileSync("supabase/migration_sharing.sql", "utf8")); // safe to run twice

await admin("insert into roles (key, permissions) values ('user', array['sharing','loyalty']), ('limited', array['loyalty']), ('admin', array[]::text[])");
const people: [string, string, string][] = [[A, "alice", "user"], [B, "bob", "user"], [C, "carol", "user"], [D, "dan", "limited"], [E, "eve", "user"], [F, "fay", "user"], [G, "gus", "user"]];
for (const [uid, name, role] of people) {
  await admin("insert into auth.users (id, email) values ($1, $2)", [uid, `${name}@example.com`]);
  await admin("insert into profiles (id, first_name, email, role) values ($1, $2, $3, $4)", [uid, name[0].toUpperCase() + name.slice(1), `${name}@example.com`, role]);
}
const card1 = id(101), card2 = id(102), trip1 = id(201), ptrip = id(301), bobCard = id(103);
await admin("insert into loyalty_cards (id, user_id, store_name, card_number, image_path, notes_secret) values ($1,$2,'Cafe','1234567','a/cafe.webp','secret'), ($3,$2,'Gym','9999','a/gym.webp','secret'), ($4,$5,'Shop','5555',null,'secret')", [card1, A, card2, bobCard, B]);
await admin("insert into trips (id, user_id, name, destination, start_date, end_date, budget, notes) values ($1,$2,'Miami','Florida','2026-12-01','2026-12-08',5000,'private notes')", [trip1, A]);
await admin("insert into expenses (trip_id, user_id, merchant, amount, receipt_path) values ($1,$2,'Hotel',900,'a/receipt.jpg')", [trip1, A]);
await admin("insert into personal_projects (id, user_id, kind, name, destination, start_date, end_date, budget) values ($1,$2,'personal_trip','Family',  'Spain','2027-01-02','2027-01-09',3000)", [ptrip, A]);

// ---- 1. the tables are closed to the browser
for (const t of ["partnerships", "shares", "sharing_settings"]) {
  ok(`signed-in person cannot read ${t} directly`, (await as(A, `select * from ${t}`)).error?.includes("permission denied"));
  ok(`signed-in person cannot write ${t} directly`, (await as(A, `delete from ${t}`)).error?.includes("permission denied"));
  ok(`anonymous cannot read ${t}`, (await as(null, `select * from ${t}`)).error?.includes("permission denied"));
}
ok("anonymous cannot call invite_partner", (await call(null, "invite_partner", "bob@example.com")).error?.includes("permission denied"));
ok("signed-in person cannot call internal gate", (await as(A, "select sharing_gate()")).error?.includes("permission denied"));
ok("signed-in person cannot call the integrity check", (await as(A, "select sharing_integrity_check()")).error?.includes("permission denied"));
ok("signed-in person cannot trip the failsafe by hand", (await as(A, "select sharing_trip_failsafe('x','{}')")).error?.includes("permission denied"));

// ---- 2. role and switch
eq("role without the sharing option is refused", (await call(D, "sharing_overview")).rows[0]?.v, { available: false });
ok("role without the sharing option cannot invite", (await call(D, "invite_partner", "alice@example.com")).error?.includes("sharing_off"));
ok("not signed in is refused", (await call(null, "sharing_overview")).error?.includes("permission denied"));

// ---- 3. inviting
ok("cannot invite before turning sharing on", (await call(A, "invite_partner", "bob@example.com")).error?.includes("enable_first"));
ok("turn sharing on", !(await call(A, "set_sharing", true)).error);
ok("bad email", (await call(A, "invite_partner", "not-an-email")).error?.includes("bad_email"));
ok("own email", (await call(A, "invite_partner", " ALICE@example.com ")).error?.includes("self_invite"));
const known = await call(A, "invite_partner", " BOB@Example.com ");
const unknown = await call(A, "invite_partner", "nobody@nowhere.test");
eq("known email answer", known.rows[0]?.v, "sent");
eq("unknown email gives the very same answer", unknown.rows[0]?.v, "sent");
eq("repeat invite is a quiet no-op with the same answer", (await call(A, "invite_partner", "bob@example.com")).rows[0]?.v, "sent");
eq("only two rows were created", (await admin("select count(*)::int as n from partnerships"))[0].n, 2);

// ---- 4. who sees the invite
type Overview = { available: boolean; enabled: boolean; incoming: { id: string; from_name: string; from_email: string }[]; partners: { id: string; status: string; name: string | null; email: string | null; direction: string }[]; shares: unknown[]; accepted: unknown[] };
const ov = async (uid: string) => (await call(uid, "sharing_overview")).rows[0]?.v as Overview;
const bobView = await ov(B);
eq("bob sees one incoming invite", bobView.incoming.length, 1);
eq("with alice's name", bobView.incoming[0]?.from_name, "Alice");
eq("carol (a stranger) sees nothing", (await ov(C)).incoming.length, 0);
eq("carol sees no partners", (await ov(C)).partners.length, 0);
const aliceView = await ov(A);
eq("alice sees both invites as pending", aliceView.partners.map((p) => p.status), ["pending", "pending"]);
eq("pending invite shows no name for the invited person", aliceView.partners.every((p) => p.name === null), true);
const inviteId = bobView.incoming[0].id;

// ---- 5. nothing is visible before acceptance
ok("cannot share before the invite is accepted", (await call(A, "share_item", inviteId, "loyalty_card", card1)).error?.includes("not_found"));
eq("bob sees no cards before accepting", (await as(B, "select * from shared_loyalty_cards()")).rows.length, 0);
ok("carol cannot accept alice's invite to bob", (await call(C, "respond_to_invite", inviteId, "accept")).error?.includes("not_found"));
ok("alice cannot accept her own invite", (await call(A, "respond_to_invite", inviteId, "accept")).error?.includes("not_found"));
ok("bad action", (await call(B, "respond_to_invite", inviteId, "maybe")).error?.includes("bad_action"));

// ---- 6. accept, then share one item only
ok("bob accepts", !(await call(B, "respond_to_invite", inviteId, "accept")).error);
eq("bob's sharing is now on", (await ov(B)).enabled, true);
eq("alice sees bob as approved by name", (await ov(A)).partners.filter((p) => p.status === "active").map((p) => p.name), ["Bob"]);
eq("alice is told once that it was accepted", (await ov(A)).accepted.length, 1);
eq("approving shares nothing", (await as(B, "select * from shared_loyalty_cards()")).rows.length, 0);
eq("approving shares no trips either", (await as(B, "select * from shared_trips()")).rows.length, 0);

ok("alice shares card 1", !(await call(A, "share_item", inviteId, "loyalty_card", card1)).error);
const seen = (await as<Record<string, unknown>>(B, "select * from shared_loyalty_cards()")).rows;
eq("bob sees exactly the shared card", seen.map((r) => r.store_name), ["Cafe"]);
eq("bob sees the number and barcode", [seen[0]?.card_number, seen[0]?.barcode_format], ["1234567", "CODE128"]);
eq("bob sees who shared it", seen[0]?.shared_by, "Alice");
eq("the card result has no owner id, notes or photo path", Object.keys(seen[0] || {}).sort(),
  ["barcode_format", "card_id", "card_number", "category", "color", "has_image", "holder_name", "share_id", "shared_by", "store_name"]);
eq("the unshared card stays hidden", seen.some((r) => r.store_name === "Gym"), false);
eq("carol still sees nothing", (await as(C, "select * from shared_loyalty_cards()")).rows.length, 0);
eq("alice does not get her own cards back from the shared list", (await as(A, "select * from shared_loyalty_cards()")).rows.length, 0);
eq("photo path only for the person it is shared with", (await call(B, "shared_loyalty_photo_path", card1)).rows[0]?.v, "a/cafe.webp");
eq("photo path for the unshared card is empty", (await call(B, "shared_loyalty_photo_path", card2)).rows[0]?.v, null);
eq("photo path for a stranger is empty", (await call(C, "shared_loyalty_photo_path", card1)).rows[0]?.v, null);
eq("photo path for the owner through this route is empty", (await call(A, "shared_loyalty_photo_path", card1)).rows[0]?.v, null);

// ---- 7. read only: the partner cannot change or take over anything
ok("bob cannot share alice's card", (await call(B, "share_item", inviteId, "loyalty_card", card1)).error?.includes("not_found"));
ok("bob cannot share a card with himself as owner either", (await call(B, "share_item", inviteId, "loyalty_card", card2)).error?.includes("not_found"));
ok("bob cannot unshare alice's share", (await call(B, "unshare_item", (await admin("select id from shares limit 1"))[0].id)).error?.includes("not_found"));
ok("unknown kind", (await call(A, "share_item", inviteId, "document", card1)).error?.includes("bad_kind"));

// ---- 8. trips: four columns, nothing from expenses
ok("alice shares her business trip", !(await call(A, "share_item", inviteId, "trip", trip1)).error);
ok("alice shares her personal trip", !(await call(A, "share_item", inviteId, "personal_trip", ptrip)).error);
const trips = (await as<Record<string, unknown>>(B, "select * from shared_trips()")).rows;
eq("bob sees both trips", trips.map((t) => t.name).sort(), ["Family", "Miami"]);
eq("a trip result has only these columns", Object.keys(trips[0] || {}).sort(), ["destination", "end_date", "kind", "name", "share_id", "shared_by", "start_date", "trip_id"]);
const flat = JSON.stringify(trips);
for (const secret of ["5000", "3000", "private notes", "Hotel", "900", "receipt", "budget", "notes"]) ok(`trip result never contains ${secret}`, !flat.includes(secret));
eq("carol sees no trips", (await as(C, "select * from shared_trips()")).rows.length, 0);
ok("cannot share someone else's trip", (await call(B, "share_item", inviteId, "trip", trip1)).error?.includes("not_found"));
ok("cannot share a home project as a trip", (await call(A, "share_item", inviteId, "personal_trip", id(999))).error?.includes("not_found"));

// ---- 9. revoking one item
const cafeShare = seen[0].share_id as string;
ok("alice stops sharing the card", !(await call(A, "unshare_item", cafeShare)).error);
eq("bob no longer sees the card", (await as(B, "select * from shared_loyalty_cards()")).rows.length, 0);
eq("bob can no longer get the photo path", (await call(B, "shared_loyalty_photo_path", card1)).rows[0]?.v, null);
eq("the trips are still shared", (await as(B, "select * from shared_trips()")).rows.length, 2);

// ---- 10. deleting an item removes its share
await admin("delete from trips where id = $1", [trip1]);
eq("deleting the trip removes its share", (await admin("select count(*)::int as n from shares where kind = 'trip'"))[0].n, 0);
eq("bob sees only the personal trip", (await as(B, "select name from shared_trips()")).rows.map((r) => r.name), ["Family"]);

// ---- 11. ending the pairing takes everything with it
ok("bob ends the pairing", !(await call(B, "end_partnership", inviteId)).error);
eq("no shares are left", (await admin("select count(*)::int as n from shares"))[0].n, 0);
eq("bob sees no trips", (await as(B, "select * from shared_trips()")).rows.length, 0);
ok("cannot end it twice", (await call(B, "end_partnership", inviteId)).error?.includes("not_found"));
ok("cannot share into an ended pairing", (await call(A, "share_item", inviteId, "loyalty_card", card1)).error?.includes("not_found"));

// ---- 12. block, decline, and re-inviting
await call(A, "invite_partner", "carol@example.com");
const carolInvite = (await ov(C)).incoming[0].id;
ok("carol blocks alice", !(await call(C, "respond_to_invite", carolInvite, "block")).error);
eq("alice cannot see the block", (await ov(A)).partners.some((p) => p.email === "carol@example.com" && p.status !== "pending") || false, false);
const before = (await admin("select count(*)::int as n from partnerships"))[0].n;
eq("re-inviting a blocker answers 'sent'", (await call(A, "invite_partner", "carol@example.com")).rows[0]?.v, "sent");
eq("but creates nothing", (await admin("select count(*)::int as n from partnerships"))[0].n, before);
eq("carol sees no new invite", (await ov(C)).incoming.length, 0);

// ---- 13. sending limits
const limits = await (async () => {
  const out: string[] = [];
  for (const n of ["x1", "x2", "x3", "x4", "x5", "x6"]) out.push((await call(A, "invite_partner", `${n}@example.com`)).error || "sent");
  return out;
})();
ok("daily invite limit stops the sixth invite in 24 hours", limits.some((r) => r.includes("daily_limit")));
await admin("update partnerships set created_at = now() - interval '2 days' where requester_id = $1", [A]);

// ---- 14. partner limit of 4
await admin("delete from partnerships");
await call(E, "set_sharing", true);
const ids: string[] = [];
for (const who of ["bob", "carol", "dan2", "fay", "gus"]) {
  // dan has no sharing role, so use the five available people besides eve
  void who;
}
const others = [A, B, C, F, G];
for (const o of others.slice(0, 4)) {
  await call(o, "set_sharing", true);
  await admin("insert into partnerships (requester_id, invitee_email, invitee_id, status) values ($1, $2, $3, 'active')", [E, (await admin("select email from auth.users where id = $1", [o]))[0].email, o]);
}
eq("eve has four partners", (await admin("select count(*)::int as n from partnerships where status = 'active'"))[0].n, 4);
ok("a fifth invite is refused", (await call(E, "invite_partner", "someone@example.com")).error?.includes("partner_limit"));
void ids;
await admin("delete from partnerships");

// ---- 15. expiry
await call(A, "set_sharing", true);
await call(A, "invite_partner", "bob@example.com");
await admin("update partnerships set expires_at = now() - interval '1 minute'");
eq("an expired invite is not shown to bob", (await ov(B)).incoming.length, 0);
ok("an expired invite cannot be accepted", (await call(B, "respond_to_invite", (await admin("select id from partnerships limit 1"))[0].id, "accept")).error?.includes("not_found"));
await admin("delete from partnerships");

// ---- 16. turning sharing off ends everything
await call(A, "invite_partner", "bob@example.com");
const again = (await ov(B)).incoming[0].id;
await call(B, "respond_to_invite", again, "accept");
await call(A, "share_item", again, "loyalty_card", card1);
eq("bob sees the card", (await as(B, "select * from shared_loyalty_cards()")).rows.length, 1);
await call(A, "set_sharing", false);
eq("alice turning sharing off ends the pairing", (await admin("select status from partnerships"))[0].status, "ended");
eq("and removes the shares", (await admin("select count(*)::int as n from shares"))[0].n, 0);
eq("bob sees nothing", (await as(B, "select * from shared_loyalty_cards()")).rows.length, 0);

// ---- 17. the whole-app kill switch
await call(A, "set_sharing", true);
await admin("update app_settings set sharing_disabled = true");
ok("everything stops while the kill switch is on", (await call(A, "invite_partner", "bob@example.com")).error?.includes("sharing_off"));
ok("reads stop too", (await as(B, "select * from shared_loyalty_cards()")).error?.includes("sharing_off"));
eq("overview says unavailable", (await call(A, "sharing_overview")).rows[0]?.v, { available: false });
await admin("update app_settings set sharing_disabled = false");

// ---- 18. the integrity check and the failsafe
await admin("delete from partnerships");
await call(A, "invite_partner", "bob@example.com");
const third = (await ov(B)).incoming[0].id;
await call(B, "respond_to_invite", third, "accept");
await call(A, "share_item", third, "loyalty_card", card1);
eq("healthy data passes the integrity check", (await admin("select sharing_integrity_check() as n"))[0].n, 0);
eq("sharing is still on", (await admin("select sharing_disabled from app_settings"))[0].sharing_disabled, false);
await admin("insert into shares (partnership_id, owner_id, kind, item_id) values ($1, $2, 'loyalty_card', $3)", [third, C, bobCard]); // a share that should not exist
const bad = (await admin("select sharing_integrity_check() as n"))[0].n as number;
ok("a share that does not belong is found", bad >= 1);
eq("sharing switches itself off", (await admin("select sharing_disabled from app_settings"))[0].sharing_disabled, true);
ok("a leak_blocked event is written", (await admin("select count(*)::int as n from security_events where event_type = 'leak_blocked'"))[0].n as number >= 1);
ok("readers are now stopped", (await as(B, "select * from shared_loyalty_cards()")).error?.includes("sharing_off"));
// a forged share row is never returned even before the check runs
await admin("update app_settings set sharing_disabled = false");
const leaked = (await as(B, "select card_id from shared_loyalty_cards()")).rows.map((r) => r.card_id);
ok("a forged share for someone else's card is not returned", !leaked.includes(bobCard));

// ---- 19. deleting an account removes its pairings
await admin("delete from shares where owner_id = $1", [C]);
await admin("delete from auth.users where id = $1", [A]);
eq("alice's pairings are gone with her account", (await admin("select count(*)::int as n from partnerships where requester_id = $1", [A]))[0].n, 0);

  // ---- 20. the failsafe inside the read functions really works: weaken the first query on purpose and check the second check catches it
  {
    const sql = readFileSync("supabase/migration_sharing.sql", "utf8");
    const own = "and ((p.requester_id = uid and s.owner_id = p.invitee_id) or (p.invitee_id = uid and s.owner_id = p.requester_id))";
    ok("the ownership condition is present to weaken", sql.includes(own));
    const weak = sql.split(own).join("and true");
    const db2 = new PGlite();
    await db2.exec(readFileSync("tests/sharing/stub.sql", "utf8"));
    await db2.exec(weak);
    await db2.exec("insert into roles (key, permissions) values ('user', array['sharing'])");
    for (const [uid, name] of [[A, "alice"], [B, "bob"], [C, "carol"]]) {
      await db2.query("insert into auth.users (id, email) values ($1, $2)", [uid, `${name}@example.com`]);
      await db2.query("insert into profiles (id, first_name, email, role) values ($1, $2, $3, 'user')", [uid, name, `${name}@example.com`]);
    }
    await db2.query("insert into loyalty_cards (id, user_id, store_name, card_number) values ($1, $2, 'Carol card', '1')", [id(401), C]);
    await db2.query("insert into partnerships (id, requester_id, invitee_email, invitee_id, status) values ($1, $2, 'bob@example.com', $3, 'active')", [id(501), A, B]);
    await db2.query("insert into shares (partnership_id, owner_id, kind, item_id) values ($1, $2, 'loyalty_card', $3)", [id(501), C, id(401)]);
    await db2.exec(`select set_config('request.jwt.claim.sub', '${B}', false); set role authenticated;`);
    let rows: unknown[] = [];
    try { rows = (await db2.query("select * from shared_loyalty_cards()")).rows; } catch (e) { ok(`failsafe call should not raise: ${e}`, false); }
    await db2.exec("reset role");
    eq("with a weakened first query, the second check still returns nothing", rows.length, 0);
    eq("and sharing switched itself off", (await db2.query<{ sharing_disabled: boolean }>("select sharing_disabled from app_settings")).rows[0].sharing_disabled, true);
    eq("and wrote a critical leak_blocked event", (await db2.query<{ n: number }>("select count(*)::int as n from security_events where event_type = 'leak_blocked' and severity = 'critical'")).rows[0].n, 1);
    // same for trips
    await db2.exec("update app_settings set sharing_disabled = false");
    await db2.query("insert into trips (id, user_id, name, destination, start_date, end_date) values ($1, $2, 'Carol trip', 'X', '2026-12-01', '2026-12-02')", [id(402), C]);
    await db2.query("insert into shares (partnership_id, owner_id, kind, item_id) values ($1, $2, 'trip', $3)", [id(501), C, id(402)]);
    await db2.exec(`select set_config('request.jwt.claim.sub', '${B}', false); set role authenticated;`);
    const tr = (await db2.query("select * from shared_trips()")).rows;
    await db2.exec("reset role");
    eq("a forged trip share is caught the same way", tr.length, 0);
    eq("and sharing is off again", (await db2.query<{ sharing_disabled: boolean }>("select sharing_disabled from app_settings")).rows[0].sharing_disabled, true);
  }

if (fail) { console.error(`${fail} of ${checks} sharing database checks failed`); process.exit(1); }
console.log(`all ${checks} sharing database checks passed`);
}
main().catch((e) => { console.error(e); process.exit(1); });
