import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { buildTripWorkbook } from "@/lib/export";
import JSZip from "jszip";
import { isOwnReceiptPath } from "@/lib/receipt-path";
import { EXPENSE_COLS, TRIP_EXPORT_COLS } from "@/lib/columns";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: trip } = await supabase
    .from("trips")
    .select(TRIP_EXPORT_COLS)
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!trip) {
    return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  }

  const { data: expenses } = await supabase
    .from("expenses")
    .select(EXPENSE_COLS)
    .eq("trip_id", id)
    .order("expense_date", { ascending: true });

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, first_name, last_name, company_name")
    .eq("id", user.id)
    .single();

  const userName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
    profile?.full_name ||
    undefined;

  const excelBuffer = await buildTripWorkbook({
    id: trip.id,
    name: trip.name,
    start_date: trip.start_date,
    destination: trip.destination,
    end_date: trip.end_date,
    currency: trip.currency,
    status: trip.status,
    expenses: expenses || [],
    userName,
    companyName: profile?.company_name || undefined,
  });

  const zip = new JSZip();
  const safeName = trip.name.replace(/[^a-z0-9-_]/gi, "_");
  zip.file(`${safeName}_expenses.xlsx`, Buffer.from(excelBuffer));

  const receiptsFolder = zip.folder("receipts");

  const storageClient =
    process.env.SUPABASE_SERVICE_ROLE_KEY
      ? createServiceClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { autoRefreshToken: false, persistSession: false } }
        )
      : supabase;

  for (const exp of expenses || []) {
    if (!exp.receipt_path) continue;
    // The download below uses the service key, so the path stored on the row must never be trusted on its own:
    // a person can save any text in their own expense, and it must not reach another person's files.
    if (!isOwnReceiptPath(exp.receipt_path, user.id)) continue;
    try {
      const { data, error } = await storageClient.storage
        .from("receipts")
        .download(exp.receipt_path);

      if (error || !data) continue;

      const rawExt = (exp.receipt_path.split(".").pop() || "").toLowerCase();
      const ext = /^[a-z0-9]{1,5}$/.test(rawExt) ? rawExt : "jpg"; // never let the stored text shape the file name inside the zip
      const datePart = exp.expense_date || "unknown";
      const merchantPart = (exp.merchant || "receipt")
        .replace(/[^a-z0-9-_]/gi, "_")
        .slice(0, 30);
      const fileName = `${datePart}_${merchantPart}_${exp.id.slice(0, 8)}.${ext}`;

      const arrayBuffer = await data.arrayBuffer();
      receiptsFolder?.file(fileName, arrayBuffer);
    } catch {
      // skip failed receipt
    }
  }

  const zipBytes = await zip.generateAsync({ type: "uint8array" });
  const zipName = `${safeName}_export.zip`;

  // new Uint8Array(...) produces Uint8Array<ArrayBuffer>, which is a valid BlobPart
  // (plain Uint8Array from JSZip is typed as Uint8Array<ArrayBufferLike> under TS 5.9+)
  return new NextResponse(new Blob([new Uint8Array(zipBytes)]), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipName}"`,
    },
  });
}
