/**
 * A small in-memory stand-in for Supabase (Auth, PostgREST, Storage), just enough for the end-to-end tests.
 * It does not enforce row-level security; that belongs to the database and is covered by the SQL migrations.
 */
import http from "node:http";
import { randomUUID } from "node:crypto";

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = () => Math.floor(Date.now() / 1000);
export const SERVICE_KEY = "service-role-key";
export const ANON_KEY = "anon-key";

// Tables whose primary key is not "id": an upsert without on_conflict matches on it
const PRIMARY_KEYS = { telegram_pending: "telegram_id", telegram_notify_prefs: "user_id" };

// table -> relation name -> how rows are joined
const RELATIONS = {
  trips: { expenses: { many: "trip_id" } },
  expenses: { trips: { one: "trip_id" } },
  personal_projects: { personal_expenses: { many: "project_id" } },
};

function splitTop(s) {
  const out = [];
  let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim());
}

export function createFakeSupabase() {
  const db = {};
  const users = new Map(); // id -> { id, email, password }
  const tokens = new Map(); // access token -> user id
  const refresh = new Map(); // refresh token -> user id
  const storage = new Map();
  const log = [];

  const table = (name) => (db[name] ||= []);
  const seed = (name, rows) => { db[name] = rows.map((r) => ({ id: randomUUID(), created_at: new Date().toISOString(), ...r })); };

  function addUser({ email, password, role = "user", full_name }) {
    const id = randomUUID();
    users.set(id, { id, email, password });
    table("profiles").push({ id, email, role, full_name: full_name || email.split("@")[0], first_name: null, last_name: null, avatar_url: null, must_change_password: false, created_at: new Date().toISOString() });
    return id;
  }

  const userJson = (u) => ({ id: u.id, aud: "authenticated", role: "authenticated", email: u.email, app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" });

  function session(u) {
    const exp = now() + 3600;
    const access = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: u.id, role: "authenticated", aud: "authenticated", exp, iat: exp - 3600, email: u.email })}.${randomUUID()}`;
    const rt = randomUUID();
    tokens.set(access, u.id);
    refresh.set(rt, u.id);
    return { access_token: access, token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: rt, user: userJson(u) };
  }

  /* ---------------- PostgREST ---------------- */

  function matches(row, col, spec) {
    const dot = spec.indexOf(".");
    const op = spec.slice(0, dot), val = spec.slice(dot + 1);
    const v = row[col];
    const num = (x) => (typeof v === "number" || /^-?\d+(\.\d+)?$/.test(String(x)) ? Number(x) : x);
    switch (op) {
      case "eq": return String(v) === val;
      case "neq": return String(v) !== val;
      case "gt": return v != null && v > num(val);
      case "gte": return v != null && v >= num(val);
      case "lt": return v != null && v < num(val);
      case "lte": return v != null && v <= num(val);
      case "is": return val === "null" ? v == null : String(v) === val;
      case "in": return val.replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/^"|"$/g, "")).includes(String(v));
      case "ilike": return new RegExp("^" + val.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*") + "$", "i").test(String(v ?? ""));
      case "like": return new RegExp("^" + val.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*") + "$").test(String(v ?? ""));
      default: return true;
    }
  }

  function project(tableName, row, select) {
    if (!select || select === "*") return { ...row };
    const out = {};
    for (const item of splitTop(select)) {
      if (item === "*") { Object.assign(out, row); continue; }
      const emb = item.match(/^(?:(\w+):)?(\w+)(?:![\w]+)?\((.*)\)$/s);
      if (emb) {
        const [, alias, rel, inner] = emb;
        const def = RELATIONS[tableName]?.[rel];
        if (!def) continue;
        if (def.many) out[alias || rel] = table(rel).filter((r) => r[def.many] === row.id).map((r) => project(rel, r, inner));
        else { const t = table(rel).find((r) => r.id === row[def.one]); out[alias || rel] = t ? project(rel, t, inner) : null; }
        continue;
      }
      const m = item.match(/^(?:(\w+):)?(\w+)$/);
      if (m) out[m[1] || m[2]] = row[m[2]] ?? null;
    }
    return out;
  }

  function rest(req, res, url, body) {
    const name = url.pathname.replace("/rest/v1/", "");
    if (name.startsWith("rpc/")) {
      const fn = name.slice(4);
      if (fn === "find_duplicate_expenses") return send(res, 200, []);
      return send(res, 404, { code: "PGRST202", message: `Could not find the function public.${fn} in the schema cache` });
    }
    if (!(name in db)) return send(res, 404, { code: "PGRST205", message: `Could not find the table 'public.${name}' in the schema cache` });
    const rows = table(name);
    const filters = [];
    for (const [k, v] of url.searchParams) if (!["select", "order", "limit", "offset", "on_conflict", "columns"].includes(k) && /^(eq|neq|gt|gte|lt|lte|is|in|ilike|like)\./.test(v)) filters.push([k, v]);
    let hit = rows.filter((r) => filters.every(([c, s]) => matches(r, c, s)));
    const order = url.searchParams.get("order");
    if (order) for (const part of order.split(",").reverse()) {
      const [c, dir] = part.split(".");
      hit = [...hit].sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (dir === "desc" ? -1 : 1));
    }
    const limit = url.searchParams.get("limit");
    const prefer = String(req.headers.prefer || "");
    const wantsObject = /vnd\.pgrst\.object/.test(String(req.headers.accept || ""));
    const select = url.searchParams.get("select");
    const out = (list, status = 200) => {
      const shaped = list.map((r) => project(name, r, select));
      if (wantsObject) {
        if (shaped.length !== 1) return send(res, 406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `The result contains ${shaped.length} rows` });
        return send(res, status, shaped[0]);
      }
      return send(res, status, shaped, { "Content-Range": `0-${Math.max(shaped.length - 1, 0)}/${shaped.length}` });
    };

    if (req.method === "GET" || req.method === "HEAD") return req.method === "HEAD" ? send(res, 200, undefined, { "Content-Range": `*/${hit.length}` }) : out(limit ? hit.slice(0, Number(limit)) : hit);

    if (req.method === "POST") {
      const items = Array.isArray(body) ? body : [body];
      const made = [];
      const conflict = url.searchParams.get("on_conflict") || PRIMARY_KEYS[name] || "id";
      for (const it of items) {
        if (/merge-duplicates|ignore-duplicates/.test(prefer)) {
          const ex = rows.find((r) => r[conflict] != null && r[conflict] === it[conflict]);
          if (ex) { if (/merge/.test(prefer)) Object.assign(ex, it); made.push(ex); continue; }
        }
        if (it.id && rows.some((r) => r.id === it.id)) return send(res, 409, { code: "23505", message: `duplicate key value violates unique constraint "${name}_pkey"` });
        const row = { id: randomUUID(), created_at: new Date().toISOString(), ...it };
        rows.push(row);
        made.push(row);
      }
      log.push({ table: name, op: "insert", rows: made });
      return /return=representation/.test(prefer) ? out(made, 201) : send(res, 201, undefined);
    }
    if (req.method === "PATCH") {
      hit.forEach((r) => Object.assign(r, body));
      log.push({ table: name, op: "update", rows: hit });
      return /return=representation/.test(prefer) ? out(hit) : send(res, 204);
    }
    if (req.method === "DELETE") {
      for (const r of hit) rows.splice(rows.indexOf(r), 1);
      log.push({ table: name, op: "delete", rows: hit });
      return /return=representation/.test(prefer) ? out(hit) : send(res, 204);
    }
    return send(res, 405, { message: "method not allowed" });
  }

  /* ---------------- Auth ---------------- */

  function authApi(req, res, url, body) {
    const p = url.pathname.replace("/auth/v1", "");
    if (p === "/token") {
      const grant = url.searchParams.get("grant_type");
      if (grant === "password") {
        const u = [...users.values()].find((x) => x.email === String(body.email).toLowerCase() && x.password === body.password);
        if (!u) return send(res, 400, { code: "invalid_credentials", error_code: "invalid_credentials", msg: "Invalid login credentials" });
        return send(res, 200, session(u));
      }
      if (grant === "refresh_token") {
        const id = refresh.get(body.refresh_token);
        if (!id) return send(res, 400, { code: "refresh_token_not_found", error_code: "refresh_token_not_found", msg: "Invalid Refresh Token: Refresh Token Not Found" });
        refresh.delete(body.refresh_token);
        return send(res, 200, session(users.get(id)));
      }
    }
    if (p === "/user") {
      const id = tokens.get(String(req.headers.authorization || "").replace(/^Bearer /, ""));
      return id ? send(res, 200, userJson(users.get(id))) : send(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
    }
    if (p === "/logout") return send(res, 204);
    if (p === "/admin/users" && req.method === "GET") return send(res, 200, { users: [...users.values()].map((u) => ({ ...userJson(u), last_sign_in_at: null, email_confirmed_at: "2026-01-01T00:00:00Z", banned_until: null })), aud: "authenticated" });
    return send(res, 404, { msg: "not found" });
  }

  /* ---------------- Storage ---------------- */

  function storageApi(req, res, url, rawBody) {
    const p = decodeURIComponent(url.pathname.replace("/storage/v1/object", ""));
    if (req.method === "POST" && p.startsWith("/sign/")) return send(res, 200, { signedURL: `/object/sign${p.slice(5)}?token=x` });
    if ((req.method === "POST" || req.method === "PUT") && !p.startsWith("/sign/")) {
      storage.set(p.replace(/^\//, ""), rawBody);
      log.push({ table: "storage", op: "upload", path: p.replace(/^\//, ""), bytes: rawBody.length });
      return send(res, 200, { Key: p.replace(/^\//, ""), Id: randomUUID() });
    }
    if (req.method === "DELETE") return send(res, 200, []);
    const data = storage.get(p.replace(/^\/(authenticated|public)\//, "").replace(/^\//, ""));
    if (data) { res.writeHead(200, { "content-type": "image/jpeg" }); return res.end(data); }
    return send(res, 404, { message: "Object not found", statusCode: "404" });
  }

  function send(res, status, body, headers = {}) {
    res.writeHead(status, { "content-type": "application/json", ...headers });
    res.end(body === undefined ? "" : JSON.stringify(body));
  }

  const server = http.createServer((req, res) => {
    // The browser talks to this server directly (like it does to Supabase), so it needs CORS
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
    res.setHeader("Access-Control-Allow-Headers", req.headers["access-control-request-headers"] || "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS");
    res.setHeader("Access-Control-Expose-Headers", "Content-Range");
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks);
      const url = new URL(req.url || "/", "http://x");
      let body = {};
      if (/json/.test(String(req.headers["content-type"])) && raw.length) { try { body = JSON.parse(raw.toString()); } catch { body = {}; } }
      try {
        if (url.pathname.startsWith("/auth/v1")) return authApi(req, res, url, body);
        if (url.pathname.startsWith("/rest/v1")) return rest(req, res, url, body);
        if (url.pathname.startsWith("/storage/v1/object")) return storageApi(req, res, url, raw);
        send(res, 404, { message: "not found" });
      } catch (e) {
        console.error("[fake-supabase]", e);
        send(res, 500, { message: String(e) });
      }
    });
  });

  return {
    db, table, seed, addUser, log, storage,
    listen: (port) => new Promise((r) => server.listen(port, "127.0.0.1", r)),
    close: () => new Promise((r) => server.close(r)),
  };
}
