import { NextResponse } from "next/server";
import { requireAdminService } from "@/lib/admin-roles-api";
import { summarizeShared, type SharedRowLite } from "@/lib/personal/community-stores";
import { isCategory } from "@/lib/personal/store-categories";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PAGE = 1000;
const MAX_ROWS = 100000;

/** Admin overview: how many different products the community has shared, per country and per store. Counts only. */
export async function GET() {
  const a = await requireAdminService();
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const rows: SharedRowLite[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await a.admin.from("shared_prices").select("country, store_key, store_name, product_key, contributor, month").order("id").range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ error: /relation|schema cache|column/i.test(error.message) ? "Run supabase/migration_country.sql first." : error.message }, { status: 500 });
    rows.push(...((data ?? []) as SharedRowLite[]));
    if (!data || data.length < PAGE) break;
  }
  // The category an admin gave each store. Before migration_directory_categories.sql there is none: every store is a supermarket.
  const cats = new Map<string, string>();
  const cr = await a.admin.from("store_categories").select("country, store_key, category");
  if (!cr.error) for (const c of cr.data ?? []) if (isCategory(c.category)) cats.set(`${c.country}|${c.store_key}`, c.category);
  return NextResponse.json({ countries: summarizeShared(rows, cats), capped: rows.length >= MAX_ROWS }, { headers: { "Cache-Control": "no-store" } });
}
