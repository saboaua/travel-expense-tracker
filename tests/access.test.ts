// Run with: npx tsx tests/access.test.ts
import { FEATURE_KEYS, effectivePermissions, legacyPermissions, unreviewedFeatures, clientRedirect, canAccessPath, ruleForPath, slugifyRoleKey, sanitizePermissions, hasAnyAdminFeature, sanitizeLabel } from "../src/lib/access";
const eq = (a:unknown,b:unknown,m:string)=>{ const ok=JSON.stringify(a)===JSON.stringify(b); console.log(ok?"PASS":"FAIL", m, ok?"":`got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); if(!ok) process.exitCode=1; };
const sorted = (s:Set<string>) => [...s].sort();

// admin gets everything, even features added later
eq(sorted(effectivePermissions({key:"admin",permissions:[],known_features:[]})), [...FEATURE_KEYS].sort(), "admin has all");

// seeded system roles behave like before roles existed
eq(sorted(legacyPermissions("user")), ["documents","loyalty","personal","personal.dashboard","reports","subscriptions","trips"], "legacy user");
eq(sorted(legacyPermissions("assistant")), ["documents","help.manage","loyalty","personal","personal.dashboard","reports","subscriptions","trips","users.manage"], "legacy assistant");
eq(sorted(legacyPermissions("whatever")), ["documents","loyalty","personal","personal.dashboard","reports","subscriptions","trips"], "unknown role -> user baseline");

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
eq(adminNavItems("assistant", legacyPermissions("assistant")), [{href:"/admin/settings",label:"Management",kind:"settings"}], "assistant now has two management options (users, help), so the menu shows the Management hub"
);
eq(adminNavItems("assistant", new Set(["users.manage"])), [{href:"/admin/users",label:"Users",kind:"users"}], "one delegated option still links straight to it");
eq(adminNavItems("user", legacyPermissions("user")), [], "user has no management links");
eq(adminNavItems("auditor", new Set(["security.view"])).map(i=>i.label), ["Security"], "auditor: security only");
eq(adminNavItems("ops", new Set(["currencies.manage"])).map(i=>[i.label,i.href]), [["Currencies","/admin/currencies"]], "one feature -> direct link");
eq(adminNavItems("ops", new Set(["currencies.manage","branding.manage","security.view"])).map(i=>i.label), ["Security","Management"], "several -> hub");

// the wallet sits under /personal but is its own option, so a role can have one without the other
eq(ruleForPath("/personal/loyalty"), { kind: "feature", key: "loyalty" }, "wallet page is guarded by the loyalty option");
eq(ruleForPath("/personal/groceries"), { kind: "feature", key: "personal" }, "other personal pages stay on personal");

// subscriptions are personal and per-role; the IPTV client page is its own option nobody has by default
eq(ruleForPath("/personal/subscriptions"), { kind: "feature", key: "subscriptions" }, "subscriptions page guarded by its option");
eq(ruleForPath("/my-subscription"), { kind: "feature", key: "iptv.mine" }, "client page guarded by its option");
eq(canAccessPath("user", effectivePermissions({key:"user",permissions:[],known_features:[]}), "/my-subscription"), false, "normal user cannot open the client page");
eq(canAccessPath("user", effectivePermissions({key:"user",permissions:[],known_features:[]}), "/personal/subscriptions"), true, "normal user has subscriptions");
eq(canAccessPath("assistant", effectivePermissions({key:"assistant",permissions:[],known_features:[]}), "/admin/iptv"), false, "IPTV admin is not delegable (assistant)");
eq(canAccessPath("ops", new Set(FEATURE_KEYS), "/admin/iptv"), false, "IPTV admin is not delegable (even with every option)");
eq(canAccessPath("admin", new Set(), "/admin/iptv/abc"), true, "admin opens IPTV admin");
eq(ruleForPath("/admin/iptv"), { kind: "adminOnly" }, "IPTV admin path is admin only");
eq(FEATURE_KEYS.some((k) => k.startsWith("iptv.") && k !== "iptv.mine"), false, "no IPTV admin option exists to hand out");
// a login that only has the client role is kept on its one page
eq(clientRedirect("iptv-client", "/"), "/my-subscription", "client sent home from the dashboard");
eq(clientRedirect("iptv-client", "/personal/subscriptions"), "/my-subscription", "client cannot browse personal");
eq(clientRedirect("iptv-client", "/admin/iptv"), "/my-subscription", "client cannot reach admin");
eq(clientRedirect("iptv-client", "/my-subscription"), null, "client page allowed");
eq(clientRedirect("iptv-client", "/change-password"), null, "client can change a temporary password");
eq(clientRedirect("iptv-client", "/my-subscriptionx"), "/my-subscription", "prefix lookalike is not the page");
eq(clientRedirect("user", "/"), null, "other roles unaffected");
