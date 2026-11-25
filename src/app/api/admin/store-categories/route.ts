import { NextResponse } from "next/server";
import { normCountry } from "@/lib/country";
import { requireAdminService } from "@/lib/admin-roles-api";
import { logAudit } from "@/lib/audit";
import { DEFAULT_CATEGORY, isCategory } from "@/lib/personal/store-categories";

export const dynamic = "force-dynamic";
const SETUP = "Run supabase/migration_directory_categories.sql first.";

/** Body: { country, storeKey, category }. Moves a community store to a category. Supermarkets is the default, so moving a store back removes its row. */
export async function POST(request: Request) {
  const a = await requireAdminService();
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const body = await request.json().catch(() => ({}));
  const country = normCountry(typeof body.country === "string" ? body.country : null);
  const storeKey = typeof body.storeKey === "string" ? body.storeKey.trim() : "";
  if (!country || !storeKey || storeKey.length > 160) return NextResponse.json({ error: "Choose a store." }, { status: 400 });
  if (!isCategory(body.category)) return NextResponse.json({ error: "Choose a category." }, { status: 400 });
  const r = body.category === DEFAULT_CATEGORY
    ? await a.admin.from("store_categories").delete().eq("country", country).eq("store_key", storeKey)
    : await a.admin.from("store_categories").upsert({ country, store_key: storeKey, category: body.category, updated_at: new Date().toISOString() }, { onConflict: "country,store_key" });
  if (r.error) return NextResponse.json({ error: /relation|schema cache|column/i.test(r.error.message) ? SETUP : r.error.message }, { status: 500 });
  await logAudit({ actorId: a.me.id, actorEmail: a.me.email, action: "directory.store_moved", entityType: "store_categories", entityId: storeKey, details: { country, category: body.category } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
