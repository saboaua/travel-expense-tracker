// Run with: npx tsx tests/loyalty.test.ts
import { cleanNumber, detectFormat, displayNumber, filterCards, formatProblem, gtinCheckDigit, colorForName, CARD_COLORS, type LoyaltyCard } from "../src/lib/loyalty";
import { targetSize, saveLoyaltyCard, updateLoyaltyCard, removeLoyaltyCard, BACK_MIGRATION_MESSAGE } from "../src/lib/loyalty-image";
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

/* ---- front and back photos ---- */
function fakeDb(opts: { missingBack?: boolean } = {}) {
  const removed: string[] = [];
  const uploaded: string[] = [];
  const missing = { code: "42703", message: "column loyalty_cards.back_image_path does not exist" };
  const chain = (row: Record<string, unknown>) => ({
    eq: () => chain(row),
    select: (cols: string) => ({
      single: async () => (opts.missingBack && ("back_image_path" in row || /back_image_path/.test(cols)) ? { data: null, error: missing } : { data: { id: "c1", ...row }, error: null }),
    }),
  });
  const supabase = {
    from: () => ({ insert: (row: Record<string, unknown>) => chain(row), update: (row: Record<string, unknown>) => chain(row) }),
    storage: { from: () => ({ upload: async (path: string) => { uploaded.push(path); return { error: null }; }, remove: async (paths: string[]) => { removed.push(...paths); return { error: null }; } }) },
  } as unknown as Parameters<typeof saveLoyaltyCard>[0];
  return { supabase, removed, uploaded };
}
const input = { store_name: "A", card_number: "1", barcode_format: "CODE128" as const };
const img = (n: string) => new File([new Uint8Array([1])], n, { type: "image/webp" });

(async () => {
  const d = fakeDb();
  const c = await saveLoyaltyCard(d.supabase, "u", input, img("f"), img("b"));
  eq([d.uploaded.length, !!c.image_path, !!c.back_image_path], [2, true, true], "a new card stores both photos");

  const base = { ...card("A", null), image_path: "u/f.webp", back_image_path: "u/b.webp" };
  const d1 = fakeDb();
  const keep = await updateLoyaltyCard(d1.supabase, "u", base, input);
  eq([keep.image_path, d1.removed], ["u/f.webp", []], "update keeps both photos when nothing was touched");
  await updateLoyaltyCard(d1.supabase, "u", base, input, undefined, null);
  eq(d1.removed, ["u/b.webp"], "removing the back deletes only its file");
  const d2 = fakeDb();
  const swapped = await updateLoyaltyCard(d2.supabase, "u", base, input, img("n"), undefined);
  eq([swapped.image_path !== "u/f.webp", d2.removed], [true, ["u/f.webp"]], "a new front replaces and deletes the old file");

  const d3 = fakeDb({ missingBack: true });
  const noBack = await saveLoyaltyCard(d3.supabase, "u", input, img("f"));
  eq(!!noBack.image_path, true, "without the back column a card with only a front still saves");
  const d4 = fakeDb({ missingBack: true });
  let msg = "";
  await saveLoyaltyCard(d4.supabase, "u", input, img("f"), img("b")).catch((e: Error) => { msg = e.message; });
  eq([msg === BACK_MIGRATION_MESSAGE, d4.removed.length], [true, 2], "without the back column a back photo gives a clear message and uploads are cleaned up");

  const removed: string[] = [];
  const supabase = { from: () => ({ delete: () => ({ eq: async () => ({ error: null }) }) }), storage: { from: () => ({ remove: async (p: string[]) => { removed.push(...p); return { error: null }; } }) } } as unknown as Parameters<typeof removeLoyaltyCard>[0];
  await removeLoyaltyCard(supabase, { ...card("A", null), image_path: "u/f", back_image_path: "u/b" });
  eq(removed, ["u/f", "u/b"], "deleting a card removes both photos");
})();
