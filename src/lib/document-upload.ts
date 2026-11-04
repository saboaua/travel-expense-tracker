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
      issuing_country: input.issuing_country?.trim() || null,
      expiry_date: input.expiry_date || null,
      notes: input.notes?.trim() || null,
      file_path: path,
    })
    .select("*")
    .single();
  if (error) {
    if (path) await supabase.storage.from(DOC_BUCKET).remove([path]).catch(() => {});
    throw new Error(/relation|schema cache/i.test(error.message) ? "Documents table not found. Run supabase/migration_documents.sql." : error.message);
  }
  return data as TravelDocument;
}

export async function removeTravelDocument(supabase: SupabaseClient, doc: Pick<TravelDocument, "id" | "file_path">) {
  const { error } = await supabase.from("travel_documents").delete().eq("id", doc.id);
  if (error) throw new Error(error.message);
  if (doc.file_path) await supabase.storage.from(DOC_BUCKET).remove([doc.file_path]).catch(() => {});
}
