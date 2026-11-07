import { parseHelpBody, parseInline, slugifyTopic, validateHelpDraft, searchTopics, groupByCategory, HELP_LIMITS, type HelpTopic } from "../src/lib/help";
import { FEATURES, effectivePermissions, canAccessPath, adminNavItems } from "../src/lib/access";
import { readFileSync } from "node:fs";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };

// inline bold
eq("bold", parseInline("Tap **Add** now"), [{ text: "Tap ", bold: false }, { text: "Add", bold: true }, { text: " now", bold: false }]);
eq("unmatched ** stays as text", parseInline("a **b"), [{ text: "a **b", bold: false }]);
eq("no marks", parseInline("plain"), [{ text: "plain", bold: false }]);

// blocks
const blocks = parseHelpBody("Intro line\ncontinues\n\n## Steps\n1. One\n2) Two **bold**\n\n- a\n- b\n\n> Tip: careful\n");
eq("block kinds", blocks.map((b) => b.kind), ["paragraph", "heading", "steps", "bullets", "tip"]);
eq("paragraph joined", blocks[0].kind === "paragraph" && blocks[0].inline[0].text, "Intro line continues");
eq("step count", blocks[2].kind === "steps" && blocks[2].items.length, 2);
eq("tip prefix removed", blocks[4].kind === "tip" && blocks[4].inline[0].text, "careful");
eq("empty body", parseHelpBody("   \n "), []);
// HTML is just text: it is never interpreted
const evil = parseHelpBody("<script>alert(1)</script>\n[x](javascript:alert(1))");
eq("html stays text", evil.length === 1 && evil[0].kind === "paragraph" && evil[0].inline[0].text.startsWith("<script>"), true);

// slug
eq("slug", slugifyTopic("  How do I add a Card? "), "how-do-i-add-a-card");
eq("slug accents", slugifyTopic("Añadir a inicio"), "anadir-a-inicio");
eq("slug empty", slugifyTopic("!!!"), "");
eq("slug length", slugifyTopic("a".repeat(200)).length, 80);

// validation
const good = { title: " Hello ", category: "", summary: "", body: "x", sort_order: "5", published: true };
const v = validateHelpDraft(good);
eq("valid", v.ok && v.value, { title: "Hello", category: "General", summary: "", body: "x", sort_order: 5, published: true });
eq("short title", validateHelpDraft({ ...good, title: "a" }).ok, false);
eq("symbol title", validateHelpDraft({ ...good, title: "!!" }).ok, false);
eq("long body", validateHelpDraft({ ...good, body: "x".repeat(HELP_LIMITS.body + 1) }).ok, false);
eq("long summary", validateHelpDraft({ ...good, summary: "x".repeat(HELP_LIMITS.summary + 1) }).ok, false);
const wild = validateHelpDraft({ ...good, sort_order: "99999" });
eq("order clamped", wild.ok && wild.value.sort_order, 9999);
const nan = validateHelpDraft({ ...good, sort_order: "abc" });
eq("order default", nan.ok && nan.value.sort_order, 100);

// search + grouping
const t = (o: Partial<HelpTopic>): HelpTopic => ({ id: o.slug || "x", slug: "x", title: "T", category: "General", summary: "", body: "", sort_order: 100, published: true, updated_at: "2026-01-01", ...o });
const topics = [
  t({ slug: "a", title: "Add to home screen", category: "Getting started", body: "Tap Share on iPhone", sort_order: 10 }),
  t({ slug: "b", title: "Share with a partner", category: "Sharing", summary: "Loyalty cards", sort_order: 20 }),
  t({ slug: "c", title: "Reports", category: "Getting started", sort_order: 5 }),
];
eq("search all", searchTopics(topics, "  ").length, 3);
eq("search title first", searchTopics(topics, "share").map((x) => x.slug), ["b", "a"]);
eq("search every word", searchTopics(topics, "share iphone").map((x) => x.slug), ["a"]);
eq("search accents/case", searchTopics(topics, "LOYALTY").map((x) => x.slug), ["b"]);
eq("search none", searchTopics(topics, "zebra").length, 0);
eq("groups", groupByCategory(topics).map((g) => [g.category, g.topics.map((x) => x.slug)]), [["Getting started", ["c", "a"]], ["Sharing", ["b"]]]);

// who can manage help: admin and assistant only, never a plain user
const h = (role: string) => effectivePermissions({ key: role, permissions: [], known_features: [] }).has("help.manage");
eq("admin manages help", h("admin"), true);
eq("assistant manages help", h("assistant"), true);
eq("user does not", h("user"), false);
eq("custom role does not", h("sales"), false);
eq("assistant reviewed: keeps it only if listed", effectivePermissions({ key: "assistant", permissions: [], known_features: FEATURES.map((f) => f.key) }).has("help.manage"), false);
eq("user can not open admin help", canAccessPath("user", effectivePermissions({ key: "user", permissions: [], known_features: [] }), "/admin/help"), false);
eq("assistant can open admin help", canAccessPath("assistant", effectivePermissions({ key: "assistant", permissions: [], known_features: [] }), "/admin/help"), true);
eq("every user can open /help", canAccessPath("user", effectivePermissions({ key: "user", permissions: [], known_features: [] }), "/help/anything"), true);
eq("assistant menu gets a hub", adminNavItems("assistant", effectivePermissions({ key: "assistant", permissions: [], known_features: [] })).some((i) => i.href === "/admin/settings"), true);

// the SQL: readable by everyone signed in, writable only through help.manage, drafts hidden from others
const sql = readFileSync("supabase/migration_help.sql", "utf8");
eq("sql select policy", /for select to authenticated\s+using \(published or public\.has_permission\('help\.manage'\)\)/.test(sql), true);
for (const op of ["insert", "update", "delete"]) eq(`sql ${op} policy needs help.manage`, new RegExp(`for ${op} to authenticated[\\s\\S]*?has_permission\\('help\\.manage'\\)`).test(sql), true);
eq("sql no anon access", /revoke all on public\.help_topics from anon/.test(sql), true);
eq("sql rls on", /alter table public\.help_topics enable row level security/.test(sql), true);
eq("sql seeds both topics", sql.includes("'add-to-home-screen'") && sql.includes("'share-with-partner'"), true);
eq("sql seeds are published", !/published\s*=\s*false/.test(sql), true);

if (fail) process.exit(1);
console.log("help: all checks passed");
