import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { AI_IMAGE_TYPES, aiOcrConfigured, extractDocumentWithAi, extractFlightWithAi, extractGroceryChecked, recheckGroceryWithAi, type GroceryScan, extractReceiptWithAi } from "@/lib/ocr-ai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 6 * 1024 * 1024;
const HOURLY_LIMIT = 60;

/** Reads a receipt photo with AI. The client falls back to on-device OCR if this returns an error. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!aiOcrConfigured()) {
    return NextResponse.json({ error: "AI OCR is not configured", configured: false, reason: "not_configured" }, { status: 503 });
  }
  if (!(await rateLimit(`ocr:${user.id}`, HOURLY_LIMIT, 3600))) {
    return NextResponse.json({ error: "Too many scans this hour", reason: "limit" }, { status: 429 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No image" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image too large" }, { status: 413 });
  if (!AI_IMAGE_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Unsupported image type" }, { status: 415 });
  }

  let categories: string[] = [];
  try {
    const parsed = JSON.parse(String(form.get("categories") || "[]"));
    if (Array.isArray(parsed)) categories = parsed.filter((c) => typeof c === "string").slice(0, 30);
  } catch {
    // ignore bad hints
  }
  const currency = String(form.get("currency") || "").toUpperCase();

  const image = { data: new Uint8Array(await file.arrayBuffer()), mime: file.type };
  const hints = { currency: /^[A-Z]{3}$/.test(currency) ? currency : null, categories };

  try {
    if (form.get("mode") === "document") {
      const result = await extractDocumentWithAi(image);
      return NextResponse.json({ result });
    }
    if (form.get("mode") === "flight") {
      const result = await extractFlightWithAi(image);
      return NextResponse.json({ result });
    }
    if (form.get("mode") === "grocery-recheck") {
      // The first reading arrives with the photo; the answer is a better reading or null
      let first: GroceryScan | null = null;
      try { first = JSON.parse(String(form.get("first") || "null")) as GroceryScan; } catch { /* ignored */ }
      if (!first || !Array.isArray(first.items) || first.items.length > 200) return NextResponse.json({ error: "Bad request" }, { status: 400 });
      const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
      first = {
        ...first,
        total: num(first.total), subtotal: num(first.subtotal), tax: num(first.tax),
        items: first.items.map((i) => ({ name: String(i?.name ?? "").slice(0, 160), quantity: num(i?.quantity) || 1, unit_price: num(i?.unit_price) ?? 0, line_total: num(i?.line_total) ?? 0, category: String(i?.category ?? "Other").slice(0, 60), unit: i?.unit ? String(i.unit).slice(0, 4) : null })),
      };
      const result = await recheckGroceryWithAi(image, hints, first);
      return NextResponse.json({ result });
    }
    if (form.get("mode") === "grocery") {
      const result = await extractGroceryChecked(image, hints);
      return NextResponse.json({ result });
    }
    const result = await extractReceiptWithAi(image, hints);
    return NextResponse.json({ result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[ocr]", msg);
    // Only the upstream status number is exposed (e.g. 401 bad key, 402/429 credit or rate limit, 404 unknown model)
    const upstream = msg.match(/request failed \((\d{3})\)/)?.[1] ?? null;
    return NextResponse.json({ error: "AI OCR failed", reason: "ai_failed", upstream }, { status: 502 });
  }
}
