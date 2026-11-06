// Run with: npx tsx tests/outbox.test.ts
import { nounFor, runOutbox, withKind, type Handlers, type OutboxItem, type OutboxStore, type PushOutcome } from "../src/lib/outbox";

let fail = 0;
const eq = (n: string, g: unknown, w: unknown) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fail++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : `got=${JSON.stringify(g)} want=${JSON.stringify(w)}`); };

const it = (id: string, kind: string, over: Partial<OutboxItem> = {}): OutboxItem => ({ id, userId: "u1", kind, createdAt: 1, status: "pending", error: null, attempts: 0, ...over });
const memStore = (items: OutboxItem[]): OutboxStore & { items: OutboxItem[] } => ({
  items,
  async list() { return this.items.map((i) => ({ ...i })); },
  async put(i) { this.items = this.items.filter((x) => x.id !== i.id).concat({ ...i }); },
  async remove(id) { this.items = this.items.filter((x) => x.id !== id); },
});
const me = async () => ({ userId: "u1", offline: false });
const sent: string[] = [];
const ok = async (): Promise<PushOutcome> => ({ kind: "synced" });
const handlers = (over: Handlers = {}): Handlers => ({
  "trip.create": async (i) => { sent.push(i.id); return ok(); },
  "card.save": async (i) => { sent.push(i.id); return ok(); },
  ...over,
});

(async () => {
  let store = memStore([it("b", "card.save", { createdAt: 2 }), it("a", "trip.create", { createdAt: 1 })]);
  let r = await runOutbox(store, handlers(), me, "u1");
  eq("every kind is sent, oldest first", [sent.splice(0), r.synced, r.syncedKinds], [["a", "b"], 2, ["trip.create", "card.save"]]);

  store = memStore([it("exp", "card.save", { createdAt: 1, dependsOn: ["trip"] }), it("trip", "trip.create", { createdAt: 2 })]);
  r = await runOutbox(store, handlers(), me, "u1");
  eq("an item waits for what it depends on, even when it is older", [sent.splice(0), r.synced, store.items.length], [["trip", "exp"], 2, 0]);

  store = memStore([it("exp", "card.save", { createdAt: 2, dependsOn: ["trip"] }), it("trip", "trip.create", { createdAt: 1, status: "conflict", error: "x" })]);
  r = await runOutbox(store, handlers(), me, "u1");
  eq("nothing is sent while what it depends on needs attention", [sent.splice(0), r.synced, store.items.map((i) => i.id).sort()], [[], 0, ["exp", "trip"]]);

  store = memStore([it("exp", "card.save", { createdAt: 2, dependsOn: ["gone"] })]);
  r = await runOutbox(store, handlers(), me, "u1");
  eq("a dependency that no longer exists does not block", [sent.splice(0), r.synced], [["exp"], 1]);

  store = memStore([it("x", "future.kind"), it("a", "trip.create", { createdAt: 2 })]);
  r = await runOutbox(store, handlers(), me, "u1");
  eq("a kind this version does not know is left alone, not dropped", [sent.splice(0), r.synced, r.remaining, store.items[0].id], [["a"], 1, 1, "x"]);

  store = memStore([it("a", "trip.create", { createdAt: 1 }), it("b", "card.save", { createdAt: 2 })]);
  r = await runOutbox(store, handlers({ "trip.create": async () => ({ kind: "offline" }) }), me, "u1");
  eq("no connection stops at the first item and keeps the rest", [r.offline, r.synced, store.items.length], [true, 0, 2]);

  store = memStore([it("a", "trip.create", { attempts: 4 })]);
  r = await runOutbox(store, handlers({ "trip.create": async () => ({ kind: "failed", message: "boom" }) }), me, "u1");
  eq("five failures stop the retries", [store.items[0].status, store.items[0].attempts, store.items[0].error], ["failed", 5, "boom"]);

  store = memStore([it("a", "trip.create")]);
  r = await runOutbox(store, handlers({ "trip.create": async () => ({ kind: "conflict", message: "gone" }) }), me, "u1");
  eq("a conflict is shown, not retried", [store.items[0].status, store.items[0].attempts], ["conflict", 1]);

  store = memStore([it("a", "trip.create"), it("o", "card.save", { userId: "u2" })]);
  r = await runOutbox(store, handlers(), async () => ({ userId: "u2", offline: false }), "u1");
  eq("nothing is sent when a different person is signed in", [sent.splice(0), r.synced, store.items.length], [[], 0, 2]);
  r = await runOutbox(store, handlers(), me, "u1");
  eq("another person's items are never touched", [sent.splice(0), store.items.map((i) => i.id)], [["a"], ["o"]]);

  eq("old saved items count as expenses", [withKind({ id: "1", userId: "u", createdAt: 1, status: "pending", error: null, attempts: 0 } as OutboxItem).kind, withKind(it("2", "trip.create")).kind], ["expense.create", "trip.create"]);

  eq("words: one kind", [nounFor(["expense.create"]), nounFor(["expense.create", "expense.create"])], ["receipt", "receipts"]);
  eq("words: mixed or unknown kinds", [nounFor(["expense.create", "trip.create"]), nounFor(["trip.create"], 1), nounFor([])], ["changes", "change", "changes"]);

  if (fail) process.exitCode = 1;
})();
