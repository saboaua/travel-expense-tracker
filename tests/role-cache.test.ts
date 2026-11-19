import { cachedPermissions, cachedRole, clearRoleCache, rememberPermissions, rememberRole } from "../src/lib/role-cache";

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) { fail++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
};

delete process.env.ROLE_CACHE_SECONDS;
clearRoleCache();
const T = 1_000_000;
eq("nothing remembered yet", cachedRole("u1", T), null);
rememberRole("u1", "user", T);
eq("remembered", cachedRole("u1", T + 1000), "user");
eq("still there just before 30 s", cachedRole("u1", T + 29_999), "user");
eq("gone at 30 s", cachedRole("u1", T + 30_000), null);
eq("and stays gone", cachedRole("u1", T + 30_001), null);

rememberRole("u2", "admin", T);
eq("another person is separate", [cachedRole("u1", T), cachedRole("u2", T)], [null, "admin"]);

rememberPermissions("user", new Set(["trips", "documents"]), T);
eq("permissions remembered", [...(cachedPermissions("user", T + 5000) ?? [])], ["trips", "documents"]);
eq("permissions expire", cachedPermissions("user", T + 31_000), null);

// switched off: nothing is kept
process.env.ROLE_CACHE_SECONDS = "0";
clearRoleCache();
rememberRole("u3", "user", T);
rememberPermissions("user", new Set(["trips"]), T);
eq("off: no role kept", cachedRole("u3", T), null);
eq("off: no permissions kept", cachedPermissions("user", T), null);

// a custom time
process.env.ROLE_CACHE_SECONDS = "5";
rememberRole("u4", "user", T);
eq("5 s: kept", cachedRole("u4", T + 4000), "user");
eq("5 s: expired", cachedRole("u4", T + 5000), null);

// the memory stays small
process.env.ROLE_CACHE_SECONDS = "30";
clearRoleCache();
for (let i = 0; i < 700; i++) rememberRole(`p${i}`, "user", T);
eq("oldest dropped when full", [cachedRole("p0", T), cachedRole("p699", T)], [null, "user"]);

console.log(fail ? `${fail} FAILED` : "role-cache: all checks passed");
process.exit(fail ? 1 : 0);
