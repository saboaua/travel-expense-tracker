// Run with: npx tsx tests/access.test.ts
import { FEATURE_KEYS, effectivePermissions, legacyPermissions, unreviewedFeatures, canAccessPath, ruleForPath, slugifyRoleKey, sanitizePermissions, hasAnyAdminFeature, sanitizeLabel } from "../src/lib/access";
const eq = (a:unknown,b:unknown,m:string)=>{ const ok=JSON.stringify(a)===JSON.stringify(b); console.log(ok?"PASS":"FAIL", m, ok?"":`got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); if(!ok) process.exitCode=1; };
const sorted = (s:Set<string>) => [...s].sort();

// admin gets everything, even features added later
eq(sorted(effectivePermissions({key:"admin",permissions:[],known_features:[]})), [...FEATURE_KEYS].sort(), "admin has all");

// seeded system roles behave like before roles existed
eq(sorted(legacyPermissions("user")), ["documents","loyalty","personal","personal.dashboard","reports","trips"], "legacy user");
eq(sorted(legacyPermissions("assistant")), ["documents","loyalty","personal","personal.dashboard","reports","trips","users.manage"], "legacy assistant");
eq(sorted(legacyPermissions("whatever")), ["documents","loyalty","personal","personal.dashboard","reports","trips"], "unknown role -> user baseline");

// reviewed roles use exactly what the admin ticked
const reviewedUser = {key:"user",permissions:["trips","reports"],known_features:FEATURE_KEYS};
eq(sorted(effectivePermissions(reviewedUser)), ["reports","trips"], "reviewed user: only ticked features (personal removed)");

// a NEW feature (unseen) reaches default roles but not custom roles
const known = FEATURE_KEYS.filter(k=>k!=="documents");
eq(effectivePermissions({key:"user",permissions:["trips"],known_features:known}).has("documents"), true, "unseen feature defaults to user");
eq(effectivePermissions({key:"sales",permissions:["trips"],known_features:known}).has("documents"), false, "custom role gets nothing by default");
eq(unreviewedFeatures({key:"sales",known_features:known}).map(f=>f.key), ["documents"], "new feature flagged for review");
eq(unreviewedFeatures({key:"admin",known_features:[]}), [], "admin never has unreviewed");

// custom role with a delegated admin feature
const auditor = effectivePermissions({key:"auditor",permissions:["trips","security.view"],known_features:FEATURE_KEYS});
eq(canAccessPath("auditor", auditor, "/admin/security"), true, "auditor can open security");
eq(canAccessPath("auditor", auditor, "/admin/branding"), false, "auditor cannot open branding");
eq(canAccessPath("auditor", auditor, "/admin/settings"), true, "has admin feature -> hub");
eq(canAccessPath("auditor", auditor, "/admin/roles"), false, "roles page is admin only");
eq(canAccessPath("auditor", auditor, "/personal"), false, "personal not granted");
eq(canAccessPath("auditor", auditor, "/trips/abc/add-expense"), true, "sub paths follow the feature");
eq(canAccessPath("auditor", auditor, "/profile"), true, "profile always open");
eq(canAccessPath("auditor", auditor, "/"), true, "dashboard always open");
const plain = effectivePermissions({key:"user",permissions:["trips"],known_features:FEATURE_KEYS});
eq(canAccessPath("user", plain, "/admin/settings"), false, "no admin feature -> no hub");
eq(canAccessPath("user", plain, "/admin/unknown-new-page"), false, "unknown admin page is admin only");
eq(canAccessPath("admin", new Set(), "/admin/roles"), true, "admin can open roles");
eq(ruleForPath("/tripsy"), {kind:"open"}, "prefix match respects path boundaries");
eq(ruleForPath("/admin/travel-categories"), {kind:"feature",key:"categories.manage"}, "travel categories under categories.manage");
eq(hasAnyAdminFeature(plain), false, "no admin feature");

// validation
eq(slugifyRoleKey("Sales Team!"), "sales-team", "slug");
eq(slugifyRoleKey("Café Ops"), "cafe-ops", "accents");
eq(slugifyRoleKey("!!"), null, "unusable label");
eq(slugifyRoleKey("1abc"), null, "must start with a letter");
eq(sanitizePermissions(["trips","trips","hack","admin.everything",5,"security.view"]), ["trips","security.view"], "unknown/duplicate permissions dropped");
eq(sanitizePermissions("nope"), [], "non-array");
eq(sanitizeLabel("  <b>Sales</b>   team "), "bSales/b team", "label cleaned");
eq(sanitizeLabel("   "), null, "blank label");

// navigation
import { adminNavItems } from "../src/lib/access";
eq(adminNavItems("admin", new Set()).map(i=>i.label), ["Security","Global Settings"], "admin nav");
eq(adminNavItems("assistant", legacyPermissions("assistant")), [{href:"/admin/users",label:"Users",kind:"users"}], "assistant keeps a direct Users link");
eq(adminNavItems("user", legacyPermissions("user")), [], "user has no management links");
eq(adminNavItems("auditor", new Set(["security.view"])).map(i=>i.label), ["Security"], "auditor: security only");
eq(adminNavItems("ops", new Set(["currencies.manage"])).map(i=>[i.label,i.href]), [["Currencies","/admin/currencies"]], "one feature -> direct link");
eq(adminNavItems("ops", new Set(["currencies.manage","branding.manage","security.view"])).map(i=>i.label), ["Security","Management"], "several -> hub");

// the wallet sits under /personal but is its own option, so a role can have one without the other
eq(ruleForPath("/personal/loyalty"), { kind: "feature", key: "loyalty" }, "wallet page is guarded by the loyalty option");
eq(ruleForPath("/personal/groceries"), { kind: "feature", key: "personal" }, "other personal pages stay on personal");
