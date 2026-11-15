import { writeAuditRow } from "../src/lib/audit";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };

const inserted: { table: string; row: Record<string, unknown> }[] = [];
const ok = { from: (table: string) => ({ insert: async (row: Record<string, unknown>) => { inserted.push({ table, row }); return { error: null }; } }) };
const bad = { from: () => ({ insert: async () => ({ error: { message: "relation audit_logs does not exist" } }) }) };
const meta = { ip: "1.2.3.4", userAgent: "UA", origin: "https://x" };

(async () => {
  await writeAuditRow(ok as never, meta, { actorId: "u1", actorEmail: "a@b.c", action: "payment.confirmed", entityType: "user", entityId: "u2", details: { amount: 120 } });
  eq("table", inserted[0].table, "audit_logs");
  eq("row", inserted[0].row, { actor_id: "u1", actor_email: "a@b.c", action: "payment.confirmed", entity_type: "user", entity_id: "u2", details: { amount: 120 }, ip_address: "1.2.3.4", user_agent: "UA", origin: "https://x" });
  await writeAuditRow(ok as never, meta, { action: "x" });
  eq("empty fields are null and details default to {}", inserted[1].row, { actor_id: null, actor_email: null, action: "x", entity_type: null, entity_id: null, details: {}, ip_address: "1.2.3.4", user_agent: "UA", origin: "https://x" });
  let msg = "";
  await writeAuditRow(bad as never, meta, { action: "x" }).catch((e) => { msg = e.message; });
  eq("a failed write is thrown, so callers can see it", msg, "relation audit_logs does not exist");
  console.log(fail ? `${fail} FAILED` : "audit-write: all checks passed");
  process.exit(fail ? 1 : 0);
})();
