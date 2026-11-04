// Runs every tests/*.test.ts with tsx; fails if any fails.
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const files = readdirSync("tests").filter((f) => f.endsWith(".test.ts")).sort();
let failed = 0;
for (const f of files) {
  const r = spawnSync("npx", ["tsx", `tests/${f}`], { encoding: "utf8", shell: process.platform === "win32" });
  const ok = r.status === 0;
  console.log(`${ok ? "ok  " : "FAIL"} ${f}`);
  if (!ok) {
    failed++;
    console.log((r.stdout || "").split("\n").filter((l) => !l.startsWith("PASS")).join("\n"), r.stderr || "");
  }
}
console.log(failed ? `${failed} of ${files.length} test files failed` : `all ${files.length} test files passed`);
process.exit(failed ? 1 : 0);
