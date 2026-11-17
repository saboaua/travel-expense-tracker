import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasPro } from "@/lib/plans-server";
import { isLocked } from "@/lib/limits-server";
import { buildReportPdf, buildReportWorkbook } from "@/lib/report-export";
import { buildReport, fileNameFor } from "@/lib/report-server";

export const dynamic = "force-dynamic";

/** Excel or PDF of a project, a month of expenses or a month of groceries, with your logo when asked. A Pro feature, checked here and not only on the buttons. */
export async function GET(request: Request) {
  const u = new URL(request.url);
  const format = u.searchParams.get("format");
  if (format !== "excel" && format !== "pdf") return NextResponse.json({ error: "Choose Excel or PDF." }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Project reports follow the trip reports switch; the personal reports stay Pro
  const blocked = u.searchParams.get("scope") === "bproject" ? await isLocked(supabase, user.id, "trip_reports") : !(await hasPro(supabase, user.id));
  if (blocked) return NextResponse.json({ error: "Reports are a Pro feature. Ask your admin to turn Pro on for your account." }, { status: 402 });

  const result = await buildReport(supabase, user.id, { scope: u.searchParams.get("scope") ?? "", month: u.searchParams.get("month"), id: u.searchParams.get("id"), logo: u.searchParams.get("logo") !== "0" });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });

  if (format === "pdf") {
    const bytes = await buildReportPdf(result.data);
    return new NextResponse(new Blob([bytes as BlobPart]), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${fileNameFor(result.file, "pdf")}"`, "Cache-Control": "no-store" } });
  }
  const buffer = await buildReportWorkbook(result.data);
  return new NextResponse(new Blob([new Uint8Array(buffer as ArrayBuffer)]), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${fileNameFor(result.file, "xlsx")}"`, "Cache-Control": "no-store" } });
}
