import type { SupabaseClient } from "@supabase/supabase-js";
import { compressReceiptImage } from "@/lib/compress-image";
import type { DocKind, TravelDocument } from "@/lib/documents";

export const DOC_BUCKET = "documents";
export const MAX_DOC_BYTES = 10 * 1024 * 1024;
export const DOC_ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif";
const ALLOWED = new Set(DOC_ACCEPT.split(","));

const safeName = (n: string) => n.replace(/[^\w.\-]+/g, "_").slice(-80) || "file";

export type NewDocument = {
  tripId?: string | null;
  kind: DocKind;
  title: string;
  document_number?: string | null;
  issuing_country?: string | null;
  expiry_date?: string | null;
  notes?: string | null;
  file?: File | null;
};

/** Uploads the file (images are compressed, PDFs are kept as is) and records the document row. */
export async function saveTravelDocument(supabase: SupabaseClient, userId: string, input: NewDocument): Promise<TravelDocument> {
  let path: string | null = null;
  if (input.file) {
    let file = input.file;
    if (!ALLOWED.has(file.type)) throw new Error("Use a PDF or a photo (JPG, PNG, WebP or HEIC).");
    if (file.type.startsWith("image/") && file.type !== "image/heic" && file.type !== "image/heif") {
      // Larger and sharper than receipts: passport pages must stay readable
      file = await compressReceiptImage(file, { maxSide: 2200, quality: 0.85 }).catch(() => file);
    }
    if (file.size > MAX_DOC_BYTES) throw new Error("That file is over 10 MB. Use a smaller photo or PDF.");
    path = `${userId}/${input.tripId || "general"}/${crypto.randomUUID()}-${safeName(file.name)}`;
    const { error } = await supabase.storage.from(DOC_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw new Error(/bucket/i.test(error.message) ? "Documents storage is not set up yet. Run supabase/migration_documents.sql." : error.message);
  }

  const { data, error } = await supabase
    .from("travel_documents")
    .insert({
      user_id: userId,
      trip_id: input.tripId || null,
      kind: input.kind,
      title: input.title.trim().slice(0, 120),
      ...(input.document_number?.trim() ? { document_number: input.document_number.trim().slice(0, 40) } : {}),
      issuing_country: input.issuing_country?.trim() || null,
      expiry_date: input.expiry_date || null,
      notes: input.notes?.trim() || null,
      file_path: path,
    })
    .select("*")
    .single();
  if (error) {
    if (path) await supabase.storage.from(DOC_BUCKET).remove([path]).catch(() => {});
    throw new Error(dbMessage(error.message));
  }
  return data as TravelDocument;
}

const dbMessage = (m: string) =>
  /document_number/i.test(m)
    ? "The document number column is missing. Run supabase/migration_documents_number.sql in Supabase."
    : /relation|schema cache/i.test(m)
      ? "Documents table not found. Run supabase/migration_documents.sql."
      : m;

async function uploadDocFile(supabase: SupabaseClient, userId: string, tripId: string | null | undefined, original: File): Promise<string> {
  let file = original;
  if (!ALLOWED.has(file.type)) throw new Error("Use a PDF or a photo (JPG, PNG, WebP or HEIC).");
  if (file.type.startsWith("image/") && file.type !== "image/heic" && file.type !== "image/heif") {
    file = await compressReceiptImage(file, { maxSide: 2200, quality: 0.85 }).catch(() => file);
  }
  if (file.size > MAX_DOC_BYTES) throw new Error("That file is over 10 MB. Use a smaller photo or PDF.");
  const path = `${userId}/${tripId || "general"}/${crypto.randomUUID()}-${safeName(file.name)}`;
  const { error } = await supabase.storage.from(DOC_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(/bucket/i.test(error.message) ? "Documents storage is not set up yet. Run supabase/migration_documents.sql." : error.message);
  return path;
}

/** Edits a document. A new file replaces the old one (the old file is removed only after the update succeeds). */
export async function updateTravelDocument(supabase: SupabaseClient, userId: string, doc: TravelDocument, input: Omit<NewDocument, "tripId">): Promise<void> {
  const newPath = input.file ? await uploadDocFile(supabase, userId, doc.trip_id, input.file) : null;
  const number = input.document_number?.trim() || null;
  const patch: Record<string, unknown> = {
    kind: input.kind,
    title: input.title.trim().slice(0, 120),
    issuing_country: input.issuing_country?.trim() || null,
    expiry_date: input.expiry_date || null,
    notes: input.notes?.trim() || null,
    ...(newPath ? { file_path: newPath } : {}),
    // Only send the number when the column exists (or the user typed one), so older databases keep working
    ...(number || doc.document_number !== undefined ? { document_number: number ? number.slice(0, 40) : null } : {}),
  };
  const { error } = await supabase.from("travel_documents").update(patch).eq("id", doc.id).eq("user_id", userId);
  if (error) {
    if (newPath) await supabase.storage.from(DOC_BUCKET).remove([newPath]).catch(() => {});
    throw new Error(dbMessage(error.message));
  }
  if (newPath && doc.file_path) await supabase.storage.from(DOC_BUCKET).remove([doc.file_path]).catch(() => {});
}

export async function removeTravelDocument(supabase: SupabaseClient, doc: Pick<TravelDocument, "id" | "file_path">) {
  const { error } = await supabase.from("travel_documents").delete().eq("id", doc.id);
  if (error) throw new Error(error.message);
  if (doc.file_path) await supabase.storage.from(DOC_BUCKET).remove([doc.file_path]).catch(() => {});
}
