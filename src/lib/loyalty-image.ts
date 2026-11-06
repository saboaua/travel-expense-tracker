import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingColumn, LOYALTY_CARD_COLS, LOYALTY_CARD_COLS_BASE } from "@/lib/columns";
import type { BarcodeFormat, LoyaltyCard } from "@/lib/loyalty";

export const LOYALTY_BUCKET = "loyalty-cards";
export const LOYALTY_ACCEPT = "image/jpeg,image/png,image/webp";
export const LOYALTY_MAX_SIDE = 800;
export const LOYALTY_QUALITY = 0.7;
const ALLOWED = new Set(LOYALTY_ACCEPT.split(","));

/** Biggest side after resizing: never enlarge, never above the limit. Pure, so it is tested. */
export function targetSize(width: number, height: number, maxSide = LOYALTY_MAX_SIDE): { width: number; height: number } {
  const longer = Math.max(width, height);
  if (longer <= maxSide) return { width, height };
  const scale = maxSide / longer;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export type CompressedCard = { file: File; before: number; after: number };

/**
 * Card photos are always shrunk in the browser before they leave the phone: 800 px at most, WebP at quality 0.7
 * (JPEG where the browser cannot write WebP). The original is never uploaded.
 */
export async function compressCardImage(file: File): Promise<CompressedCard> {
  if (!ALLOWED.has(file.type)) throw new Error("Choose a JPG, PNG or WebP photo.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("This photo could not be opened. Try another one.");
  }
  const { width, height } = targetSize(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("This photo could not be processed.");
  }
  ctx.fillStyle = "#ffffff"; // JPEG has no transparency
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const toBlob = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, LOYALTY_QUALITY));
  let blob = await toBlob("image/webp");
  if (!blob || blob.type !== "image/webp") blob = await toBlob("image/jpeg");
  if (!blob) throw new Error("This photo could not be processed.");
  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  const base = file.name.replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "_").slice(0, 40) || "card";
  return { file: new File([blob], `${base}.${ext}`, { type: blob.type, lastModified: Date.now() }), before: file.size, after: blob.size };
}

export type CardInput = {
  store_name: string;
  holder_name?: string | null;
  category?: string | null;
  card_number: string;
  barcode_format: BarcodeFormat;
  color?: string | null;
};

const clean = (v?: string | null) => (v && v.trim() ? v.trim() : null);

async function uploadImage(supabase: SupabaseClient, userId: string, file: File): Promise<string> {
  const path = `${userId}/${crypto.randomUUID()}.${file.type === "image/webp" ? "webp" : "jpg"}`;
  const { error } = await supabase.storage.from(LOYALTY_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

export const BACK_MIGRATION_MESSAGE = "The back photo could not be saved because the database is missing the back_image_path column. Run supabase/migration_loyalty_back.sql in the Supabase SQL Editor. The rest of the card was not changed.";

const removeFiles = async (supabase: SupabaseClient, paths: (string | null | undefined)[]) => {
  const list = paths.filter((p): p is string => !!p);
  if (list.length) await supabase.storage.from(LOYALTY_BUCKET).remove(list);
};

/** A photo slot: a new file to store, `null` to remove it, `undefined` to keep what is there. */
export type Photo = File | null | undefined;

const next = async (supabase: SupabaseClient, userId: string, current: string | null | undefined, photo: Photo): Promise<{ path: string | null; uploaded: string | null }> => {
  if (photo) { const path = await uploadImage(supabase, userId, photo); return { path, uploaded: path }; }
  if (photo === null) return { path: null, uploaded: null };
  return { path: current ?? null, uploaded: null };
};

/** Photos are already compressed (see compressCardImage). */
export async function saveLoyaltyCard(supabase: SupabaseClient, userId: string, input: CardInput, front?: Photo, back?: Photo): Promise<LoyaltyCard> {
  const f = await next(supabase, userId, null, front);
  let b: Awaited<ReturnType<typeof next>>;
  try { b = await next(supabase, userId, null, back); } catch (e) { await removeFiles(supabase, [f.uploaded]); throw e; }
  const row: Record<string, unknown> = { ...rowOf(input), user_id: userId, image_path: f.path };
  let res = await supabase.from("loyalty_cards").insert(b.path ? { ...row, back_image_path: b.path } : row).select(LOYALTY_CARD_COLS).single();
  if (isMissingColumn(res.error)) {
    if (b.path) { await removeFiles(supabase, [f.uploaded, b.uploaded]); throw new Error(BACK_MIGRATION_MESSAGE); }
    res = await supabase.from("loyalty_cards").insert(row).select(LOYALTY_CARD_COLS_BASE).single();
  }
  if (res.error) {
    await removeFiles(supabase, [f.uploaded, b.uploaded]);
    throw new Error(res.error.message);
  }
  return res.data as unknown as LoyaltyCard;
}

/** Each photo: a new file to store, `null` to remove it, `undefined` to keep it. */
export async function updateLoyaltyCard(supabase: SupabaseClient, userId: string, card: LoyaltyCard, input: CardInput, front?: Photo, back?: Photo): Promise<LoyaltyCard> {
  const f = await next(supabase, userId, card.image_path, front);
  let b: Awaited<ReturnType<typeof next>>;
  try { b = await next(supabase, userId, card.back_image_path, back); } catch (e) { await removeFiles(supabase, [f.uploaded]); throw e; }
  const touchesBack = back !== undefined;
  const row: Record<string, unknown> = { ...rowOf(input), image_path: f.path };
  let res = await supabase.from("loyalty_cards").update(touchesBack ? { ...row, back_image_path: b.path } : row).eq("id", card.id).select(LOYALTY_CARD_COLS).single();
  if (isMissingColumn(res.error)) {
    if (touchesBack && b.path) { await removeFiles(supabase, [f.uploaded, b.uploaded]); throw new Error(BACK_MIGRATION_MESSAGE); }
    res = await supabase.from("loyalty_cards").update(row).eq("id", card.id).select(LOYALTY_CARD_COLS_BASE).single();
  }
  if (res.error) {
    await removeFiles(supabase, [f.uploaded, b.uploaded]);
    throw new Error(res.error.message);
  }
  await removeFiles(supabase, [card.image_path !== f.path ? card.image_path : null, card.back_image_path !== b.path ? card.back_image_path : null]);
  return res.data as unknown as LoyaltyCard;
}

export async function removeLoyaltyCard(supabase: SupabaseClient, card: LoyaltyCard): Promise<void> {
  const { error } = await supabase.from("loyalty_cards").delete().eq("id", card.id);
  if (error) throw new Error(error.message);
  await removeFiles(supabase, [card.image_path, card.back_image_path]);
}

function rowOf(input: CardInput) {
  return {
    store_name: input.store_name.trim(),
    holder_name: clean(input.holder_name),
    category: clean(input.category),
    card_number: input.card_number,
    barcode_format: input.barcode_format,
    color: clean(input.color),
  };
}
