import { normCountry } from "@/lib/country";
import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { requireAdminService } from "@/lib/admin-roles-api";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { MAX_PRICE_ROWS, parsePrices, rowsFingerprint, splitFarOff } from "@/lib/personal/price-import";
import type { SharedRow } from "@/lib/personal/community";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 2 * 1024 * 1024;
const SETUP = "Run supabase/migration_community_confirm.sql first.";
const cell = (v: unknown): unknown => (v && typeof v === "object" && "result" in v ? (v as { result: unknown }).result : v && typeof v === "object" && "text" in v ? (v as { text: unknown }).text : v);
const dayOf = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

async function template(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Prices", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [{ header: "Store", width: 28 }, { header: "Product", width: 46 }, { header: "Price", width: 12, style: { numFmt: "0.00" } }, { header: "Currency", width: 12 }, { header: "Unit", width: 10 }];
  const h = ws.getRow(1);
  h.font = { bold: true, color: { argb: "FFFFFFFF" } };
  h.height = 22;
  h.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4ED8" } }; c.alignment = { vertical: "middle" }; });
  ws.addRow(["EXAMPLE Ling & Sons (delete these rows)", "Coca-Cola 330 ml can", 1.85, "AWG", null]);
  ws.addRow(["EXAMPLE Super Food Plaza", "Fresh whole milk 1 L", 3.49, "AWG", null]);
  ws.addRow(["EXAMPLE Super Food Plaza", "Tomatoes", 4.95, "AWG", "kg"]);
  for (let r = 2; r <= 4; r++) ws.getRow(r).font = { italic: true, color: { argb: "FF6B7280" } };
  for (let r = 2; r <= 2000; r++) {
    ws.getCell(`D${r}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"AWG,USD,EUR,ANG"'], showErrorMessage: true, errorStyle: "warning", errorTitle: "Currency", error: "Use a 3-letter code such as AWG or USD." };
    ws.getCell(`E${r}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"kg,lb,g"'], showErrorMessage: true, errorStyle: "warning", errorTitle: "Unit", error: "Leave empty for items sold per piece or pack. Use kg or lb for items sold by weight." };
    ws.getCell(`C${r}`).dataValidation = { type: "decimal", operator: "between", formulae: [0.01, 99999], allowBlank: true, showErrorMessage: true, errorTitle: "Price", error: "Type the price as a number, like 3.49." };
  }
  const how = wb.addWorksheet("How to fill this in");
  how.getColumn(1).width = 120;
  [
    "One row per price. Store, Product, Price and Currency are needed. Unit is optional.",
    "Store: the shop name as printed on the receipt (Ling & Sons, Super Food Plaza). The same shop written two ways is treated as one shop.",
    "Product: the name as printed, with the size when there is one (Coca-Cola 330 ml, Milk 1 L). The size is how the app tells a small pack from a large one.",
    "Price: what one item (or one kg or lb) costs on the shelf or receipt. Use a dot for decimals. Do not put the line total of several items.",
    "Currency: AWG, USD, EUR or ANG. Any 3-letter code works.",
    "Unit: leave empty for items sold per piece or pack. Type kg or lb when the price is per weight (tomatoes 4.95 per kg).",
    "Rows that start with EXAMPLE are never imported. Delete them or leave them.",
    "Importing only adds. Nothing already in the community prices is changed or removed.",
    "Each upload counts as one more shopper. A price shows right away and is Confirmed once 3 shoppers paid about the same price.",
    "Use each receipt once. Uploading the same prices again is refused so they cannot count twice.",
    "Save as .xlsx or .csv. Up to 5,000 rows per file.",
  ].forEach((t, i) => how.addRow([`${i + 1}. ${t}`]));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Status, or the example file with ?template=1. */
export async function GET(request: Request) {
  const a = await requireAdminService();
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  if (new URL(request.url).searchParams.get("template")) {
    return new NextResponse(new Uint8Array(await template()), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="community-prices-template.xlsx"', "Cache-Control": "no-store" } });
  }
  const { data, error } = await a.admin.from("price_imports").select("added, created_at").order("created_at", { ascending: false }).limit(1000);
  if (error) return NextResponse.json({ error: /relation|schema cache/i.test(error.message) ? SETUP : error.message }, { status: 500 });
  const added = (data ?? []).reduce((n, r) => n + (Number(r.added) || 0), 0);
  return NextResponse.json({ added, uploads: data?.length ?? 0, lastAt: data?.[0]?.created_at ?? null }, { headers: { "Cache-Control": "no-store" } });
}

/** multipart: file (.xlsx or .csv), mode = "preview" or "import". Only adds: nothing already shared is changed or removed. */
export async function POST(request: Request) {
  const a = await requireAdminService();
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  if (!(await rateLimit(`priceimport:${a.me.id}`, 30, 3600))) return NextResponse.json({ error: "Too many tries. Wait a little." }, { status: 429 });

  let form: FormData;
  try { form = await request.formData(); } catch { return NextResponse.json({ error: "No file received." }, { status: 400 }); }
  const file = form.get("file");
  const mode = form.get("mode") === "import" ? "import" : "preview";
  const country = normCountry(typeof form.get("country") === "string" ? (form.get("country") as string) : null); // every row is for this country; without it the currency decides
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
  let tooMany = false;
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    const vals: unknown[] = [];
    row.eachCell({ includeEmpty: true }, (c, col) => { vals[col - 1] = cell(c.value); });
    if (n === 1) head.push(...vals); else if (body.length < MAX_PRICE_ROWS) body.push(vals); else tooMany = true;
  });
  if (tooMany) return NextResponse.json({ error: `The file has more than ${MAX_PRICE_ROWS.toLocaleString()} rows. Split it and import each part. Nothing was imported.` }, { status: 400 });
  const parsed = parsePrices(head, body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (country) for (const r of parsed.rows) r.country = country;
  if (!parsed.rows.length) return NextResponse.json({ error: "No usable prices found. Nothing was imported." }, { status: 400 });

  // The same prices are never counted twice
  const hash = rowsFingerprint(parsed.rows);
  const prev = await a.admin.from("price_imports").select("created_at").eq("file_hash", hash).maybeSingle();
  if (prev.error) return NextResponse.json({ error: /relation|schema cache/i.test(prev.error.message) ? SETUP : prev.error.message }, { status: 500 });
  if (prev.data) return NextResponse.json({ error: `This file was already imported on ${dayOf(prev.data.created_at)}. It is not counted again. Use a new file for new receipts.`, already: true }, { status: 409 });

  // What is already shared for these products (the last 3 months), to spot far off prices and to count what is already there
  const month = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 2, 1)).toISOString().slice(0, 10);
  const existing = new Map<string, number[]>();
  const pairs = new Set<string>();
  const keys = [...new Set(parsed.rows.map((r) => r.product_key))];
  for (let i = 0; i < keys.length; i += 150) {
    const { data, error } = await a.admin.from("shared_prices").select("store_key, product_key, price").in("product_key", keys.slice(i, i + 150)).gte("month", month).limit(10000);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const r of data ?? []) { existing.set(r.product_key, [...(existing.get(r.product_key) ?? []), Number(r.price)]); pairs.add(`${r.store_key}|${r.product_key}`); }
  }
  const { kept, farOff } = splitFarOff(parsed.rows, existing);
  if (!kept.length) return NextResponse.json({ error: "Every price was left out. Nothing was imported." }, { status: 400 });
  const seenBefore = kept.filter((r) => pairs.has(`${r.store_key}|${r.product_key}`)).length;
  const summary = {
    total: parsed.total, kept: kept.length, seenBefore, fresh: kept.length - seenBefore,
    skipped: { ...parsed.skipped, farOff: farOff.length },
    sample: kept.slice(0, 3).map((r: SharedRow) => ({ store: r.store_name, product: r.product_name, currency: r.currency, price: r.price })),
  };
  if (mode === "preview") return NextResponse.json({ mode, ...summary });

  const ins = await a.admin.from("price_imports").insert({ file_hash: hash, file_name: file.name.slice(0, 120), total_rows: parsed.total, added: kept.length, seen_before: seenBefore, created_by: a.me.id });
  if (ins.error) {
    if (ins.error.code === "23505") return NextResponse.json({ error: "This file was already imported. It is not counted again.", already: true }, { status: 409 });
    return NextResponse.json({ error: /relation|schema cache/i.test(ins.error.message) ? SETUP : ins.error.message }, { status: 500 });
  }
  const batch = randomUUID();
  let stored = 0;
  for (let i = 0; i < kept.length; i += 500) {
    const r = await a.admin.rpc("import_prices", { batch, rows: kept.slice(i, i + 500) });
    if (r.error) {
      await a.admin.from("price_imports").delete().eq("file_hash", hash); // so the file can be tried again
      return NextResponse.json({ error: /function|schema cache/i.test(r.error.message) ? SETUP : r.error.message, stored }, { status: 500 });
    }
    stored += Number(r.data) || 0;
  }
  await a.admin.from("price_imports").update({ added: stored }).eq("file_hash", hash);
  await logAudit({ actorId: a.me.id, actorEmail: a.me.email, action: "community_prices.imported", entityType: "shared_prices", entityId: batch, details: { rows: stored, seen_before: seenBefore, left_out: farOff.length } }).catch(() => {});
  return NextResponse.json({ mode, ...summary, added: stored });
}
