// Run with: npx tsx tests/row-outbox.test.ts
import { applyRows, deleteRow, pushRowSave, saveRow, waitingParents, waitingRowIds, type RowApi, type RowSaveItem } from "../src/lib/row-outbox";
import { runOutbox, type OutboxItem, type OutboxStore } from "../src/lib/outbox";
const eq = (a: unknown, b: unknown, m: string) => { const ok = JSON.stringify(a) === JSON.stringify(b); console.log(ok ? "PASS" : "FAIL", m, ok ? "" : `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); if (!ok) process.exitCode = 1; };

type Calls = { log: string[]; upserts: Record<string, unknown>[]; updates: { id: string; patch: Record<string, unknown> }[]; inserted: Record<string, unknown>[]; removed: string[] };
function fakeApi(opts: { errors?: unknown[]; sweep?: string[]; deleteError?: unknown } = {}) {
  const calls: Calls = { log: [], upserts: [], updates: [], inserted: [], removed: [] };
  const errors = [...(opts.errors ?? [])];
  const api: RowApi = {
    async upload(_b, path) { calls.log.push(`upload ${path}`); return { error: null }; },
    async upsert(t, row) { calls.log.push(`upsert ${t}`); calls.upserts.push(row); return { error: errors.shift() ?? null }; },
    async update(t, id, patch) { calls.log.push(`update ${t}`); calls.updates.push({ id, patch }); return { error: errors.shift() ?? null }; },
    async deleteRow(t, id) { calls.log.push(`delete ${t} ${id}`); return { error: opts.deleteError ?? null }; },
    async deleteWhere(t, c, v) { calls.log.push(`deleteWhere ${t} ${c}=${v}`); return { error: null }; },
    async insertMany(t, rows) { calls.log.push(`insertMany ${t}`); calls.inserted.push(...rows); return { error: null }; },
    async selectColumn() { return { values: opts.sweep ?? [], error: null }; },
    async remove(b, paths) { calls.removed.push(...paths.map((p) => `${b}:${p}`)); },
  };
  return { api, calls };
}
const memStore = (): OutboxStore & { items: OutboxItem[] } => ({
  items: [] as OutboxItem[],
  async list() { return this.items; },
  async put(i) { this.items = this.items.filter((x) => x.id !== i.id).concat(i); },
  async remove(id) { this.items = this.items.filter((x) => x.id !== id); },
});
const photo = () => new File([new Uint8Array([1])], "r.jpg", { type: "image/jpeg" });
const trip = { name: "Miami", start_date: "2026-11-01", currency: "USD" };

(async () => {
  // new row, online
  let f = fakeApi(), st = memStore();
  let r = await saveRow({ api: f.api, store: st, userId: "u", table: "trips", row: trip, online: true, label: "Miami", summary: "Trip · new" });
  eq([r.queued, f.calls.upserts[0].id === r.id, f.calls.upserts[0].user_id, f.calls.upserts[0].name, st.items.length], [false, true, "u", "Miami", 0], "online: a new row is saved with its own id and owner");

  // new row offline then sync
  f = fakeApi(); st = memStore();
  r = await saveRow({ api: f.api, store: st, userId: "u", table: "trips", row: trip, online: false, label: "Miami", summary: "Trip · new" });
  eq([r.queued, f.calls.log.length, st.items.length], [true, 0, 1], "offline: nothing sent, the row waits");
  eq((await pushRowSave(f.api, st.items[0] as RowSaveItem)).kind, "synced", "…and is sent later");
  eq(f.calls.upserts[0].id, r.id, "…under the same id");

  // edit sends only the change
  f = fakeApi(); st = memStore();
  await saveRow({ api: f.api, store: st, userId: "u", table: "trips", id: "t1", row: { name: "New name" }, online: true, label: "x", summary: "Trip · changed" });
  eq([f.calls.updates[0].id, f.calls.updates[0].patch, f.calls.upserts.length], ["t1", { name: "New name" }, 0], "an edit updates only what changed");

  // two offline edits merge
  f = fakeApi(); st = memStore();
  await saveRow({ api: f.api, store: st, userId: "u", table: "trips", id: "t1", row: { name: "A", notes: "n" }, online: false, label: "x", summary: "s" });
  await saveRow({ api: f.api, store: st, userId: "u", table: "trips", id: "t1", row: { name: "B" }, waiting: st.items[0], online: false, label: "x", summary: "s" });
  eq([st.items.length, (st.items[0] as RowSaveItem).row], [1, { name: "B", notes: "n" }], "two offline edits are one item, keeping both fields");
  // a new row edited offline stays new
  f = fakeApi(); st = memStore();
  r = await saveRow({ api: f.api, store: st, userId: "u", table: "trips", row: trip, online: false, label: "x", summary: "s" });
  await saveRow({ api: f.api, store: st, userId: "u", table: "trips", id: r.id, row: { name: "Renamed" }, waiting: st.items[0], online: false, label: "x", summary: "s" });
  const still = st.items[0] as RowSaveItem;
  eq([st.items.length, still.isNew, still.row.name, still.row.start_date], [1, true, "Renamed", "2026-11-01"], "editing a waiting new row keeps it new and complete");

  // file
  f = fakeApi(); st = memStore();
  const kept: string[] = [];
  r = await saveRow({ api: f.api, store: st, userId: "u", table: "personal_expenses", row: { amount: 5 }, file: photo(), fileColumn: "receipt_path", bucket: "receipts", folder: "p1", online: false, keep: async (p) => { kept.push(p); }, label: "x", summary: "s" });
  eq([kept[0] === r.path, String(r.path).startsWith("u/p1/")], [true, true], "offline: the receipt is kept locally under the owner's folder");
  await pushRowSave(f.api, st.items[0] as RowSaveItem);
  eq([f.calls.log, f.calls.upserts[0].receipt_path === r.path], [[`upload ${r.path}`, "upsert personal_expenses"], true], "sent: file first, then the row with its path");
  // edit with a new receipt removes the old
  f = fakeApi(); st = memStore();
  await saveRow({ api: f.api, store: st, userId: "u", table: "personal_expenses", id: "e1", row: { amount: 6 }, file: photo(), fileColumn: "receipt_path", bucket: "receipts", folder: "p1", currentPath: "u/p1/old.jpg", online: true, label: "x", summary: "s" });
  eq(f.calls.removed, ["receipts:u/p1/old.jpg"], "a replaced receipt is removed afterwards");

  // children replace
  f = fakeApi(); st = memStore();
  await saveRow({ api: f.api, store: st, userId: "u", table: "grocery_receipts", row: { store: "S" }, children: { table: "grocery_items", fk: "receipt_id", rows: [{ id: "i1", name: "Milk" }, { id: "i2", name: "Eggs" }] }, online: true, label: "x", summary: "s" });
  eq([f.calls.log.map((l) => l.split(" ")[0]), f.calls.inserted.map((i) => i.receipt_id === f.calls.upserts[0].id)], [["upsert", "deleteWhere", "insertMany"], [true, true]], "child rows replace the old ones and point at the parent");

  // network error keeps it
  f = fakeApi({ errors: [{ message: "Failed to fetch" }] }); st = memStore();
  r = await saveRow({ api: f.api, store: st, userId: "u", table: "trips", row: trip, online: true, label: "x", summary: "s" });
  eq([r.queued, st.items.length], [true, 1], "a dropped connection keeps the row");
  // real error shown
  f = fakeApi({ errors: [{ code: "42501", message: "row-level security" }] }); st = memStore();
  let msg = "";
  await saveRow({ api: f.api, store: st, userId: "u", table: "trips", row: trip, online: true, label: "x", summary: "s" }).catch((e: Error) => { msg = e.message; });
  eq([msg, st.items.length], ["You no longer have permission to change this.", 0], "a permission problem is shown, not kept");

  // dependency: an expense on a trip that is still waiting
  f = fakeApi(); st = memStore();
  const t = await saveRow({ api: f.api, store: st, userId: "u", table: "trips", row: trip, online: false, label: "Miami", summary: "Trip · new" });
  eq(await waitingParents(st, [t.id, "other", null]), [t.id], "a parent that is still waiting is found");
  const e = await saveRow({ api: f.api, store: st, userId: "u", table: "personal_expenses", row: { amount: 1, trip_id: t.id }, dependsOn: await waitingParents(st, [t.id]), online: true, label: "x", summary: "s" });
  eq([e.queued, f.calls.log.length], [true, 0], "online, but its trip is still waiting, so it waits too");
  const handlers = { "row.save": (i: OutboxItem) => pushRowSave(f.api, i as RowSaveItem) };
  const res = await runOutbox(st, handlers, async () => ({ userId: "u", offline: false }), "u");
  eq([res.synced, f.calls.log.filter((l) => l.startsWith("upsert")), st.items.length], [2, ["upsert trips", "upsert personal_expenses"], 0], "when back online the trip goes first, then the expense");

  // screen
  const items: OutboxItem[] = [];
  const s2 = memStore();
  const a = await saveRow({ api: fakeApi().api, store: s2, userId: "u", table: "trips", row: { name: "Brand new", start_date: "2026-12-01" }, online: false, label: "x", summary: "s" });
  await saveRow({ api: fakeApi().api, store: s2, userId: "u", table: "trips", id: "t1", row: { name: "Edited" }, online: false, label: "x", summary: "s" });
  await deleteRow({ api: fakeApi().api, store: s2, userId: "u", table: "trips", id: "t2", online: false, label: "x", summary: "s" });
  items.push(...s2.items);
  const shown = applyRows([{ id: "t1", name: "Old" }, { id: "t2", name: "Gone" }, { id: "t3", name: "Same" }] as { id: string; name: string }[], items, "trips");
  eq(shown.map((x) => `${x.id === a.id ? "new" : x.id}:${x.name}`), ["t1:Edited", "t3:Same", "new:Brand new"], "waiting edits show, deletes hide, new rows are added");
  eq(applyRows([] as { id: string }[], items, "trips", () => false).length, 0, "a new row that belongs to another list is not added");
  eq(applyRows([{ id: "t1" }] as { id: string }[], items, "projects").length, 1, "other tables are left alone");
  eq([...waitingRowIds(items, "trips")].sort(), [a.id, "t1", "t2"].sort(), "ids with something waiting");

  // delete
  f = fakeApi({ sweep: ["u/t1/a.jpg"] }); st = memStore();
  await deleteRow({ api: f.api, store: st, userId: "u", table: "trips", id: "t1", sweep: [{ table: "expenses", fk: "trip_id", column: "receipt_path", bucket: "receipts" }], online: true, label: "x", summary: "s" });
  eq([f.calls.log, f.calls.removed], [["delete trips t1"], ["receipts:u/t1/a.jpg"]], "online delete removes the row and the files of what goes with it");
  f = fakeApi(); st = memStore();
  const d = await deleteRow({ api: f.api, store: st, userId: "u", table: "trips", id: "t1", online: false, label: "x", summary: "s" });
  eq([d.queued, st.items[0].kind], [true, "row.delete"], "offline delete waits");
  // deleting a never-sent trip also drops what waited on it
  f = fakeApi(); st = memStore();
  const nt = await saveRow({ api: f.api, store: st, userId: "u", table: "trips", row: trip, online: false, label: "x", summary: "s" });
  await saveRow({ api: f.api, store: st, userId: "u", table: "personal_expenses", row: { amount: 1 }, dependsOn: [nt.id], online: false, label: "x", summary: "s" });
  const dd = await deleteRow({ api: f.api, store: st, userId: "u", table: "trips", id: nt.id, waiting: st.items.find((i) => i.id === nt.id), online: false, label: "x", summary: "s" });
  eq([dd.queued, st.items.length], [false, 0], "deleting a trip that never reached the server drops it and what waited on it");
})();
