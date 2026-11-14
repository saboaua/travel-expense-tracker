import { cleanRequest } from "../src/lib/account-requests";
const eq = (n: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { console.error(`FAIL ${n}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`); process.exit(1); } };
const r = (name: string, email: string, phone: string) => cleanRequest({ name, email, phone });

eq("email only", r("  Pat   Fortin ", " Pat@Example.com ", ""), { ok: true, value: { name: "Pat Fortin", email: "pat@example.com", phone: null } });
eq("phone only", r("Maria", "", "+297 593 1234"), { ok: true, value: { name: "Maria", email: null, phone: "+297 593 1234" } });
eq("both", (r("Jan", "jan@x.nl", "593-1234") as { ok: boolean }).ok, true);
eq("needs a contact", r("Pat", "", ""), { ok: false, error: "Add an email or a phone number so we can reach you." });
eq("needs a name", (r("", "a@b.co", "") as { ok: boolean }).ok, false);
eq("bad email", r("Pat", "pat@", ""), { ok: false, error: "That email does not look right." });
eq("bad phone", r("Pat", "", "abc"), { ok: false, error: "That phone number does not look right." });
eq("short phone", (r("Pat", "", "12345") as { ok: boolean }).ok, false);
console.log("ok account-requests");
