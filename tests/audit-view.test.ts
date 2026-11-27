import { actionText, actorName, changedText, groupOf, groupTypes, AUDIT_GROUPS } from "../src/lib/audit-view";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };

eq("add", actionText({ action: "grocery_receipts.created" }), "added a grocery receipt");
eq("change", actionText({ action: "reminders.updated" }), "changed a reminder");
eq("delete", actionText({ action: "savings_plans.deleted" }), "deleted a savings plan");
eq("trips and expenses read too", [actionText({ action: "trips.created" }), actionText({ action: "expenses.deleted" })], ["added a trip", "deleted an expense"]);
eq("special wording", [actionText({ action: "profiles.updated" }), actionText({ action: "support_requests.created" })], ["changed their profile", "sent a support request"]);
eq("admin actions", actionText({ action: "plan.set" }), "set a plan");
eq("an unknown action still reads", actionText({ action: "thing.happened_today" }), "thing happened today");

eq("who: email", actorName({ action: "x.created", actor_email: "pat@example.com" }), "pat@example.com");
eq("who: user without email", actorName({ action: "reminders.deleted", actor_id: null, details: { owner_id: "u1" } }), "A user");
eq("who: nobody signed in", actorName({ action: "support_requests.created" }), "Not signed in");
eq("who: system", actorName({ action: "plan.set" }), "System");

eq("changed list", changedText({ changed: ["title", "due_date"] }), "title, due date");
eq("no changed list", [changedText({}), changedText(null), changedText({ changed: [] })], [null, null, null]);
eq("long changed list is cut", changedText({ changed: ["a", "b", "c", "d", "e", "f", "g", "h", "i"] }), "a, b, c, d, e, f, g, h and more");

eq("groups", [groupOf("reminders"), groupOf("trips"), groupOf("profiles"), groupOf("role"), groupOf("nonsense"), groupOf(null)], ["Personal", "Business", "Account", "Admin", null, null]);
eq("filter types", groupTypes("Business"), ["trips", "expenses", "trip_flights", "trip_papers", "business_projects", "business_project_receipts"]);
eq("filter: no group", [groupTypes(""), groupTypes("Evil"), groupTypes(null)], [null, null, null]);
// every type belongs to exactly one group
const all = AUDIT_GROUPS.flatMap((g) => groupTypes(g)!);
eq("no type is in two groups", all.length, new Set(all).size);

console.log(fail ? `${fail} FAILED` : "audit-view: all checks passed");
process.exit(fail ? 1 : 0);
