import { classifyError, pushExpense, receiptPathFor, runSync, type QueuedExpense, type QueueStore, type SyncApi } from "../src/lib/offline-queue";
let fail = 0;
const eq = (n: string, g: unknown, w: unknown) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fail++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : `got=${JSON.stringify(g)} want=${JSON.stringify(w)}`); };

// --- classifying errors
eq("fetch failure is a network problem", classifyError({ message: "TypeError: Failed to fetch" }), "network");
eq("Safari wording", classifyError({ message: "Load failed" }), "network");
eq("duplicate key means already saved", classifyError({ code: "23505", message: "duplicate key value" }), "duplicate");
eq("storage conflict means already uploaded", classifyError({ statusCode: "409", message: "The resource already exists" }), "duplicate");
eq("deleted trip is a conflict", classifyError({ code: "23503", message: "violates foreign key constraint" }), "conflict");
eq("row level security is a conflict", classifyError({ code: "42501", message: "new row violates row-level security policy" }), "conflict");
eq("expired token waits for sign-in", classifyError({ message: "JWT expired", code: "PGRST301" }), "auth");
eq("anything else is a plain failure", classifyError({ code: "22P02", message: "invalid input syntax" }), "failed");
eq("a coding mistake is not hidden as 'offline'", classifyError(new TypeError("x is undefined")), "failed");

// --- storage path keeps the owner as the first folder
const jpg = new Blob(["x"], { type: "image/jpeg" });
eq("path: owner/trip/id.ext", receiptPathFor("u1", "t1", "e1", jpg), "u1/t1/e1.jpg");
eq("path uses the file name when the type is unknown", receiptPathFor("u1", "t1", "e1", new Blob(["x"]), "scan.PDF"), "u1/t1/e1.pdf");

// --- sync
const item = (over: Partial<QueuedExpense> = {}): QueuedExpense => ({
  id: "e1", userId: "u1", tripId: "t1", createdAt: 1, merchant: "Cafe", amount: 10, currency: "USD", exchangeRate: 1, amountUsd: 10,
  category: "Meals", expenseDate: "2026-11-04", notes: null, image: jpg, imageName: "a.jpg", uploaded: false, status: "pending", error: null, attempts: 0, ...over,
});
const memStore = (items: QueuedExpense[]): QueueStore & { items: QueuedExpense[] } => ({
  items,
  async list() { return this.items.map((i) => ({ ...i })); },
  async put(i) { this.items = this.items.filter((x) => x.id !== i.id).concat({ ...i }); },
  async remove(id) { this.items = this.items.filter((x) => x.id !== id); },
});
type Calls = { uploads: string[]; inserts: Record<string, unknown>[] };
const fakeApi = (opts: { user?: string | null; offline?: boolean; upload?: unknown; insert?: unknown } = {}): SyncApi & Calls => ({
  uploads: [], inserts: [],
  async currentUser() { return { userId: opts.user === undefined ? "u1" : opts.user, offline: !!opts.offline }; },
  async upload(path) { this.uploads.push(path); return { error: opts.upload ?? null }; },
  async insertExpense(row) { this.inserts.push(row); return { error: opts.insert ?? null }; },
});

(async () => {
  // success: photo then row, item leaves the queue, same id used for both
  let store = memStore([item()]); let api = fakeApi();
  let r = await runSync(store, api, "u1");
  eq("syncs and empties the queue", [r.synced, r.remaining, store.items.length], [1, 0, 0]);
  eq("photo path and row id match the captured id", [api.uploads[0], api.inserts[0].id, api.inserts[0].receipt_path, api.inserts[0].user_id], ["u1/t1/e1.jpg", "e1", "u1/t1/e1.jpg", "u1"]);
  eq("frozen USD amount is sent as captured", [api.inserts[0].amount, api.inserts[0].amount_usd, api.inserts[0].exchange_rate], [10, 10, 1]);

  // offline: nothing lost, nothing counted as an attempt
  store = memStore([item()]); api = fakeApi({ offline: true });
  r = await runSync(store, api, "u1");
  eq("no connection keeps everything", [r.synced, r.remaining, r.offline, store.items[0].attempts], [0, 1, true, 0]);

  // connection drops during the upload
  store = memStore([item()]); api = fakeApi({ upload: { message: "TypeError: Failed to fetch" } });
  r = await runSync(store, api, "u1");
  eq("dropped upload keeps the item pending", [r.synced, r.offline, store.items[0].status, store.items[0].attempts], [0, true, "pending", 0]);

  // photo uploaded, then the connection drops: the retry must not upload again
  store = memStore([item()]); api = fakeApi({ insert: { message: "Failed to fetch" } });
  await runSync(store, api, "u1");
  eq("photo is remembered as uploaded", store.items[0].uploaded, true);
  api = fakeApi();
  r = await runSync(store, api, "u1");
  eq("retry skips the upload and finishes", [api.uploads.length, api.inserts.length, r.synced], [0, 1, 1]);

  // lost reply: server already has the row
  store = memStore([item()]); api = fakeApi({ insert: { code: "23505", message: "duplicate key" }, upload: { statusCode: "409", message: "already exists" } });
  r = await runSync(store, api, "u1");
  eq("already-saved counts as done, no duplicate", [r.synced, store.items.length], [1, 0]);

  // trip deleted meanwhile
  store = memStore([item()]); api = fakeApi({ insert: { code: "23503", message: "violates foreign key constraint" } });
  r = await runSync(store, api, "u1");
  eq("deleted trip becomes a conflict with a clear message", [store.items[0].status, store.items[0].error], ["conflict", "The trip this receipt belongs to no longer exists."]);
  api = fakeApi();
  await runSync(store, api, "u1");
  eq("conflicts are not retried automatically", api.inserts.length, 0);

  // user isolation
  store = memStore([item({ userId: "u2" })]); api = fakeApi({ user: "u1" });
  r = await runSync(store, api, "u1");
  eq("another person's receipts are never touched", [r.synced, api.uploads.length, api.inserts.length, store.items.length], [0, 0, 0, 1]);
  store = memStore([item()]); api = fakeApi({ user: "u2" });
  r = await runSync(store, api, "u1");
  eq("nothing is sent when a different person is signed in", [r.synced, api.inserts.length, store.items.length], [0, 0, 1]);
  store = memStore([item()]); api = fakeApi({ user: null });
  r = await runSync(store, api, "u1");
  eq("nothing is sent when nobody is signed in", [r.synced, api.inserts.length], [0, 0]);

  // order and limits
  store = memStore([item({ id: "b", createdAt: 2 }), item({ id: "a", createdAt: 1 })]); api = fakeApi();
  await runSync(store, api, "u1");
  eq("oldest receipt goes first", api.inserts.map((x) => x.id), ["a", "b"]);
  store = memStore([item({ image: null, imageName: null })]); api = fakeApi();
  await runSync(store, api, "u1");
  eq("receipt with no photo skips the upload", [api.uploads.length, api.inserts[0].receipt_path], [0, null]);
  store = memStore([item({ id: "x" })]); api = fakeApi({ insert: { code: "22P02", message: "bad input" } });
  for (let i = 0; i < 6; i++) await runSync(store, api, "u1");
  eq("repeated failures stop after 5 tries", [store.items[0].status, store.items[0].attempts, api.inserts.length], ["failed", 5, 5]);

  // direct save (online path) reports the outcome
  eq("push: success", (await pushExpense(fakeApi(), item())).kind, "synced");
  eq("push: offline", (await pushExpense(fakeApi({ insert: { message: "Failed to fetch" } }), item())).kind, "offline");
  eq("push: other errors are shown, not queued", (await pushExpense(fakeApi({ insert: { code: "22P02", message: "bad input" } }), item())).kind, "failed");

  process.exit(fail ? 1 : 0);
})();
