import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { Readable } from "node:stream";
import { requireAdminService } from "@/lib/admin-roles-api";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { parsePlaces } from "@/lib/personal/supermarket-import";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 2 * 1024 * 1024;
const cell = (v: unknown): unknown => (v && typeof v === "object" && "result" in v ? (v as { result: unknown }).result : v && typeof v === "object" && "text" in v ? (v as { text: unknown }).text : v);

async function template(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Supermarkets");
  ws.columns = [{ header: "Name", width: 40 }, { header: "Latitude", width: 14 }, { header: "Longitude", width: 14 }, { header: "Address", width: 50 }];
  ws.getRow(1).font = { bold: true };
  ws.addRow(["EXAMPLE Ling & Sons (delete this row)", 12.5186, -70.0358, "Example only, rows starting with EXAMPLE are never imported"]);
  ws.addRow(["EXAMPLE Super Food Plaza (delete this row)", 12.5301, -70.0261, ""]);
  const how = wb.addWorksheet("How to fill this in");
  [
    "One row per shop. Name, Latitude and Longitude are needed. Address is optional.",
    "Use the shop name as it is printed on the receipt (Ling & Sons, Super Food Plaza). The app matches receipts to places by name.",
    "A chain with several shops gets one row per shop, with the same name.",
    "Latitude is the first number, longitude the second. Aruba is about 12.5 and -70.0. Use a dot for decimals and keep the minus sign.",
    "You can also put both numbers in one column called GPS, written like 12.5186, -70.0358.",
    "Where to get the numbers: on openstreetmap.org right-click the shop and choose Show address (the numbers appear in the address bar); or stand at the shop and read your phone's GPS (any compass or map app).",
    "Do not copy coordinates out of Google Maps. Its terms do not allow keeping them in your own data.",
    "Importing replaces the whole saved list, so keep every shop in the file. Save as .xlsx or .csv.",
  ].forEach((t, i) => { how.addRow([`${i + 1}. ${t}`]); });
  how.getColumn(1).width = 120;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Status, or the example file with ?template=1. */
export async function GET(request: Request) {
  const a = await requireAdminService();
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  if (new URL(request.url).searchParams.get("template")) {
    return new NextResponse(new Uint8Array(await template()), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="supermarket-places-example.xlsx"', "Cache-Control": "no-store" } });
  }
  const { count, error } = await a.admin.from("supermarket_places").select("id", { count: "exact", head: true });
  if (error) return NextResponse.json({ error: /relation|schema cache/i.test(error.message) ? "Run supabase/migration_supermarket_places.sql first." : error.message }, { status: 500 });
  const { data } = await a.admin.from("supermarket_places").select("imported_at").order("imported_at", { ascending: false }).limit(1);
  return NextResponse.json({ rows: count ?? 0, importedAt: data?.[0]?.imported_at ?? null }, { headers: { "Cache-Control": "no-store" } });
}

/** multipart: file (.xlsx or .csv), mode = "preview" or "import" (replaces the saved list). */
export async function POST(request: Request) {
  const a = await requireAdminService();
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  if (!(await rateLimit(`placesimport:${a.me.id}`, 30, 3600))) return NextResponse.json({ error: "Too many tries. Wait a little." }, { status: 429 });

  let form: FormData;
  try { form = await request.formData(); } catch { return NextResponse.json({ error: "No file received." }, { status: 400 }); }
  const file = form.get("file");
  const mode = form.get("mode") === "import" ? "import" : "preview";
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose the Excel or CSV file." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That file is too big (limit 2 MB)." }, { status: 400 });

  const wb = new ExcelJS.Workbook();
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    if (/\.csv$/i.test(file.name)) await wb.csv.read(Readable.from(buf)); else await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch { return NextResponse.json({ error: "Could not open that file. Use .xlsx or .csv." }, { status: 400 }); }
  const ws = wb.worksheets[0];
  if (!ws) return NextResponse.json({ error: "The file has no sheet." }, { status: 400 });
  const head: unknown[] = [];
  const body: unknown[][] = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    const vals: unknown[] = [];
    row.eachCell({ includeEmpty: true }, (c, col) => { vals[col - 1] = cell(c.value); });
    if (n === 1) head.push(...vals); else if (body.length < 5000) body.push(vals);
  });
  const parsed = parsePlaces(head, body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!parsed.rows.length) return NextResponse.json({ error: "No usable shops found. Nothing was imported." }, { status: 400 });

  const summary = { total: parsed.total, kept: parsed.rows.length, skipped: parsed.skipped, sample: parsed.rows.slice(0, 5).map((r) => ({ name: r.name, lat: r.lat, lng: r.lng })) };
  if (mode === "preview") return NextResponse.json({ mode, ...summary });

  // Places fixed by hand keep their fixed point, and places removed by hand stay removed. Before migration_places_fix.sql there is nothing to keep.
  const keep = new Set<string>();
  const gone = new Set<string>();
  const at = (k: string, lat: number, lng: number) => `${k}|${lat.toFixed(5)}|${lng.toFixed(5)}`;
  let handled = true;
  const fx = await a.admin.from("supermarket_places").select("name_key, lat, lng, orig_key, orig_lat, orig_lng").eq("fixed", true);
  if (fx.error) handled = false;
  else for (const r of fx.data ?? []) { keep.add(at(r.name_key, r.lat, r.lng)); if (r.orig_key && r.orig_lat != null && r.orig_lng != null) keep.add(at(r.orig_key, r.orig_lat, r.orig_lng)); }
  const rm = await a.admin.from("supermarket_places_removed").select("name_key, lat, lng");
  if (!rm.error) for (const r of rm.data ?? []) gone.add(at(r.name_key, r.lat, r.lng));
  const rows = handled ? parsed.rows.filter((r) => { const k = at(r.name_key, r.lat, r.lng); return !keep.has(k) && !gone.has(k); }) : parsed.rows;
  const stamp = new Date().toISOString();
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await a.admin.from("supermarket_places").upsert(rows.slice(i, i + 500).map((r) => ({ ...r, imported_at: stamp })), { onConflict: "name_key,lat,lng" });
    if (error) return NextResponse.json({ error: /relation|schema cache/i.test(error.message) ? "Run supabase/migration_supermarket_places.sql first." : error.message }, { status: 500 });
  }
  const old = a.admin.from("supermarket_places").delete().lt("imported_at", stamp);
  const { data: gone2 } = await (handled ? old.eq("fixed", false) : old).select("id");
  await logAudit({ actorId: a.me.id, actorEmail: a.me.email, action: "catalog.imported", entityType: "supermarket_places", entityId: "places", details: { kept: summary.kept, removed: gone2?.length ?? 0 } }).catch(() => {});
  return NextResponse.json({ mode, ...summary, removed: gone2?.length ?? 0, importedAt: stamp });
}
