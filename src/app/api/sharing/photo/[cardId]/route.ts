import { NextResponse } from "next/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { LOYALTY_BUCKET } from "@/lib/loyalty-image";
import { isUuid } from "@/lib/sharing";
import { callSharing, jsonError, noStore, withSharingUser } from "@/lib/sharing-server";

export const dynamic = "force-dynamic";

/**
 * A shared card's photo. The database says whether this person may see it right now (active pairing and a share row),
 * then the server signs a link that lasts five minutes and sends the browser there. Every load asks again, so a card
 * that was un-shared stops loading at once. The private bucket's own rules stay owner-only.
 */
export async function GET(request: Request, { params }: { params: Promise<{ cardId: string }> }) {
  const { cardId } = await params;
  if (!isUuid(cardId)) return jsonError("not_found");
  return withSharingUser(request, { limit: { key: "photo", max: 300, windowSec: 3600 } }, async ({ supabase }) => {
    const r = await callSharing(supabase, "shared_loyalty_photo_path", { p_card: cardId });
    if (r.error) return jsonError(r.error);
    const path = typeof r.data === "string" ? r.data : null;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!path || !key) return jsonError("not_found");
    const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await admin.storage.from(LOYALTY_BUCKET).createSignedUrl(path, 300);
    if (error || !data?.signedUrl) return jsonError("not_found");
    return NextResponse.redirect(data.signedUrl, { status: 302, headers: noStore });
  });
}
