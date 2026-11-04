import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AI_IMAGE_TYPES, aiOcrConfigured, extractDocumentWithClaude, extractGroceryWithClaude, extractReceiptWithClaude } from "@/lib/ocr-ai";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BYTES = 6 * 1024 * 1024;
const HOURLY_LIMIT = 60;
const calls = new Map<string, number[]>(); // best-effort per-instance limiter to cap API cost

function allowed(userId: string) {
  const now = Date.now();
  const recent = (calls.get(userId) || []).filter((t) => now - t < 3600 * 1000);
  if (recent.length >= HOURLY_LIMIT) {
    calls.set(userId, recent);
    return false;
  }
  recent.push(now);
  calls.set(userId, recent);
  return true;
}

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
  if (!allowed(user.id)) {
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
      const result = await extractDocumentWithClaude(image);
      return NextResponse.json({ result });
    }
    if (form.get("mode") === "grocery") {
      const result = await extractGroceryWithClaude(image, hints);
      return NextResponse.json({ result });
    }
    const result = await extractReceiptWithClaude(image, hints);
    return NextResponse.json({ result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[ocr]", msg);
    // Only the upstream status number is exposed (e.g. 401 bad key, 402/429 credit or rate limit, 404 unknown model)
    const upstream = msg.match(/request failed \((\d{3})\)/)?.[1] ?? null;
    return NextResponse.json({ error: "AI OCR failed", reason: "ai_failed", upstream }, { status: 502 });
  }
}
