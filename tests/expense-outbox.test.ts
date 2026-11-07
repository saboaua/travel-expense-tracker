// Run with: npx tsx tests/expense-outbox.test.ts
import { applyExpenseOutbox, deleteExpenseChange, pushExpenseUpdate, saveExpenseChange, type ExpenseChangeApi, type ExpenseFields, type ExpenseUpdateItem } from "../src/lib/expense-outbox";
import type { OutboxItem, OutboxStore } from "../src/lib/outbox";
const eq = (a: unknown, b: unknown, m: string) => { const ok = JSON.stringify(a) === JSON.stringify(b); console.log(ok ? "PASS" : "FAIL", m, ok ? "" : `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); if (!ok) process.exitCode = 1; };

function fakeApi(opts: { updateErrors?: unknown[]; deleteError?: unknown } = {}) {
  const calls = { uploads: [] as string[], updates: [] as { id: string; patch: Record<string, unknown> }[], deletes: [] as string[], removed: [] as string[] };
  const errors = [...(opts.updateErrors ?? [])];
  const api: ExpenseChangeApi = {
    async upload(path) { calls.uploads.push(path); return { error: null }; },
    async update(id, patch) { calls.updates.push({ id, patch }); return { error: errors.shift() ?? null }; },
    async deleteRow(id) { calls.deletes.push(id); return { error: opts.deleteError ?? null }; },
    async remove(paths) { calls.removed.push(...paths); },
  };
  return { api, calls };
}
const memStore = (): OutboxStore & { items: OutboxItem[] } => ({
  items: [] as OutboxItem[],
  async list() { return this.items; },
  async put(i) { this.items = this.items.filter((x) => x.id !== i.id).concat(i); },
  async remove(id) { this.items = this.items.filter((x) => x.id !== id); },
});
const fields: ExpenseFields = { merchant: "Cafe", amount: 12.5, currency: "USD", exchange_rate: 1, amount_usd: 12.5, category: "Meals", expense_date: "2026-11-01", notes: null };
const photo = (t = "image/jpeg") => new File([new Uint8Array([1])], "r.jpg", { type: t });
const base = { id: "e1", merchant: "Old", amount: 5, currency: "USD", exchange_rate: 1, amount_usd: 5, category: "Other", expense_date: "2026-10-30", notes: null, receipt_path: "u/t1/old.jpg" };

(async () => {
  let f = fakeApi(), st = memStore();
  let r = await saveExpenseChange({ api: f.api, store: st, userId: "u", expenseId: "e1", tripId: "t1", fields, online: true });
  eq([r.queued, f.calls.updates[0].id, f.calls.updates[0].patch.merchant, "receipt_path" in f.calls.updates[0].patch, st.items.length], [false, "e1", "Cafe", false, 0], "online: the change is saved and the receipt is left alone");

  f = fakeApi(); st = memStore();
  r = await saveExpenseChange({ api: f.api, store: st, userId: "u", expenseId: "e1", tripId: "t1", fields, file: photo(), currentPath: "u/t1/old.jpg", online: true });
  eq([f.calls.uploads.length, String(f.calls.updates[0].patch.receipt_path).startsWith("u/t1/"), f.calls.removed], [1, true, ["u/t1/old.jpg"]], "a new receipt is uploaded, saved, and the old one removed afterwards");

  f = fakeApi(); st = memStore();
  const kept: string[] = [];
  r = await saveExpenseChange({ api: f.api, store: st, userId: "u", expenseId: "e1", tripId: "t1", fields, file: photo(), currentPath: "u/t1/old.jpg", online: false, keep: async (p) => { kept.push(p); } });
  eq([r.queued, f.calls.updates.length, st.items.length, kept[0] === r.path], [true, 0, 1, true], "offline: nothing is sent, the change waits and its receipt is kept locally");
  const item = st.items[0] as ExpenseUpdateItem;
  eq((await pushExpenseUpdate(f.api, item)).kind, "synced", "later it is sent");
  eq([f.calls.uploads.length, f.calls.updates[0].patch.receipt_path === r.path, f.calls.removed], [1, true, ["u/t1/old.jpg"]], "…with its receipt, replacing the old one");

  // lost connection after the upload
  f = fakeApi({ updateErrors: [{ message: "TypeError: Failed to fetch" }] }); st = memStore();
  r = await saveExpenseChange({ api: f.api, store: st, userId: "u", expenseId: "e1", tripId: "t1", fields, file: photo(), online: true });
  const w = st.items[0] as ExpenseUpdateItem;
  eq([r.queued, w.uploaded], [true, true], "dropped connection after the upload: kept and the upload remembered");
  await pushExpenseUpdate(f.api, w);
  eq(f.calls.uploads.length, 1, "…so the retry does not upload again");

  // two offline edits are one
  f = fakeApi(); st = memStore();
  await saveExpenseChange({ api: f.api, store: st, userId: "u", expenseId: "e1", tripId: "t1", fields, file: photo(), online: false });
  const first = st.items[0];
  await saveExpenseChange({ api: f.api, store: st, userId: "u", expenseId: "e1", tripId: "t1", fields: { ...fields, merchant: "Bar" }, waiting: first, online: false });
  const merged = st.items[0] as ExpenseUpdateItem;
  eq([st.items.length, merged.fields.merchant, merged.path === (first as ExpenseUpdateItem).path], [1, "Bar", true], "two offline edits are one item and keep the waiting receipt");

  // permission
  f = fakeApi({ updateErrors: [{ code: "42501", message: "row-level security" }] }); st = memStore();
  let msg = "";
  await saveExpenseChange({ api: f.api, store: st, userId: "u", expenseId: "e1", tripId: "t1", fields, online: true }).catch((e: Error) => { msg = e.message; });
  eq([msg, st.items.length], ["You no longer have permission to change this expense.", 0], "a permission problem is shown, not kept");

  // screen
  const shown = applyExpenseOutbox([base, { ...base, id: "e2", merchant: "Gone" }, { ...base, id: "e3", merchant: "Same" }], [
    ...memStoreWith(merged),
    { id: "e2", userId: "u", kind: "expense.delete", createdAt: 5, status: "pending", error: null, attempts: 0 },
  ]);
  eq(shown.map((e) => `${e.id}:${e.merchant}`), ["e1:Bar", "e3:Same"], "waiting changes show and waiting deletes hide");
  eq(shown[0].receipt_path === merged.path, true, "a waiting receipt shows on the expense");

  // delete
  f = fakeApi(); st = memStore();
  await deleteExpenseChange({ api: f.api, store: st, userId: "u", expense: base, tripId: "t1", online: true });
  eq([f.calls.deletes, f.calls.removed], [["e1"], ["u/t1/old.jpg"]], "online delete removes the row and the receipt");
  f = fakeApi(); st = memStore();
  const d = await deleteExpenseChange({ api: f.api, store: st, userId: "u", expense: base, tripId: "t1", online: false });
  eq([d.queued, f.calls.deletes.length, st.items[0].kind], [true, 0, "expense.delete"], "offline delete waits");
  f = fakeApi(); st = memStore();
  await saveExpenseChange({ api: f.api, store: st, userId: "u", expenseId: "e1", tripId: "t1", fields, file: photo(), currentPath: base.receipt_path, online: false });
  await deleteExpenseChange({ api: f.api, store: st, userId: "u", expense: base, tripId: "t1", waiting: st.items[0], online: false });
  eq([st.items.length, st.items[0].kind, (st.items[0] as unknown as { paths: string[] }).paths.length], [1, "expense.delete", 2], "a delete replaces a waiting change and also cleans up its receipts");
  f = fakeApi({ deleteError: { message: "Failed to fetch" } }); st = memStore();
  eq((await deleteExpenseChange({ api: f.api, store: st, userId: "u", expense: base, tripId: "t1", online: true })).queued, true, "delete interrupted by the connection is kept");
})();

function memStoreWith(i: OutboxItem): OutboxItem[] { return [i]; }
