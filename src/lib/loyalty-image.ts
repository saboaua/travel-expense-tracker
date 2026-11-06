import type { SupabaseClient } from "@supabase/supabase-js";
import { LOYALTY_CARD_COLS } from "@/lib/columns";
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

/** `image` is an already compressed photo (see compressCardImage). */
export async function saveLoyaltyCard(supabase: SupabaseClient, userId: string, input: CardInput, image?: File | null): Promise<LoyaltyCard> {
  const image_path = image ? await uploadImage(supabase, userId, image) : null;
  const { data, error } = await supabase
    .from("loyalty_cards")
    .insert({ ...rowOf(input), user_id: userId, image_path })
    .select(LOYALTY_CARD_COLS)
    .single();
  if (error) {
    if (image_path) await supabase.storage.from(LOYALTY_BUCKET).remove([image_path]);
    throw new Error(error.message);
  }
  return data as unknown as LoyaltyCard;
}

/** `image`: a new photo to store, `null` to remove the photo, `undefined` to keep it. */
export async function updateLoyaltyCard(supabase: SupabaseClient, userId: string, card: LoyaltyCard, input: CardInput, image?: File | null): Promise<LoyaltyCard> {
  let image_path = card.image_path;
  if (image) image_path = await uploadImage(supabase, userId, image);
  else if (image === null) image_path = null;
  const { data, error } = await supabase.from("loyalty_cards").update({ ...rowOf(input), image_path }).eq("id", card.id).select(LOYALTY_CARD_COLS).single();
  if (error) {
    if (image && image_path) await supabase.storage.from(LOYALTY_BUCKET).remove([image_path]);
    throw new Error(error.message);
  }
  if (card.image_path && card.image_path !== image_path) await supabase.storage.from(LOYALTY_BUCKET).remove([card.image_path]);
  return data as unknown as LoyaltyCard;
}

export async function removeLoyaltyCard(supabase: SupabaseClient, card: LoyaltyCard): Promise<void> {
  const { error } = await supabase.from("loyalty_cards").delete().eq("id", card.id);
  if (error) throw new Error(error.message);
  if (card.image_path) await supabase.storage.from(LOYALTY_BUCKET).remove([card.image_path]);
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
