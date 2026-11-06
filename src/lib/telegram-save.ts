/**
 * Saves a photo or PDF sent to the bot into the right place: business trip expense, personal expense,
 * grocery receipt or travel document. Runs with the service role, so every query is scoped to the person's own id.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { downloadFile, getFile } from "@/lib/telegram";
import { runReceiptOcr, type OcrResult } from "@/lib/ocr";
import { AI_IMAGE_TYPES, aiOcrConfigured, extractDocumentWithAi, extractGroceryWithAi, extractReceiptWithAi } from "@/lib/ocr-ai";
import { CURRENCIES, rateToUsd, toUsd } from "@/lib/currencies";
import { KIND_META, GROCERY_CATEGORIES, type PersonalKind } from "@/lib/personal/constants";
import { normalizeItemName } from "@/lib/personal/grocery";
import { kindLabel, type DocKind } from "@/lib/documents";
import type { DocumentFields } from "@/lib/mrz";
import { DOC_BUCKET } from "@/lib/document-upload";
import { isMissingColumn } from "@/lib/columns";
import { formatSavedRef, type SavedRef } from "@/lib/telegram-upload";
import { escapeHtml } from "@/lib/telegram-notify";
import { todayISO } from "@/lib/utils";

export type TgFile = { file_id: string; file_name?: string | null; mime?: string | null };
export type Saved = { ref: SavedRef; path: string; /** Bucket the file went to */ bucket: string; where: string; lines: string[] };

const MAX_BYTES = 10 * 1024 * 1024;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}

async function fetchTgFile(file: TgFile) {
  const info = await getFile(file.file_id);
  const buf = await downloadFile(info.file_path);
  if (buf.byteLength > MAX_BYTES) throw new Error("That file is over 10 MB.");
  const name = file.file_name || "receipt.jpg";
  const ext = (name.split(".").pop() || info.file_path.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
  return { buf, mime: file.mime || "image/jpeg", name, ext };
}

/** Reads a receipt with the AI reader, falling back to basic OCR. Never throws: a failure is reported in `note`. */
async function readReceipt(buf: ArrayBuffer, mime: string, name: string, hints: { currency: string; categories: string[] }) {
  let ocr: OcrResult | null = null;
  let usedAi = false;
  let note = "";
  try {
    if (aiOcrConfigured() && AI_IMAGE_TYPES.includes(mime)) {
      try {
        ocr = await withTimeout(extractReceiptWithAi({ data: new Uint8Array(buf), mime }, hints), 25000);
        usedAi = true;
      } catch (e) {
        console.error("telegram AI OCR failed, falling back", e instanceof Error ? e.message : e);
      }
    }
    if (!ocr) ocr = await withTimeout(runReceiptOcr(new File([new Uint8Array(buf)], name, { type: mime }), hints), 25000);
  } catch (e) {
    note = e instanceof Error && e.message === "timeout" ? "OCR timed out" : "OCR failed";
  }
  return { ocr, usedAi, note };
}

async function supportedCurrency(supabase: SupabaseClient, wanted: string | null, fallback: string, usedAi: boolean) {
  if (!usedAi || !wanted || wanted === fallback) return fallback;
  const { data } = await supabase.from("currencies").select("code").eq("enabled", true);
  const supported = data && data.length > 0 ? data.map((c: { code: string }) => c.code) : CURRENCIES.map((c) => c.code);
  return supported.includes(wanted) ? wanted : fallback;
}

/** Added to the confirmation when nothing useful was read, so the person knows what to do next. */
const unreadHint = (ocr: OcrResult | null) => (!ocr || (ocr.amount == null && !ocr.merchant) ? "Could not read this receipt. Open it in the app and tap “Read receipt again”." : "");

const money = (n: number | null, cur: string) => (n != null ? `Amount: ${n.toFixed(2)} ${cur}` : "Amount: not detected (saved as 0)");

/* ---------------- business trip ---------------- */

export async function saveBusiness(supabase: SupabaseClient, userId: string, tripId: string, file: TgFile): Promise<Saved> {
  const { data: trip } = await supabase.from("trips").select("name, currency").eq("id", tripId).eq("user_id", userId).single();
  if (!trip) throw new Error("trip not found");
  const currency = trip.currency || "USD";
  const { buf, mime, name, ext } = await fetchTgFile(file);
  const path = `${userId}/${tripId}/${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage.from("receipts").upload(path, buf, { contentType: mime, upsert: false });
  if (upErr) throw upErr;

  const { data: catRows } = await supabase.from("categories").select("name").eq("enabled", true);
  const { ocr, usedAi, note } = await readReceipt(buf, mime, name, { currency, categories: (catRows || []).map((c: { name: string }) => c.name) });

  const finalCurrency = await supportedCurrency(supabase, ocr?.currency ?? null, currency, usedAi);
  let rate = finalCurrency === "USD" ? 1 : 0;
  try { rate = await rateToUsd(finalCurrency); } catch {}
  const amount = ocr?.amount ?? null;
  const usd = toUsd(amount ?? 0, rate);
  const date = ocr?.date || todayISO();

  const { data: row, error } = await supabase.from("expenses").insert({
    trip_id: tripId, user_id: userId, merchant: ocr?.merchant ?? null, amount: amount ?? 0, currency: finalCurrency, exchange_rate: rate, amount_usd: usd,
    category: ocr?.category || "Other", expense_date: date,
    notes: ["Imported from Telegram", amount == null ? "amount not detected" : "", note].filter(Boolean).join(" — "),
    receipt_path: path, ocr_raw: ocr?.rawText ? { text: ocr.rawText.slice(0, 4000), source: usedAi ? "ai" : "tesseract" } : null,
  }).select("id").single();
  if (error) { await supabase.storage.from("receipts").remove([path]).catch(() => {}); throw error; }

  return {
    ref: { table: "expenses", id: row.id as string }, path, bucket: "receipts", where: `${trip.name} · Business`,
    lines: [
      ocr?.merchant ? `Merchant: ${escapeHtml(ocr.merchant)}` : "Merchant: not detected",
      money(amount, finalCurrency),
      finalCurrency !== "USD" ? `USD: ${usd.toFixed(2)}` : "",
      ocr?.category ? `Category: ${escapeHtml(ocr.category)}` : "",
      `Date: ${date}`,
      note ? `Note: ${note}` : "",
      unreadHint(ocr),
    ].filter(Boolean),
  };
}

/* ---------------- home project / personal travel ---------------- */

export async function savePersonalExpense(supabase: SupabaseClient, userId: string, projectId: string, file: TgFile): Promise<Saved> {
  const { data: project } = await supabase.from("personal_projects").select("name, kind, currency").eq("id", projectId).eq("user_id", userId).single();
  if (!project) throw new Error("project not found");
  const currency = project.currency || "USD";
  const meta = KIND_META[project.kind as PersonalKind] ?? KIND_META.home_project;
  const { buf, mime, name, ext } = await fetchTgFile(file);
  const path = `${userId}/personal/${projectId}/${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage.from("receipts").upload(path, buf, { contentType: mime, upsert: false });
  if (upErr) throw upErr;

  const { ocr, usedAi, note } = await readReceipt(buf, mime, name, { currency, categories: meta.categories });
  const finalCurrency = await supportedCurrency(supabase, ocr?.currency ?? null, currency, usedAi);
  let rate = finalCurrency === "USD" ? 1 : 0;
  try { rate = await rateToUsd(finalCurrency); } catch {}
  const amount = ocr?.amount ?? null;
  const usd = toUsd(amount ?? 0, rate);
  const date = ocr?.date || todayISO();
  const category = ocr?.category ? meta.categories.find((c) => c.toLowerCase() === ocr.category!.toLowerCase()) : null;

  const { data: row, error } = await supabase.from("personal_expenses").insert({
    user_id: userId, project_id: projectId, merchant: ocr?.merchant ?? null, amount: amount ?? 0, currency: finalCurrency, exchange_rate: rate, amount_usd: usd,
    category: category || "Other", expense_date: date, notes: ["Imported from Telegram", amount == null ? "amount not detected" : "", note].filter(Boolean).join(" — "), receipt_path: path,
  }).select("id").single();
  if (error) { await supabase.storage.from("receipts").remove([path]).catch(() => {}); throw error; }

  return {
    ref: { table: "personal_expenses", id: row.id as string }, path, bucket: "receipts", where: `${project.name} · ${meta.label}`,
    lines: [ocr?.merchant ? `Merchant: ${escapeHtml(ocr.merchant)}` : "Merchant: not detected", money(amount, finalCurrency), `Category: ${category || "Other"}`, `Date: ${date}`, note ? `Note: ${note}` : "", unreadHint(ocr)].filter(Boolean),
  };
}

/* ---------------- groceries ---------------- */

export async function saveGrocery(supabase: SupabaseClient, userId: string, file: TgFile): Promise<Saved> {
  const { buf, mime, ext } = await fetchTgFile(file);
  const path = `${userId}/personal/groceries/${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage.from("receipts").upload(path, buf, { contentType: mime, upsert: false });
  if (upErr) throw upErr;

  // Currency of the latest receipt, else the Aruban florin groceries are paid in
  const { data: last } = await supabase.from("grocery_receipts").select("currency").eq("user_id", userId).order("purchase_date", { ascending: false }).limit(1);
  const currency = (last?.[0]?.currency as string | undefined) || "AWG";
  const { data: cats } = await supabase.from("grocery_categories").select("name").eq("enabled", true).order("sort_order");
  const categories = cats && cats.length ? cats.map((c: { name: string }) => c.name) : [...GROCERY_CATEGORIES];

  let scan: Awaited<ReturnType<typeof extractGroceryWithAi>> | null = null;
  let note = "";
  if (aiOcrConfigured() && AI_IMAGE_TYPES.includes(mime)) {
    try {
      scan = await withTimeout(extractGroceryWithAi({ data: new Uint8Array(buf), mime }, { currency, categories }), 40000);
    } catch (e) {
      note = e instanceof Error && e.message === "timeout" ? "Reading timed out" : "Could not read the items";
      console.error("telegram grocery read", e instanceof Error ? e.message : e);
    }
  } else note = "Item reading needs a photo and the AI reader";

  const itemsTotal = scan ? scan.items.reduce((s, i) => s + i.line_total, 0) : 0;
  const total = scan?.total ?? (itemsTotal > 0 ? Math.round(itemsTotal * 100) / 100 : 0);
  const cur = (scan?.currency || currency).toUpperCase();
  const date = scan?.date || todayISO();
  const store = (scan?.store || "Grocery receipt").slice(0, 120);

  const { data: rec, error } = await supabase.from("grocery_receipts").insert({
    user_id: userId, store, purchase_date: date, total, currency: cur, receipt_path: path,
    notes: ["Imported from Telegram", total === 0 ? "total not detected" : "", note].filter(Boolean).join(" — "),
    ocr_raw: scan ? { source: scan.source, items: scan.items.length } : null,
  }).select("id").single();
  if (error) { await supabase.storage.from("receipts").remove([path]).catch(() => {}); throw error; }

  if (scan && scan.items.length) {
    const { error: itemErr } = await supabase.from("grocery_items").insert(
      scan.items.map((i) => ({
        receipt_id: rec.id, user_id: userId, name: i.name, normalized_name: normalizeItemName(i.name), category: i.category,
        quantity: i.quantity, unit_price: i.unit_price, line_total: i.line_total, ...(i.unit ? { unit: i.unit } : {}),
      }))
    );
    if (itemErr) {
      // Keep the receipt (the total is still useful) but say the lines were not stored
      console.error("telegram grocery items", itemErr.message);
      note = "Items could not be stored";
    }
  }

  return {
    ref: { table: "grocery_receipts", id: rec.id as string }, path, bucket: "receipts", where: "Groceries · Personal",
    lines: [`Store: ${escapeHtml(store)}`, total > 0 ? `Total: ${total.toFixed(2)} ${cur}` : "Total: not detected (saved as 0)", scan?.items.length ? `${scan.items.length} items` : "", `Date: ${date}`, note ? `Note: ${note}` : ""].filter(Boolean),
  };
}

/* ---------------- documents ---------------- */

const IDENTITY_KINDS: DocKind[] = ["passport", "id", "license", "visa"];

/**
 * Looks at a photo and says whether it is a passport, ID card, driver's license or visa. Returns the fields it read (so saving does not
 * read the photo again), or null for a receipt, anything unclear, or when the reader is not available. Never throws.
 */
export async function detectIdentityDocument(file: TgFile): Promise<DocumentFields | null> {
  if (!aiOcrConfigured()) return null;
  try {
    const { buf, mime } = await fetchTgFile(file);
    if (!AI_IMAGE_TYPES.includes(mime)) return null;
    const fields = await withTimeout(extractDocumentWithAi({ data: new Uint8Array(buf), mime }), 12000);
    return fields.kind && IDENTITY_KINDS.includes(fields.kind) ? fields : null;
  } catch {
    return null;
  }
}

export async function saveDocument(supabase: SupabaseClient, userId: string, file: TgFile, known?: DocumentFields | null): Promise<Saved> {
  const { buf, mime, name, ext } = await fetchTgFile(file);
  const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
  if (!allowed.includes(mime)) throw new Error("Use a PDF or a photo (JPG, PNG, WebP or HEIC).");
  const safe = name.replace(/[^\w.\-]+/g, "_").slice(-80) || `file.${ext}`;
  const path = `${userId}/general/${crypto.randomUUID()}-${safe}`;
  const { error: upErr } = await supabase.storage.from(DOC_BUCKET).upload(path, buf, { contentType: mime, upsert: false });
  if (upErr) throw new Error(/bucket/i.test(upErr.message) ? "Documents storage is not set up yet." : upErr.message);

  let fields: { kind: DocKind | null; document_number: string | null; issuing_country: string | null; expiry_date: string | null } = { kind: null, document_number: null, issuing_country: null, expiry_date: null };
  let note = "";
  if (known) fields = known;
  else if (aiOcrConfigured() && AI_IMAGE_TYPES.includes(mime)) {
    try { fields = await withTimeout(extractDocumentWithAi({ data: new Uint8Array(buf), mime }), 25000); } catch { note = "Could not read the details"; }
  }
  const kind: DocKind = fields.kind ?? "other";
  const title = `${kindLabel(kind)}${fields.issuing_country ? ` · ${fields.issuing_country}` : ""}`.slice(0, 120);
  const base = { user_id: userId, trip_id: null, kind, title, issuing_country: fields.issuing_country, expiry_date: fields.expiry_date, notes: "Imported from Telegram", file_path: path };

  let res = await supabase.from("travel_documents").insert({ ...base, ...(fields.document_number ? { document_number: fields.document_number.slice(0, 40) } : {}) }).select("id").single();
  // document_number only exists after migration_documents_number.sql
  if (res.error && fields.document_number && isMissingColumn(res.error)) res = await supabase.from("travel_documents").insert(base).select("id").single();
  if (res.error || !res.data) { await supabase.storage.from(DOC_BUCKET).remove([path]).catch(() => {}); throw res.error ?? new Error("insert failed"); }

  return {
    ref: { table: "travel_documents", id: res.data.id as string }, path, bucket: DOC_BUCKET, where: "Documents",
    lines: [`Type: ${kindLabel(kind)}`, fields.issuing_country ? `Country: ${escapeHtml(fields.issuing_country)}` : "", fields.expiry_date ? `Expires: ${fields.expiry_date}` : "", note ? `Note: ${note}` : "", "Check the details in the web app."].filter(Boolean),
  };
}

/** Undo for "Change": removes what was saved (and its file) so the photo can go somewhere else. Only the person's own rows. */
export async function removeSaved(supabase: SupabaseClient, userId: string, ref: SavedRef, path: string | null, bucket = "receipts"): Promise<boolean> {
  const { error } = await supabase.from(ref.table).delete().eq("id", ref.id).eq("user_id", userId);
  if (error) { console.error("[telegram] undo", error.message); return false; }
  if (path) await supabase.storage.from(bucket).remove([path]).catch(() => {});
  return true;
}

export { formatSavedRef };
