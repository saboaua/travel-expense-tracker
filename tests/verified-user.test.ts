import { verifiedUser } from "../src/lib/supabase/verified-user";

let failures = 0;
const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) { failures++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };

function client(opts: { claims?: unknown; claimsThrows?: boolean; claimsError?: boolean; user?: { id: string; email?: string } | null }) {
  const calls = { claims: 0, user: 0 };
  const auth = {
    getClaims: async () => {
      calls.claims++;
      if (opts.claimsThrows) throw new Error("boom");
      return opts.claimsError ? { data: null, error: new Error("no jwt") } : { data: { claims: opts.claims }, error: null };
    },
    getUser: async () => { calls.user++; return { data: { user: opts.user ?? null }, error: null }; },
  };
  return { c: { auth } as never, calls };
}

(async () => {
  let t = client({ claims: { sub: "u1", email: "a@b.c" } });
  eq(await verifiedUser(t.c), { id: "u1", email: "a@b.c" }, "verified token is enough");
  eq(t.calls, { claims: 1, user: 0 }, "no server round trip when the token verifies");

  t = client({ claims: { sub: "u2" } });
  eq(await verifiedUser(t.c), { id: "u2", email: null }, "email is optional");

  t = client({ claimsError: true, user: { id: "u3", email: "x@y.z" } });
  eq(await verifiedUser(t.c), { id: "u3", email: "x@y.z" }, "falls back to asking Supabase when the token cannot be verified here");
  eq(t.calls.user, 1, "asked once");

  t = client({ claimsThrows: true, user: { id: "u4" } });
  eq(await verifiedUser(t.c), { id: "u4", email: null }, "falls back when verification throws");

  t = client({ claimsError: true, user: null });
  eq(await verifiedUser(t.c), null, "signed out stays signed out");

  t = client({ claims: {}, user: null });
  eq(await verifiedUser(t.c), null, "a token without a subject is not a person");
  eq(t.calls.user, 1, "and is double-checked with Supabase");

  if (failures) process.exit(1);
  console.log("verified-user checks passed");
})();
