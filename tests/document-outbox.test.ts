// Run with: npx tsx tests/document-outbox.test.ts
import { applyDocumentOutbox, deleteDocument, pushDocumentSave, saveDocument, isDocumentSave, type DocumentApi, type DocumentSaveItem } from "../src/lib/document-outbox";
import type { TravelDocument } from "../src/lib/documents";
import type { OutboxItem, OutboxStore } from "../src/lib/outbox";
const eq = (a: unknown, b: unknown, m: string) => { const ok = JSON.stringify(a) === JSON.stringify(b); console.log(ok ? "PASS" : "FAIL", m, ok ? "" : `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); if (!ok) process.exitCode = 1; };

function fakeApi(opts: { upsertErrors?: unknown[]; uploadError?: unknown; deleteError?: unknown } = {}) {
  const calls = { uploads: [] as string[], upserts: [] as Record<string, unknown>[], deletes: [] as string[], removed: [] as string[] };
  const errors = [...(opts.upsertErrors ?? [])];
  const api: DocumentApi = {
    async upload(path) { calls.uploads.push(path); return { error: opts.uploadError ?? null }; },
    async upsert(row) { calls.upserts.push(row); return { error: errors.shift() ?? null }; },
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
const pdf = (n = "visa.pdf") => new File([new Uint8Array([1, 2])], n, { type: "application/pdf" });
const fields = { kind: "visa" as const, title: "Visa", document_number: "", issuing_country: "US", expiry_date: "2030-01-01", notes: "" };
const doc = (o: Partial<TravelDocument> = {}): TravelDocument => ({ id: "d1", user_id: "u", trip_id: null, kind: "passport", title: "Passport", issuing_country: null, expiry_date: null, notes: null, file_path: "u/general/old-p.pdf", created_at: "", ...o });
const missingCol = { code: "42703", message: "column travel_documents.document_number does not exist" };

(async () => {
  // online
  let f = fakeApi(), st = memStore();
  let r = await saveDocument({ api: f.api, store: st, userId: "u", doc: null, fields, file: pdf(), online: true });
  eq([f.calls.uploads.length, r.queued, st.items.length, f.calls.upserts[0].id === r.doc.id, f.calls.upserts[0].user_id, f.calls.upserts[0].trip_id, "document_number" in f.calls.upserts[0]], [1, false, 0, true, "u", null, false], "online: a new document uploads and saves with its own id; no number column is sent without a number");
  eq(String(f.calls.uploads[0]).startsWith("u/general/"), true, "the file goes under the user's general folder");

  // in a trip
  f = fakeApi(); st = memStore();
  await saveDocument({ api: f.api, store: st, userId: "u", doc: null, tripId: "t1", fields, file: pdf(), online: true });
  eq([String(f.calls.uploads[0]).startsWith("u/t1/"), f.calls.upserts[0].trip_id], [true, "t1"], "a trip document keeps its trip and folder");

  // a typed number is sent
  f = fakeApi(); st = memStore();
  await saveDocument({ api: f.api, store: st, userId: "u", doc: null, fields: { ...fields, document_number: " P123 " }, online: true });
  eq([f.calls.upserts[0].document_number, f.calls.upserts[0].file_path], ["P123", null], "the number is trimmed and sent; no file means no path");

  // offline then sync
  f = fakeApi(); st = memStore();
  const kept: string[] = [];
  r = await saveDocument({ api: f.api, store: st, userId: "u", doc: null, fields, file: pdf(), online: false, keep: async (p) => { kept.push(p); } });
  eq([f.calls.uploads.length, f.calls.upserts.length, r.queued, st.items.length, r.doc.file_path === kept[0]], [0, 0, true, 1, true], "offline: nothing sent, the document waits with its file kept locally");
  const sent = await pushDocumentSave(f.api, st.items[0] as DocumentSaveItem);
  eq([sent.kind, f.calls.uploads.length, f.calls.upserts[0].id === r.doc.id], ["synced", 1, true], "later: the document uploads and saves under the same id");

  // connection lost after upload
  f = fakeApi({ upsertErrors: [{ message: "TypeError: Failed to fetch" }] }); st = memStore();
  r = await saveDocument({ api: f.api, store: st, userId: "u", doc: null, fields, file: pdf(), online: true });
  const w = st.items[0] as DocumentSaveItem;
  eq([r.queued, w.uploaded], [true, true], "dropped connection after the upload: kept, and the upload is remembered");
  await pushDocumentSave(f.api, w);
  eq(f.calls.uploads.length, 1, "…so the retry does not upload again");

  // edit
  f = fakeApi(); st = memStore();
  await saveDocument({ api: f.api, store: st, userId: "u", doc: doc(), fields, online: true });
  eq(["file_path" in f.calls.upserts[0], f.calls.removed, f.calls.upserts[0].trip_id, f.calls.upserts[0].id], [false, [], null, "d1"], "edit with no new file leaves the file alone and sends a full row");
  await saveDocument({ api: f.api, store: st, userId: "u", doc: doc(), fields, file: pdf("new.pdf"), online: true });
  eq([f.calls.upserts[1].file_path !== "u/general/old-p.pdf", f.calls.removed], [true, ["u/general/old-p.pdf"]], "a new file replaces the old one, which is removed afterwards");
  await saveDocument({ api: f.api, store: st, userId: "u", doc: doc({ document_number: "X1" }), fields, online: true });
  eq(f.calls.upserts[2].document_number, null, "clearing the number on a database that has the column sends null");

  // wrong file type / too big
  let msg = "";
  await saveDocument({ api: f.api, store: st, userId: "u", doc: null, fields, file: new File([new Uint8Array([1])], "x.exe", { type: "application/x-msdownload" }), online: false }).catch((e: Error) => { msg = e.message; });
  eq(msg, "Use a PDF or a photo (JPG, PNG, WebP or HEIC).", "a wrong file type is refused, even offline");
  eq(st.items.length, 0, "…and nothing is kept");

  // old database without the number column
  f = fakeApi({ upsertErrors: [missingCol] }); st = memStore();
  r = await saveDocument({ api: f.api, store: st, userId: "u", doc: doc({ document_number: null }), fields, online: true });
  eq([r.queued, f.calls.upserts.length, "document_number" in f.calls.upserts[1]], [false, 2, false], "no number column: a document with no number still saves");
  f = fakeApi({ upsertErrors: [missingCol] }); st = memStore();
  msg = "";
  await saveDocument({ api: f.api, store: st, userId: "u", doc: null, fields: { ...fields, document_number: "P1" }, online: true }).catch((e: Error) => { msg = e.message; });
  eq(/migration_documents_number/.test(msg), true, "no number column: a typed number gives the clear message");

  // missing bucket
  f = fakeApi({ uploadError: { message: "Bucket not found" } }); st = memStore();
  msg = "";
  await saveDocument({ api: f.api, store: st, userId: "u", doc: null, fields, file: pdf(), online: true }).catch((e: Error) => { msg = e.message; });
  eq(/migration_documents\.sql/.test(msg), true, "missing storage bucket gives the clear message");

  // permission problem
  f = fakeApi({ upsertErrors: [{ code: "42501", message: "new row violates row-level security policy" }] }); st = memStore();
  msg = "";
  await saveDocument({ api: f.api, store: st, userId: "u", doc: null, fields, online: true }).catch((e: Error) => { msg = e.message; });
  eq([msg, st.items.length], ["You no longer have permission to change this document.", 0], "a permission problem is shown, not kept");

  // two offline edits = one item
  f = fakeApi(); st = memStore();
  r = await saveDocument({ api: f.api, store: st, userId: "u", doc: null, fields, file: pdf("one.pdf"), online: false });
  const first = st.items[0] as DocumentSaveItem;
  const r2 = await saveDocument({ api: f.api, store: st, userId: "u", doc: r.doc, waiting: first, fields: { ...fields, title: "Visa 2" }, file: pdf("two.pdf"), online: false });
  const merged = st.items[0] as DocumentSaveItem;
  eq([st.items.length, merged.isNew, merged.row.title, merged.path === r2.doc.file_path, merged.path !== first.path], [1, true, "Visa 2", true, true], "two offline edits are one waiting item, still new, with the latest file");
  const r3 = await saveDocument({ api: f.api, store: st, userId: "u", doc: r2.doc, waiting: merged, fields, online: false });
  eq([(st.items[0] as DocumentSaveItem).path === r3.doc.file_path, st.items.length], [true, 1], "a later edit without a file keeps the waiting file");

  // what the screen shows
  const list = applyDocumentOutbox([doc({ id: "x", title: "Old" }), doc({ id: "y", title: "Gone" })], [
    ...st.items,
    { id: "y", userId: "u", kind: "document.delete", createdAt: 9, status: "pending", error: null, attempts: 0 },
  ]);
  eq(list.map((d) => d.title).sort(), ["Old", "Visa"], "waiting saves show and waiting deletes hide");
  eq(applyDocumentOutbox([], st.items, "t1").length, 0, "a waiting general document does not show in a trip's list");
  eq([isDocumentSave(st.items[0])], [true], "kind guard works");

  // delete
  f = fakeApi(); st = memStore();
  await deleteDocument({ api: f.api, store: st, userId: "u", doc: doc(), online: true });
  eq([f.calls.deletes, f.calls.removed], [["d1"], ["u/general/old-p.pdf"]], "online delete removes the row and the file");
  f = fakeApi(); st = memStore();
  const d = await deleteDocument({ api: f.api, store: st, userId: "u", doc: doc(), online: false });
  eq([d.queued, f.calls.deletes.length, st.items[0].kind], [true, 0, "document.delete"], "offline delete waits on the phone");
  f = fakeApi(); st = memStore();
  const made = await saveDocument({ api: f.api, store: st, userId: "u", doc: null, fields, file: pdf(), online: false });
  const drop = await deleteDocument({ api: f.api, store: st, userId: "u", doc: made.doc, waiting: st.items[0], online: false });
  eq([drop.queued, st.items.length, f.calls.removed.length], [false, 0, 1], "deleting a document that never reached the server drops it and its file");
  f = fakeApi({ deleteError: { message: "Failed to fetch" } }); st = memStore();
  const net = await deleteDocument({ api: f.api, store: st, userId: "u", doc: doc(), online: true });
  eq([net.queued, st.items.length], [true, 1], "delete interrupted by the connection is kept");
})();
