import { cronAuthorized } from "../src/lib/cron-auth";

let failed = 0;
const eq = (got: unknown, want: unknown, msg: string) => {
  const ok = got === want;
  console.log(ok ? "PASS" : "FAIL", msg, ok ? "" : `got ${got} want ${want}`);
  if (!ok) failed++;
};
const req = (auth?: string) => new Request("https://x.test/api/cron/x", { headers: auth ? { authorization: auth } : {} });

delete process.env.CRON_SECRET;
eq(cronAuthorized(req("Bearer anything")), false, "no secret set: every request is refused");
process.env.CRON_SECRET = "s3cret-value";
eq(cronAuthorized(req("Bearer s3cret-value")), true, "the right secret is accepted");
eq(cronAuthorized(req("Bearer s3cret-valuX")), false, "a wrong secret of the same length is refused");
eq(cronAuthorized(req("Bearer short")), false, "a wrong length is refused");
eq(cronAuthorized(req()), false, "no header is refused");
eq(cronAuthorized(req("s3cret-value")), false, "the Bearer word is required");

if (failed) { console.log(`${failed} failed`); process.exit(1); }
