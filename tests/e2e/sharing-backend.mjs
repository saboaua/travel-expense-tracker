/**
 * Lets the end-to-end fake Supabase answer the sharing functions with the REAL SQL from supabase/migration_sharing.sql,
 * run on PGlite (a real Postgres engine). The browser and the app talk to the fake as usual; only calls to the sharing
 * functions are handed to PGlite, as the signed-in person, so the screens are tested against the real rules.
 */
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const TABLE_FUNCTIONS = new Set(["shared_loyalty_cards", "shared_trips"]);
export const SHARING_FUNCTIONS = new Set([
  "sharing_overview", "set_sharing", "invite_partner", "respond_to_invite", "end_partnership", "share_item", "unshare_item",
  "shared_loyalty_cards", "shared_trips", "shared_loyalty_photo_path", "sharing_available",
]);

export async function createSharingBackend(fake) {
  const db = new PGlite();
  await db.exec(readFileSync("tests/sharing/stub.sql", "utf8"));
  await db.exec(readFileSync("supabase/migration_sharing.sql", "utf8"));
  await db.exec("insert into roles (key, permissions) values ('family', array['sharing','loyalty']), ('user', array[]::text[]), ('admin', array[]::text[]) on conflict do nothing");

  // Copy what the fake holds into the database before each call (upsert, and remove only what was really deleted)
  async function sync() {
    const users = [...fake.users.values()];
    for (const u of users) await db.query("insert into auth.users (id, email) values ($1, $2) on conflict (id) do update set email = excluded.email", [u.id, u.email]);
    for (const p of fake.table("profiles")) {
      await db.query("insert into profiles (id, first_name, email, role) values ($1, $2, $3, $4) on conflict (id) do update set first_name = excluded.first_name, email = excluded.email, role = excluded.role", [p.id, p.first_name, p.email, p.role]);
    }
    const mirror = async (name, cols) => {
      const rows = fake.table(name);
      for (const r of rows) {
        await db.query(`insert into ${name} (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) on conflict (id) do update set ${cols.slice(1).map((c) => `${c} = excluded.${c}`).join(", ")}`, cols.map((c) => r[c] ?? null));
      }
      const ids = rows.map((r) => r.id);
      await db.query(`delete from ${name} where not (id = any($1::uuid[]))`, [ids]);
    };
    await mirror("loyalty_cards", ["id", "user_id", "store_name", "holder_name", "category", "card_number", "barcode_format", "color", "image_path"]);
    await mirror("trips", ["id", "user_id", "name", "destination", "start_date", "end_date"]);
    await mirror("personal_projects", ["id", "user_id", "kind", "name", "destination", "start_date", "end_date"]);
  }

  async function call(fn, args, userId) {
    await sync();
    const names = Object.keys(args || {});
    const list = names.map((n, i) => `${n} := $${i + 1}`).join(", ");
    const sql = TABLE_FUNCTIONS.has(fn) ? `select * from ${fn}(${list})` : `select ${fn}(${list}) as v`;
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${userId || ""}', false); set role ${userId ? "authenticated" : "anon"};`);
    try {
      const r = await db.query(sql, names.map((n) => args[n]));
      if (TABLE_FUNCTIONS.has(fn)) return { status: 200, body: r.rows };
      const v = r.rows[0]?.v;
      return v === null || v === undefined ? { status: 204, body: undefined } : { status: 200, body: v };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { status: /permission denied/.test(message) ? 403 : 400, body: { code: "P0001", message, details: null, hint: null } };
    } finally {
      await db.exec("reset role");
    }
  }

  return {
    db,
    call,
    /** Handler to give to the fake: answers sharing functions, leaves everything else alone. */
    hook: (fn, args, userId) => (SHARING_FUNCTIONS.has(fn) ? call(fn, args, userId) : undefined),
    /** The admin kill switch (app_settings.sharing_disabled) */
    setKill: async (on) => { await db.exec(`update app_settings set sharing_disabled = ${on ? "true" : "false"}`); },
    events: async () => (await db.query("select event_type, severity from security_events order by created_at")).rows,
  };
}
