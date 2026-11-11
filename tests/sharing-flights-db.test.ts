// Runs migrations 45 and 46 on a real Postgres engine (PGlite): a partner sees a shared trip's flight details and nothing private.
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

let fail = 0;
const ok = (m: string, cond: unknown) => { if (!cond) { fail++; console.error(`FAIL ${m}`); } else console.log(`PASS ${m}`); };
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } else console.log(`PASS ${m}`); };

const db = new PGlite();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [A, B, C] = [id(1), id(2), id(3)];

async function as<T = Record<string, unknown>>(uid: string | null, sql: string, params: unknown[] = []): Promise<{ rows: T[]; error?: string }> {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false); set role ${uid ? "authenticated" : "anon"};`);
  try { return { rows: (await db.query<T>(sql, params)).rows }; }
  catch (e) { return { rows: [], error: e instanceof Error ? e.message : String(e) }; }
  finally { await db.exec("reset role"); }
}
const admin = async (sql: string, params: unknown[] = []) => { await db.exec("reset role"); return (await db.query(sql, params)).rows as Record<string, unknown>[]; };
const call = (uid: string | null, fn: string, ...args: unknown[]) => as(uid, `select ${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) as v`, args);

async function main() {
  await db.exec(readFileSync("tests/sharing/stub.sql", "utf8"));
  await db.exec(readFileSync("supabase/migration_sharing.sql", "utf8"));
  await db.exec(readFileSync("supabase/migration_trip_flights.sql", "utf8"));
  await db.exec(readFileSync("supabase/migration_sharing_flights.sql", "utf8"));
  await db.exec(readFileSync("supabase/migration_sharing_flights.sql", "utf8")); // safe to run twice

  await admin("insert into roles (key, permissions) values ('user', array['sharing'])");
  for (const [uid, name] of [[A, "alice"], [B, "bob"], [C, "carol"]]) {
    await admin("insert into auth.users (id, email) values ($1, $2)", [uid, `${name}@example.com`]);
    await admin("insert into profiles (id, first_name, email, role) values ($1, $2, $3, 'user')", [uid, name[0].toUpperCase() + name.slice(1), `${name}@example.com`]);
  }
  const shared = id(201), hidden = id(202);
  await admin("insert into trips (id, user_id, name, start_date, end_date) values ($1,$2,'Panama','2026-11-17','2026-11-24'), ($3,$2,'Secret','2026-12-01','2026-12-03')", [shared, A, hidden]);
  const flight = (n: number, trip: string, num: string, leg: string) => admin(
    "insert into trip_flights (id, trip_id, user_id, leg, flight_number, flight_date, dep_iata, arr_iata, dep_local, arr_local, dep_offset, arr_offset, pnr, seat, cabin, status, source) values ($1,$2,$3,$4,$5,'2026-11-17','AUA','PTY','2026-11-17T09:45','2026-11-17T10:40',-240,-300,'WK89L2','04A','Business','scheduled','auto')",
    [id(n), trip, A, leg, num]);
  await flight(301, shared, "CM 312", "outbound");
  await flight(302, hidden, "CM 999", "outbound");

  // before sharing: nothing
  ok("alice turns sharing on", !(await call(A, "set_sharing", true)).error);
  await call(A, "invite_partner", "bob@example.com");
  const overview = (await call(B, "sharing_overview")).rows[0]?.v as { incoming: { id: string }[] };
  const invite = overview.incoming[0].id;
  eq("no flights before the invite is accepted", (await as(B, "select * from shared_trip_flights()")).rows.length, 0);
  ok("bob accepts", !(await call(B, "respond_to_invite", invite, "accept")).error);
  eq("accepting alone shares no flights", (await as(B, "select * from shared_trip_flights()")).rows.length, 0);

  // share one trip
  ok("alice shares one trip", !(await call(A, "share_item", invite, "trip", shared)).error);
  const rows = (await as<Record<string, unknown>>(B, "select * from shared_trip_flights()")).rows;
  eq("bob sees the flight of the shared trip only", rows.map((r) => r.flight_number), ["CM 312"]);
  eq("with the details a partner needs", [rows[0]?.dep_iata, rows[0]?.arr_iata, rows[0]?.dep_gate ?? null, rows[0]?.shared_by], ["AUA", "PTY", null, "Alice"]);
  const keys = Object.keys(rows[0] || {});
  ok("no confirmation code, seat, cabin, alerts or owner id come back", !["pnr", "seat", "cabin", "alerts", "user_id", "last_alert_key"].some((k) => keys.includes(k)));
  eq("carol (a stranger) sees nothing", (await as(C, "select * from shared_trip_flights()")).rows.length, 0);
  eq("alice does not get her own flights back from the shared list", (await as(A, "select * from shared_trip_flights()")).rows.length, 0);
  ok("anonymous cannot call it", (await as(null, "select * from shared_trip_flights()")).error?.includes("permission denied"));
  ok("bob cannot read the table directly", (await as(B, "select * from trip_flights")).error?.includes("permission") || (await as(B, "select * from trip_flights")).rows.length === 0);

  // stop sharing the trip
  const shareId = (await admin("select id from shares limit 1"))[0].id as string;
  ok("alice stops sharing the trip", !(await call(A, "unshare_item", shareId)).error);
  eq("the flights disappear with the share", (await as(B, "select * from shared_trip_flights()")).rows.length, 0);

  console.log(fail ? `${fail} FAILED` : "sharing-flights-db: all checks passed");
  process.exit(fail ? 1 : 0);
}
main();
