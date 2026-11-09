// The real web-push library must load and reach the sending step (it once crashed on a missing default export).
import http from "node:http";
import * as webpush from "web-push";

let failures = 0;
const check = (ok: boolean, name: string) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}`); if (!ok) failures++; };

(async () => {
  const keys = webpush.generateVAPIDKeys();
  // A stand-in database that has one saved device
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(req.url?.includes("push_subscriptions") ? JSON.stringify([{ id: "1", endpoint: "https://127.0.0.1:9/none", p256dh: keys.publicKey, auth: "x".repeat(22) }]) : "[]");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  process.env.VAPID_PUBLIC_KEY = keys.publicKey;
  process.env.VAPID_PRIVATE_KEY = keys.privateKey;
  process.env.VAPID_SUBJECT = "mailto:test@example.com";
  const { sendPushDetailed } = await import("../src/lib/push");
  const r = await sendPushDetailed("u1", "test", null);
  check(r.reason === "rejected" && r.devices === 1, `the library loads and tries to send (got ${r.reason}${r.detail ? `: ${r.detail}` : ""})`);
  process.env.VAPID_SUBJECT = "someone@example.com";
  const bad = await sendPushDetailed("u1", "test", null);
  check(bad.reason === "error" && /^Vapid subject/.test(bad.detail || ""), `a subject without mailto: is reported (${bad.detail})`);
  server.close();
  console.log(failures ? `${failures} failed` : "push-send: all checks passed");
  process.exit(failures ? 1 : 0);
})();
