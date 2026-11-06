// Run with: npx tsx tests/loyalty.test.ts
import { cleanNumber, detectFormat, displayNumber, filterCards, formatProblem, gtinCheckDigit, colorForName, CARD_COLORS, type LoyaltyCard } from "../src/lib/loyalty";
import { targetSize, BACK_MIGRATION_MESSAGE } from "../src/lib/loyalty-image";
import { applyLoyaltyOutbox, deleteCard, pushLoyaltySave, saveCard, isLoyaltySave, isLoyaltyDelete, type LoyaltyApi, type LoyaltySaveItem } from "../src/lib/loyalty-outbox";
import type { OutboxItem, OutboxStore } from "../src/lib/outbox";
const eq = (a: unknown, b: unknown, m: string) => { const ok = JSON.stringify(a) === JSON.stringify(b); console.log(ok ? "PASS" : "FAIL", m, ok ? "" : `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); if (!ok) process.exitCode = 1; };

// check digits (4006381333931 is a real EAN-13 example, 036000291452 a real UPC-A)
eq(gtinCheckDigit("400638133393"), 1, "EAN-13 check digit");
eq(gtinCheckDigit("03600029145"), 2, "UPC-A check digit");

eq(detectFormat("4006381333931"), "EAN13", "13 valid digits -> EAN-13");
eq(detectFormat("036000291452"), "UPCA", "12 valid digits -> UPC-A");
eq(detectFormat("4006381333932"), "CODE128", "13 digits with a wrong check digit -> CODE128");
eq(detectFormat("4021 8830 1177"), "CODE128", "membership number -> CODE128");
eq(detectFormat("4006 3813 3393 1"), "EAN13", "spaces are ignored");
eq(detectFormat("https://shop.example/card/123"), "QR", "link -> QR");
eq(detectFormat("Müller Karte"), "QR", "non-ASCII -> QR");
eq(detectFormat("x".repeat(60)), "QR", "very long -> QR");
eq(detectFormat(""), "CODE128", "empty -> default");

eq(cleanNumber(" 4021 8830-1177 "), "402188301177", "spaces and dashes removed");
eq(cleanNumber(" https://a.b/c d ", "QR"), "https://a.b/c d", "QR keeps the text");

eq(formatProblem("", "CODE128"), "Enter the card or barcode number.", "empty number");
eq(formatProblem("402188301177", "CODE128"), null, "CODE128 digits ok");
eq(formatProblem("4006381333931", "EAN13"), null, "valid EAN-13");
eq(formatProblem("4006381333932", "EAN13")?.startsWith("EAN-13 needs 13 digits"), true, "bad EAN-13");
eq(formatProblem("123", "UPCA")?.startsWith("UPC-A needs 12 digits"), true, "bad UPC-A");
eq(formatProblem("Müller", "CODE128")?.includes("QR"), true, "CODE128 rejects non-ASCII");
eq(formatProblem("x".repeat(81), "CODE128")?.includes("too long"), true, "CODE128 too long");
eq(formatProblem("anything at all é", "QR"), null, "QR takes any text");

eq(displayNumber("402188301177"), "4021 8830 1177", "digits grouped");
eq(displayNumber("AB-12"), "AB-12", "short codes untouched");

eq(colorForName("Greenfield Market"), colorForName(" greenfield market "), "colour is stable per name");
eq(CARD_COLORS.includes(colorForName("Anything")), true, "colour comes from the palette");
eq([CARD_COLORS.length, new Set(CARD_COLORS).size], [16, 16], "16 distinct colours");
const lum = (h: string) => { const v = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
eq(CARD_COLORS.filter((c) => 1.05 / (lum(c) + 0.05) < 4.5), [], "every colour keeps white text readable (4.5:1)");
eq(colorForName("Greenfield Market"), ["#15803d", "#92400e", "#0e7490", "#7c3aed", "#b91c1c", "#334155", "#1d4ed8", "#be185d"].includes(colorForName("Greenfield Market")) ? colorForName("Greenfield Market") : "", "unset cards keep one of the original eight colours");

eq(targetSize(4000, 3000), { width: 800, height: 600 }, "landscape photo shrunk to 800 px");
eq(targetSize(3000, 4000), { width: 600, height: 800 }, "portrait photo shrunk to 800 px");
eq(targetSize(500, 300), { width: 500, height: 300 }, "small photo is never enlarged");
eq(targetSize(800, 800), { width: 800, height: 800 }, "exactly 800 stays");

const card = (store_name: string, category: string | null, holder_name: string | null = null): LoyaltyCard => ({ id: store_name, user_id: "u", store_name, holder_name, category, card_number: "1", barcode_format: "CODE128", color: null, image_path: null, created_at: "" });
const all = [card("Greenfield Market", "Rewards"), card("Brew & Bean", "Coffee club"), card("Sol Pharmacy", "Care card", "Patrick")];
eq(filterCards(all, "").length, 3, "no search shows all");
eq(filterCards(all, "BREW").map((c) => c.store_name), ["Brew & Bean"], "search by store, any case");
eq(filterCards(all, "coffee").length, 1, "search by category");
eq(filterCards(all, "patrick").length, 1, "search by holder");
eq(filterCards(all, "zzz").length, 0, "no match");

/* ---- saving and deleting cards (online and offline) ---- */
function fakeApi(opts: { upsertErrors?: unknown[]; uploadError?: unknown; deleteError?: unknown } = {}) {
  const calls = { uploads: [] as string[], upserts: [] as Record<string, unknown>[], deletes: [] as string[], removed: [] as string[] };
  const errors = [...(opts.upsertErrors ?? [])];
  const api: LoyaltyApi = {
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
const input = { store_name: "A", card_number: "1", barcode_format: "CODE128" as const };
const img = (n: string) => new File([new Uint8Array([1])], n, { type: "image/webp" });
const missingCol = { code: "42703", message: "column loyalty_cards.back_image_path does not exist" };

(async () => {
  // online
  let f = fakeApi(), st = memStore();
  let r = await saveCard({ api: f.api, store: st, userId: "u", card: null, input, front: img("f"), back: img("b"), online: true });
  const row = f.calls.upserts[0];
  eq([f.calls.uploads.length, r.queued, st.items.length, row.id === r.card.id, row.user_id, !!row.image_path, !!row.back_image_path], [2, false, 0, true, "u", true, true], "online: a new card uploads both photos and saves with its own id");

  // offline then sync
  f = fakeApi(); st = memStore();
  const kept: string[] = [];
  r = await saveCard({ api: f.api, store: st, userId: "u", card: null, input, front: img("f"), online: false, keep: async (p) => { kept.push(p); } });
  eq([f.calls.uploads.length, f.calls.upserts.length, r.queued, st.items.length, r.card.image_path === kept[0]], [0, 0, true, 1, true], "offline: nothing is sent, the card waits on the phone and its photo is kept locally");
  const waitingItem = st.items[0] as LoyaltySaveItem;
  const sent = await pushLoyaltySave(f.api, waitingItem);
  eq([sent.kind, f.calls.uploads.length, f.calls.upserts[0].id === r.card.id], ["synced", 1, true], "later: the waiting card uploads and saves under the same id");

  // network drops after the upload
  f = fakeApi({ upsertErrors: [{ message: "TypeError: Failed to fetch" }] }); st = memStore();
  r = await saveCard({ api: f.api, store: st, userId: "u", card: null, input, front: img("f"), online: true });
  const w = st.items[0] as LoyaltySaveItem;
  eq([r.queued, w.frontUploaded], [true, true], "dropped connection after the upload: kept, and the upload is remembered");
  await pushLoyaltySave(f.api, w);
  eq(f.calls.uploads.length, 1, "…so the retry does not upload the photo again");

  // edit semantics
  const base = { ...card("A", null), id: "c1", image_path: "u/old-f.webp", back_image_path: "u/old-b.webp" };
  f = fakeApi(); st = memStore();
  await saveCard({ api: f.api, store: st, userId: "u", card: base, input, online: true });
  eq(["image_path" in f.calls.upserts[0], "back_image_path" in f.calls.upserts[0], f.calls.removed], [false, false, []], "edit with no photo change leaves both photos alone");
  await saveCard({ api: f.api, store: st, userId: "u", card: base, input, back: null, online: true });
  eq([f.calls.upserts[1].back_image_path, f.calls.removed], [null, ["u/old-b.webp"]], "removing the back photo clears it and deletes its file");
  await saveCard({ api: f.api, store: st, userId: "u", card: base, input, front: img("n"), online: true });
  eq([f.calls.upserts[2].image_path !== "u/old-f.webp", f.calls.removed.includes("u/old-f.webp")], [true, true], "a new front replaces the old file");

  // database without the back column
  f = fakeApi({ upsertErrors: [missingCol] }); st = memStore();
  r = await saveCard({ api: f.api, store: st, userId: "u", card: null, input, front: img("f"), back: null, online: true });
  eq([r.queued, f.calls.upserts.length, "back_image_path" in f.calls.upserts[1]], [false, 2, false], "no back column: a card with no back photo still saves");
  f = fakeApi({ upsertErrors: [missingCol] }); st = memStore();
  let msg = "";
  await saveCard({ api: f.api, store: st, userId: "u", card: null, input, front: img("f"), back: img("b"), online: true }).catch((e: Error) => { msg = e.message; });
  eq(msg === BACK_MIGRATION_MESSAGE, true, "no back column: a back photo gives the clear message");

  // permission problem is shown, not queued
  f = fakeApi({ upsertErrors: [{ code: "42501", message: "new row violates row-level security policy" }] }); st = memStore();
  msg = "";
  await saveCard({ api: f.api, store: st, userId: "u", card: null, input, online: true }).catch((e: Error) => { msg = e.message; });
  eq([msg, st.items.length], ["You no longer have permission to change this card.", 0], "a permission problem is shown and not kept");

  // two offline edits of one card are one waiting item
  f = fakeApi(); st = memStore();
  r = await saveCard({ api: f.api, store: st, userId: "u", card: null, input, front: img("one"), online: false });
  const first = st.items[0] as LoyaltySaveItem;
  const r2 = await saveCard({ api: f.api, store: st, userId: "u", card: r.card, waiting: first, input: { ...input, store_name: "B" }, front: img("two"), online: false });
  const merged = st.items[0] as LoyaltySaveItem;
  eq([st.items.length, merged.isNew, merged.row.store_name, merged.frontPath === r2.card.image_path, merged.frontPath !== first.frontPath], [1, true, "B", true, true], "two offline edits of one card are one waiting item, still new, with the latest photo");
  const r3 = await saveCard({ api: f.api, store: st, userId: "u", card: r2.card, waiting: merged, input, online: false });
  eq([(st.items[0] as LoyaltySaveItem).frontPath === r3.card.image_path, st.items.length], [true, 1], "a later edit without a photo keeps the waiting photo");

  // what the screen shows
  const shown = applyLoyaltyOutbox([{ ...card("Old", null), id: "x" }, { ...card("Gone", null), id: "y" }], [
    ...st.items,
    { id: "y", userId: "u", kind: "loyalty.delete", createdAt: 9, status: "pending", error: null, attempts: 0 },
  ]);
  eq(shown.map((c) => c.store_name).sort(), ["A", "Old"], "waiting saves show and waiting deletes hide on the card list");
  eq([isLoyaltySave(st.items[0]), isLoyaltyDelete(st.items[0])], [true, false], "kind guards tell saves from deletes");

  // delete
  f = fakeApi(); st = memStore();
  await deleteCard({ api: f.api, store: st, userId: "u", card: base, online: true });
  eq([f.calls.deletes, f.calls.removed], [["c1"], ["u/old-f.webp", "u/old-b.webp"]], "online delete removes the row and both photos");
  f = fakeApi(); st = memStore();
  const d = await deleteCard({ api: f.api, store: st, userId: "u", card: base, online: false });
  eq([d.queued, f.calls.deletes.length, st.items[0].kind], [true, 0, "loyalty.delete"], "offline delete waits on the phone");
  f = fakeApi(); st = memStore();
  const made = await saveCard({ api: f.api, store: st, userId: "u", card: null, input, front: img("f"), online: false });
  const drop = await deleteCard({ api: f.api, store: st, userId: "u", card: made.card, waiting: st.items[0], online: false });
  eq([drop.queued, st.items.length, f.calls.removed.length], [false, 0, 1], "deleting a card that never reached the server just drops it and its photo");
  f = fakeApi({ deleteError: { message: "Failed to fetch" } }); st = memStore();
  const net = await deleteCard({ api: f.api, store: st, userId: "u", card: base, online: true });
  eq([net.queued, st.items.length], [true, 1], "delete interrupted by the connection is kept");
})();
