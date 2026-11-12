import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireAdminService } from "@/lib/admin-roles-api";
import { rateLimit } from "@/lib/rate-limit";
import { mapDoit } from "@/lib/store-prices";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024;
const NEEDED = ["No", "Description", "LSC_Unit_Price_Incl_VAT"];

async function readSheet(file: File): Promise<{ rows: Record<string, unknown>[] } | { error: string }> {
  if (file.size > MAX_BYTES) return { error: "That file is too big (limit 4 MB)." };
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(Buffer.from(await file.arrayBuffer()) as unknown as ArrayBuffer); } catch { return { error: "Could not open that file. Use the exported .xlsx." }; }
  const ws = wb.worksheets[0];
  if (!ws) return { error: "The file has no sheet." };
  const head: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (c, col) => { head[col] = String(c.value ?? "").trim(); });
  const missing = NEEDED.filter((h) => !head.includes(h));
  if (missing.length) return { error: `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Use the Do it export.` };
  const rows: Record<string, unknown>[] = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return;
    const o: Record<string, unknown> = {};
    row.eachCell({ includeEmpty: false }, (c, col) => {
      const h = head[col];
      if (!h) return;
      const v = c.value;
      o[h] = v && typeof v === "object" && "result" in v ? (v as { result: unknown }).result : v;
    });
    rows.push(o);
  });
  if (rows.length > 20000) return { error: "That file has too many rows." };
  return { rows };
}

/** What is saved for Do it right now. */
export async function GET() {
  const a = await requireAdminService();
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const { count, error } = await a.admin.from("store_catalog").select("item_id", { count: "exact", head: true }).eq("store", "doit");
  if (error) return NextResponse.json({ error: /relation|schema cache|constraint/i.test(error.message) ? "Run supabase/migration_store_prices.sql first." : error.message }, { status: 500 });
  const { data } = await a.admin.from("store_catalog").select("fetched_at").eq("store", "doit").order("fetched_at", { ascending: false }).limit(1);
  return NextResponse.json({ rows: count ?? 0, importedAt: data?.[0]?.fetched_at ?? null }, { headers: { "Cache-Control": "no-store" } });
}

/** multipart: file, mode = "preview" (counts only) or "import" (replaces the saved Do it list). */
export async function POST(request: Request) {
  const a = await requireAdminService();
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  if (!(await rateLimit(`doitimport:${a.me.id}`, 30, 3600))) return NextResponse.json({ error: "Too many tries. Wait a little." }, { status: 429 });

  let form: FormData;
  try { form = await request.formData(); } catch { return NextResponse.json({ error: "No file received." }, { status: 400 }); }
  const file = form.get("file");
  const mode = form.get("mode") === "import" ? "import" : "preview";
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose the exported Excel file." }, { status: 400 });

  const sheet = await readSheet(file);
  if ("error" in sheet) return NextResponse.json({ error: sheet.error }, { status: 400 });
  const parsed = mapDoit(sheet.rows);
  if (parsed.rows.length < 50) return NextResponse.json({ error: `Only ${parsed.rows.length} usable items found. Nothing was imported.` }, { status: 400 });

  const summary = { total: parsed.total, kept: parsed.rows.length, skipped: parsed.skipped, sample: parsed.rows.slice(0, 5).map((r) => ({ name: r.name, size: r.size_text, price: r.price })) };
  if (mode === "preview") return NextResponse.json({ mode, ...summary });

  const stamp = new Date().toISOString();
  for (let i = 0; i < parsed.rows.length; i += 500) {
    const chunk = parsed.rows.slice(i, i + 500).map((r) => ({ ...r, currency: "AWG", fetched_at: stamp }));
    const { error } = await a.admin.from("store_catalog").upsert(chunk, { onConflict: "store,item_id" });
    if (error) return NextResponse.json({ error: /constraint/i.test(error.message) ? "Run supabase/migration_doit_prices.sql first." : error.message }, { status: 500 });
  }
  // Items missing from the new file are removed, so the saved list is exactly this file
  const { data: gone } = await a.admin.from("store_catalog").delete().eq("store", "doit").lt("fetched_at", stamp).select("item_id");
  return NextResponse.json({ mode, ...summary, removed: gone?.length ?? 0, importedAt: stamp });
}
