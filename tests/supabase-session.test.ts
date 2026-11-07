/**
 * Sign-in, sign-out and expired-session behaviour of @supabase/ssr, against a tiny fake Supabase Auth server.
 * Guards the @supabase/ssr + supabase-js upgrade: cookies are written on sign-in, cleared on sign-out, an expired access
 * token is refreshed by the middleware, and a dead refresh token sends the person to /login.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";

let fail = 0;
const eq = (n: string, g: unknown, w: unknown) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fail++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : `got=${JSON.stringify(g)} want=${JSON.stringify(w)}`); };

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const USER = { id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", role: "authenticated", email: "pat@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const jwt = (exp: number) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: USER.id, role: "authenticated", aud: "authenticated", exp, iat: exp - 3600, email: USER.email })}.sig`;
const now = () => Math.floor(Date.now() / 1000);

const state = { refreshOk: true, calls: { password: 0, refresh: 0, user: 0, logout: 0 }, validTokens: new Set<string>() };
let refreshCount = 0;

function session() {
  refreshCount++;
  const access = jwt(now() + 3600 + refreshCount); // distinct per call
  state.validTokens.add(access);
  return { access_token: access, token_type: "bearer", expires_in: 3600, expires_at: now() + 3600, refresh_token: `refresh-${refreshCount}`, user: USER };
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", "http://x");
  const send = (code: number, body?: unknown) => { res.writeHead(code, { "content-type": "application/json" }); res.end(body === undefined ? "" : JSON.stringify(body)); };
  req.resume();
  req.on("end", () => {
    if (url.pathname === "/auth/v1/token") {
      const grant = url.searchParams.get("grant_type");
      if (grant === "password") { state.calls.password++; return send(200, session()); }
      if (grant === "refresh_token") {
        state.calls.refresh++;
        return state.refreshOk ? send(200, session()) : send(400, { code: "refresh_token_not_found", error_code: "refresh_token_not_found", msg: "Invalid Refresh Token: Refresh Token Not Found" });
      }
    }
    if (url.pathname === "/auth/v1/user") {
      state.calls.user++;
      const token = (req.headers.authorization || "").replace(/^Bearer /, "");
      return state.validTokens.has(token) ? send(200, USER) : send(401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
    }
    if (url.pathname === "/auth/v1/logout") { state.calls.logout++; return send(204); }
    send(404, { msg: "not found" });
  });
});

async function main() {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

  const { createServerClient } = await import("@supabase/ssr");
  const { NextRequest } = await import("next/server");
  const { updateSession } = await import("../src/lib/supabase/middleware");

  // A cookie jar standing in for the browser / Next cookie store
  const jar = new Map<string, string>();
  const client = () =>
    createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: (list) => list.forEach(({ name, value, options }) => ((options?.maxAge ?? 1) <= 0 || value === "" ? jar.delete(name) : jar.set(name, value))),
      },
    });
  /** Ages the stored session: the access token is now in the past, the refresh token is untouched. */
  const expireStoredSession = () => {
    for (const k of authCookies()) {
      const raw = jar.get(k)!;
      const isB64 = raw.startsWith("base64-");
      const obj = JSON.parse(isB64 ? Buffer.from(raw.slice(7), "base64url").toString() : raw);
      obj.access_token = jwt(now() - 100);
      obj.expires_at = now() - 100;
      obj.expires_in = 0;
      const text = JSON.stringify(obj);
      jar.set(k, isB64 ? `base64-${Buffer.from(text).toString("base64url")}` : text);
    }
  };
  const authCookies = () => [...jar.keys()].filter((k) => k.startsWith("sb-"));
  const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("; ");
  const req = (path: string) => new NextRequest(`http://localhost:3000${path}`, { headers: { cookie: cookieHeader() } });

  // ---- sign in ----
  const bad = await client().auth.signInWithPassword({ email: USER.email, password: "x" });
  eq("sign-in returns a session", !!bad.data.session && !bad.error, true);
  eq("sign-in sets the auth cookie", authCookies().length > 0, true);
  const who = await client().auth.getUser();
  eq("signed-in user is read back", who.data.user?.email, USER.email);

  // ---- middleware with a good session ----
  let r = await updateSession(req("/"));
  eq("signed-in person reaches the dashboard", r.status, 200);
  r = await updateSession(req("/login"));
  eq("/login is a public path, so it is served as is (the login page itself forwards signed-in people)", r.status, 200);

  // ---- sign out ----
  const out = await client().auth.signOut();
  eq("sign-out succeeds", out.error, null);
  eq("sign-out clears the auth cookies", authCookies(), []);
  eq("sign-out told the server", state.calls.logout, 1);
  r = await updateSession(req("/"));
  eq("after sign-out the start address shows the sign-in screen in place (no redirect: iOS installs a redirecting page as a bookmark)", [r.status, r.headers.get("location"), r.headers.get("x-middleware-rewrite")?.endsWith("/login")], [200, null, true]);
  r = await updateSession(req("/trips"));
  eq("after sign-out other pages redirect to /login", [r.status, new URL(r.headers.get("location") || "http://x/").pathname], [307, "/login"]);
  r = await updateSession(req("/login"));
  eq("after sign-out /login stays reachable", r.status, 200);

  // ---- expired access token, refresh token still good ----
  await client().auth.signInWithPassword({ email: USER.email, password: "x" });
  expireStoredSession();
  const before = state.calls.refresh;
  r = await updateSession(req("/trips"));
  eq("expired session is refreshed, not redirected", r.status, 200);
  eq("refresh endpoint was used", state.calls.refresh - before >= 1, true);
  eq("new cookies are handed back to the browser", r.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.value.length > 0), true);

  // ---- expired access token, refresh token rejected ----
  jar.clear();
  await client().auth.signInWithPassword({ email: USER.email, password: "x" });
  expireStoredSession();
  state.refreshOk = false;
  const realError = console.error; console.error = () => {}; // supabase logs the expected refresh failure
  r = await updateSession(req("/trips"));
  eq("dead session redirects to /login", [r.status, new URL(r.headers.get("location") || "http://x/").pathname], [307, "/login"]);
  r = await updateSession(req("/privacy"));
  eq("public pages still open with a dead session", r.status, 200);
  const dead = await client().auth.getUser();
  eq("getUser reports no user for a dead session", [dead.data.user, !!dead.error], [null, true]);

  console.error = realError;

  // ---- no cookies at all ----
  jar.clear();
  r = await updateSession(req("/"));
  eq("no cookies -> sign-in screen at the start address", [r.status, r.headers.get("location"), r.headers.get("x-middleware-rewrite")?.endsWith("/login")], [200, null, true]);
  r = await updateSession(req("/trips"));
  eq("no cookies -> other pages redirect to /login", [r.status, new URL(r.headers.get("location") || "http://x/").pathname], [307, "/login"]);

  server.close();
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
