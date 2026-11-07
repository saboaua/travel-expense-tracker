import { friendlyAuthError, isNetworkError, NETWORK_MESSAGE, passwordFormProblem, passwordProblem, retryOnNetwork } from "../src/lib/password-policy";

let failed = 0;
const eq = (got: unknown, want: unknown, msg: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(ok ? "PASS" : "FAIL", msg, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  if (!ok) failed++;
};

/* ---- the one password rule ---- */
eq(passwordProblem("Ab1"), "At least 8 characters", "too short");
eq(passwordProblem("abcdefg1"), "Include an uppercase letter", "no capital");
eq(passwordProblem("ABCDEFG1"), "Include a lowercase letter", "no lower case");
eq(passwordProblem("Abcdefgh"), "Include a number", "no number");
eq(passwordProblem("Abcdefg1"), null, "a good one passes");
eq(passwordFormProblem("Abcdefg1", "Abcdefg2"), "Passwords do not match", "a different confirmation");
eq(passwordFormProblem("Abcdefg1", ""), "Passwords do not match", "an empty confirmation");
eq(passwordFormProblem("short", "short"), "At least 8 characters", "the rule is checked before the match");
eq(passwordFormProblem("Abcdefg1", "Abcdefg1"), null, "a matching good pair");

/* ---- network failures in every browser's words ---- */
for (const m of ["Load failed", "Failed to fetch", "NetworkError when attempting to fetch resource.", "fetch failed", "Network request failed"]) eq(isNetworkError(new TypeError(m)), true, `network: ${m}`);
eq(isNetworkError({ name: "AuthRetryableFetchError", message: "Load failed" }), true, "supabase retryable fetch error");
eq(isNetworkError(new Error("New password should be different from the old password.")), false, "a real auth error is not a network error");
eq(friendlyAuthError(new TypeError("Load failed"), "x"), NETWORK_MESSAGE, "Load failed becomes a plain sentence");
eq(friendlyAuthError(new Error("New password should be different from the old password."), "x"), "New password should be different from the old password.", "other messages are kept");
eq(friendlyAuthError(null, "Could not save"), "Could not save", "fallback when there is no message");

(async () => {
  /* ---- retry only when the connection failed ---- */
  let n = 0;
  const r1 = await retryOnNetwork(async () => { n++; if (n < 3) throw new TypeError("Load failed"); return { error: null }; }, 3, 1);
  eq([n, r1.error], [3, null], "retries a thrown network error until it works");
  n = 0;
  const r2 = await retryOnNetwork(async () => { n++; return n < 2 ? { error: { name: "AuthRetryableFetchError", message: "Load failed" } } : { error: null }; }, 3, 1);
  eq([n, r2.error], [2, null], "retries a returned network error");
  n = 0;
  const r3 = await retryOnNetwork(async () => { n++; return { error: new Error("Password too weak") }; }, 3, 1);
  eq(n, 1, "a real error is not retried");
  eq((r3.error as Error).message, "Password too weak", "and is returned as it is");
  n = 0;
  let msg = "";
  try { await retryOnNetwork(async () => { n++; throw new TypeError("Load failed"); }, 3, 1); } catch (e) { msg = (e as Error).message; }
  eq([n, msg], [3, "Load failed"], "gives up after three tries and throws the last error");

  console.log(failed ? `${failed} FAILED` : "all password checks passed");
  process.exit(failed ? 1 : 0);
})();
