import {
  INVITE_SENT_MESSAGE, SHARING_LIMITS, activePartners, buildSharingNotifications, cleanSharedCards, cleanSharedTrips, isUuid,
  isValidEmail, nextInvitePopup, normalizeEmail, sharedWith, sharingErrorCode, sharingMessage, statusForCode, type SharingOverview,
} from "../src/lib/sharing";
import { sameOrigin, callSharing } from "../src/lib/sharing-server";
import { FEATURES, effectivePermissions } from "../src/lib/access";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };

// limits agree with what the roadmap promised
eq("limits", SHARING_LIMITS, { partners: 4, pending: 10, invitesPerDay: 5, inviteDays: 14 });

// email handling
eq("normalize trims and lowercases", normalizeEmail("  Bob@Example.COM "), "bob@example.com");
eq("normalize non-string", normalizeEmail(42), "");
eq("valid email", isValidEmail("bob@example.com"), true);
for (const bad of ["", "bob", "bob@", "@x.com", "a b@x.com", "bob@x", `${"a".repeat(250)}@x.com`]) eq(`invalid: ${bad.slice(0, 12)}`, isValidEmail(bad), false);
eq("uuid ok", isUuid("00000000-0000-4000-8000-000000000001"), true);
for (const bad of ["", "x", "00000000-0000-4000-8000-00000000000", null, 5, "0000000000004000800000000000000001"]) eq(`uuid bad: ${String(bad)}`, isUuid(bad), false);

// database errors become short safe messages; unknown ones never leak
eq("code from raise", sharingErrorCode("sharing_off"), "sharing_off");
eq("code inside longer text", sharingErrorCode("ERROR: partner_limit (P0001)"), "partner_limit");
eq("a similar word is not a code", sharingErrorCode("not_found_anywhere"), null);
eq("unknown error has no code", sharingErrorCode('relation "partnerships" does not exist'), null);
eq("unknown error message is generic", sharingMessage(null), "Sharing hit a problem. Please try again.");
eq("limit message", sharingMessage("daily_limit"), "You can send up to 5 invites a day. Try again tomorrow.");
eq("partner limit message", sharingMessage("partner_limit"), "You can have up to 4 partners.");
eq("status for limits", [statusForCode("daily_limit"), statusForCode("partner_limit"), statusForCode("pending_limit")], [429, 429, 429]);
eq("status others", [statusForCode("sharing_off"), statusForCode("not_found"), statusForCode("bad_email"), statusForCode(null), statusForCode("not_signed_in")], [403, 404, 400, 500, 401]);
eq("invite message is the same wording the roadmap promised", INVITE_SENT_MESSAGE.startsWith("Invite sent."), true);
eq("no message ever says whether an email has an account", /no user|not found|does not exist|no account/i.test(INVITE_SENT_MESSAGE), false);

// a shared trip never carries more than its fields, even if the database returned extra columns
const trips = cleanSharedTrips([{ share_id: "s", kind: "trip", trip_id: "t", name: "Miami", destination: "FL", start_date: "2026-12-01", end_date: "2026-12-08", shared_by: "Alice", budget: 5000, notes: "private", expenses: [{ amount: 9 }], receipt_path: "a/b.jpg", user_id: "u" }]);
eq("trip fields only", Object.keys(trips[0]).sort(), ["destination", "end_date", "kind", "name", "share_id", "shared_by", "start_date", "trip_id"]);
eq("trip has no money or notes", JSON.stringify(trips).match(/5000|private|receipt|amount|user_id/), null);
eq("trip dates are plain days", [trips[0].start_date, trips[0].end_date], ["2026-12-01", "2026-12-08"]);
eq("a date with a time on it is cut to the day", cleanSharedTrips([{ start_date: "2026-11-17T00:00:00.000Z", end_date: null, name: "x" }])[0].start_date, "2026-11-17");
eq("not a date becomes empty", cleanSharedTrips([{ start_date: "soon", name: "x" }])[0].start_date, null);
eq("trips: not an array", cleanSharedTrips({ nope: 1 }), []);
eq("trips: junk rows dropped", cleanSharedTrips([null, 5, "x"]), []);
const cards = cleanSharedCards([{ share_id: "s", card_id: "c", store_name: "Cafe", holder_name: null, category: null, card_number: "123", barcode_format: "CODE128", color: null, has_image: true, shared_by: "Alice", image_path: "a/c.webp", user_id: "u", notes: "x" }]);
eq("card fields only", Object.keys(cards[0]).sort(), ["barcode_format", "card_id", "card_number", "category", "color", "has_image", "holder_name", "share_id", "shared_by", "store_name"]);
eq("card has no storage path or owner id", JSON.stringify(cards).match(/a\/c\.webp|user_id/), null);

// the bell
const overview: SharingOverview = {
  available: true, enabled: true,
  incoming: [{ id: "i1", from_name: "Alice", from_email: "alice@example.com", created_at: "2026-11-07T10:00:00Z" }],
  partners: [
    { id: "p1", status: "active", direction: "sent", name: "Bob", email: "bob@example.com", since: "2026-11-01", created_at: "2026-11-01" },
    { id: "p2", status: "pending", direction: "sent", name: null, email: "x@example.com", since: null, created_at: "2026-11-02" },
  ],
  accepted: [{ id: "p1", name: "Bob", at: "2026-11-06" }],
  shares: [{ id: "s1", partnership_id: "p1", kind: "loyalty_card", item_id: "c1" }],
};
const bell = buildSharingNotifications(overview);
eq("bell: invite and accepted", bell.map((n) => n.id), ["sharing-invite:i1", "sharing-accepted:p1"]);
eq("bell: invite cannot be dismissed until answered", bell[0].dismissible, false);
eq("bell: accepted can be dismissed", bell[1].dismissible, true);
eq("bell: invite explains nothing is shared yet", /Nothing is shared until you accept/.test(bell[0].message), true);
eq("bell: unavailable", buildSharingNotifications({ available: false }), []);
eq("bell: null", buildSharingNotifications(null), []);
eq("popup: first unseen invite", nextInvitePopup(overview, [])?.id, "i1");
eq("popup: already seen", nextInvitePopup(overview, ["i1"]), null);
eq("popup: unavailable", nextInvitePopup({ available: false }, []), null);

// share rows
eq("active partners only", activePartners(overview).map((p) => p.id), ["p1"]);
eq("shared with", sharedWith(overview, "loyalty_card", "c1"), { p1: "s1" });
eq("not shared", sharedWith(overview, "trip", "c1"), {});
eq("active partners when unavailable", activePartners({ available: false }), []);

// same-site requests only
const req = (headers: Record<string, string>) => new Request("https://app.example.com/api/sharing/invite", { method: "POST", headers });
eq("no Origin header is allowed (same-site fetches from old browsers)", sameOrigin(req({})), true);
eq("same site", sameOrigin(req({ origin: "https://app.example.com", host: "app.example.com" })), true);
eq("another site is refused", sameOrigin(req({ origin: "https://evil.example", host: "app.example.com" })), false);
eq("garbage Origin is refused", sameOrigin(req({ origin: "not a url", host: "app.example.com" })), false);

// the role option: off by default, always on for admin
eq("option exists", FEATURES.some((f) => f.key === "sharing"), true);
eq("new roles do not get sharing", effectivePermissions({ key: "user", permissions: [], known_features: [] }).has("sharing"), false);
eq("assistant does not either", effectivePermissions({ key: "assistant", permissions: [], known_features: [] }).has("sharing"), false);
eq("admin has it", effectivePermissions({ key: "admin", permissions: [], known_features: [] }).has("sharing"), true);
eq("a role that was given it", effectivePermissions({ key: "user", permissions: ["sharing"], known_features: ["sharing"] }).has("sharing"), true);

// the database call wrapper maps errors and passes data
async function main() {
  const ok = await callSharing({ rpc: async () => ({ data: [1], error: null }) } as never, "x");
  eq("rpc ok", ok, { error: null, data: [1] });
  const off = await callSharing({ rpc: async () => ({ data: null, error: { message: "sharing_off" } }) } as never, "x");
  eq("rpc refusal becomes a code", off.error, "sharing_off");
  const odd = await callSharing({ rpc: async () => ({ data: null, error: { message: 'permission denied for table partnerships' } }) } as never, "x");
  eq("rpc odd error has no code", odd.error, null);
  if (fail) process.exit(1);
  console.log("sharing checks passed");
}
main();
