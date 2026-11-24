// Runs supabase/migration_reminder_partners.sql on a real Postgres engine (PGlite): sharing a reminder with a partner.
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

let fail = 0;
const ok = (m: string, cond: unknown) => { if (!cond) { fail++; console.error(`FAIL ${m}`); } };
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`); } };
const db = new PGlite();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [A, B, C] = [id(1), id(2), id(3)];

async function as<T = Record<string, unknown>>(uid: string, sql: string, params: unknown[] = []): Promise<{ rows: T[]; error?: string }> {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
  try { return { rows: (await db.query<T>(sql, params)).rows }; }
  catch (e) { return { rows: [], error: e instanceof Error ? e.message : String(e) }; }
  finally { await db.exec("reset role"); }
}
const admin = async (sql: string, params: unknown[] = []) => { await db.exec("reset role"); return (await db.query(sql, params)).rows as Record<string, unknown>[]; };
const call = (uid: string, fn: string, ...args: unknown[]) => as(uid, `select ${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) as v`, args);

async function main() {
  await db.exec(readFileSync("tests/sharing/stub.sql", "utf8"));
  await db.exec(readFileSync("supabase/migration_sharing.sql", "utf8"));
  // Only the tables, policies and functions of the reminders migration (the photo storage part needs Supabase Storage)
  await db.exec(readFileSync("supabase/migration_reminders.sql", "utf8").split("-- Photos live in a private bucket")[0]);
  const mig = readFileSync("supabase/migration_reminder_partners.sql", "utf8");
  await db.exec(mig);
  await db.exec(mig); // safe to run twice
  await admin("insert into roles (key, permissions) values ('user', array['sharing'])");
  for (const [uid, name] of [[A, "alice"], [B, "bob"], [C, "carol"]]) {
    await admin("insert into auth.users (id, email) values ($1, $2)", [uid, `${name}@example.com`]);
    await admin("insert into profiles (id, first_name, email, role) values ($1, $2, $3, 'user')", [uid, name[0].toUpperCase() + name.slice(1), `${name}@example.com`]);
  }
  for (const u of [A, B, C]) await call(u, "set_sharing", true);
  await call(A, "invite_partner", "bob@example.com");
  const inv = (await admin("select id from partnerships where requester_id = $1", [A]))[0].id as string;
  await call(B, "respond_to_invite", inv, "accept");
  const R1 = id(101), R2 = id(102);
  await admin("insert into reminders (id, user_id, title, due_at) values ($1, $2, 'Take the trash out', now() + interval '1 day'), ($3, $2, 'Pay rent', now() + interval '2 day')", [R1, A, R2]);

  // sharing with the partner
  eq("share with an active partner", (await call(A, "share_reminder_partner", R1, inv, true)).rows[0]?.v, "ok");
  eq("the partner now sees it", (await as(B, "select title from reminders order by title")).rows, [{ title: "Take the trash out" }]);
  eq("owner sees who it is shared with", (await call(A, "my_reminder_partner_shares")).rows.length, 1);
  eq("the share row says Can mark done", (await as(A, "select partnership_id, can_complete from my_reminder_partner_shares()")).rows, [{ partnership_id: inv, can_complete: true }]);
  eq("the partner sees who sent it", (await as(B, "select reminder_id, owner_name from reminders_shared_with_me()")).rows, [{ reminder_id: R1, owner_name: "Alice" }]);
  eq("the owner is not listed as receiving their own", (await as(A, "select * from reminders_shared_with_me()")).rows, []);
  // view only
  await call(A, "share_reminder_partner", R1, inv, false);
  ok("view only: the partner cannot mark it done", (await call(B, "complete_reminder", R1)).error?.includes("not_allowed"));
  await call(A, "share_reminder_partner", R1, inv, true);
  ok("can mark done: the partner can", !(await call(B, "complete_reminder", R1)).error);
  // who can share what
  ok("only the owner can share a reminder", (await call(B, "share_reminder_partner", R2, inv, true)).error?.includes("not_allowed"));
  ok("a stranger sees nothing", (await as(C, "select id from reminders")).rows.length === 0);
  const fake = id(999);
  eq("an unknown partnership is not found", (await call(A, "share_reminder_partner", R2, fake, true)).rows[0]?.v, "not_found");
  await call(C, "invite_partner", "alice@example.com");
  const pending = (await admin("select id from partnerships where requester_id = $1", [C]))[0].id as string;
  eq("a pending partnership cannot be shared with", (await call(A, "share_reminder_partner", R2, pending, true)).rows[0]?.v, "not_found");
  eq("someone else's partnership cannot be used", (await call(B, "share_reminder_partner", R2, pending, true)).error?.includes("not_allowed") ? "refused" : "x", "refused");
  // switching off
  await call(A, "unshare_reminder_partner", R1, inv);
  eq("switched off: the partner no longer sees it", (await as(B, "select id from reminders")).rows.length, 0);
  eq("switched off: nothing is listed", (await as(A, "select * from my_reminder_partner_shares()")).rows.length, 0);
  // ending the partnership removes the shares
  await call(A, "share_reminder_partner", R1, inv, true);
  await call(A, "share_reminder_partner", R2, inv, true);
  await call(A, "end_partnership", inv);
  eq("ending the partnership stops every shared reminder", (await admin("select count(*)::int as n from reminder_shares"))[0].n, 0);
  eq("and the partner sees none", (await as(B, "select id from reminders")).rows.length, 0);
  ok("the functions are closed to anonymous callers", (await db.exec("reset role; set role anon;").then(() => db.query("select my_reminder_partner_shares()")).then(() => false, () => true)));
}
main().then(() => { if (fail) { console.error(`${fail} failed`); process.exit(1); } console.log("reminder partner sharing ok"); }).catch((e) => { console.error(e); process.exit(1); });
