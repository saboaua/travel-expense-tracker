import { EXPORT_TABLES, filePathsOf, isOwnPath } from "../src/lib/account-export";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };
const me = "11111111-1111-4111-8111-111111111111";

eq("own folder is allowed", isOwnPath(`${me}/a.jpg`, me), true);
eq("someone else's folder is refused", isOwnPath("22222222-2222-4222-8222-222222222222/a.jpg", me), false);
eq("parent-folder tricks are refused", isOwnPath(`${me}/../x/a.jpg`, me), false);
eq("non-text is refused", isOwnPath(null, me), false);
eq("only *_path fields from my folder are collected, once each", filePathsOf([
  { receipt_path: `${me}/r1.jpg`, note: `${me}/not-a-path-field` },
  { receipt_path: `${me}/r1.jpg` },
  { image_path: "other/x.jpg" },
  { file_path: `${me}/d.pdf` },
], me).sort(), [`${me}/d.pdf`, `${me}/r1.jpg`]);
eq("every exported table names its owner column", EXPORT_TABLES.every((t) => t.owner === "id" || t.owner === "user_id"), true);
eq("the profile is exported by its own id", EXPORT_TABLES.find((t) => t.table === "profiles")?.owner, "id");

if (fail) process.exit(1);
console.log("account export checks passed");
