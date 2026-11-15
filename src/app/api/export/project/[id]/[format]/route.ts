import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasPro } from "@/lib/plans-server";
import { PERSONAL_EXPENSE_COLS, PERSONAL_PROJECT_COLS_TYPED, PERSONAL_PROJECT_COLS, withColumnFallback } from "@/lib/columns";
import { resolveType } from "@/lib/personal/project-types";
import { buildProjectPdf, buildProjectWorkbook, projectFileName, projectLines } from "@/lib/project-export";

export const dynamic = "force-dynamic";

/** Excel or PDF report of one project: its name, every expense and the totals. A Pro feature, checked here and not only on the button. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; format: string }> }) {
  const { id, format } = await params;
  if (format !== "excel" && format !== "pdf") return NextResponse.json({ error: "Unknown format" }, { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPro(supabase, user.id))) return NextResponse.json({ error: "Reports are a Pro feature. Ask your admin to turn Pro on for your account." }, { status: 402 });

  const { data: project } = await withColumnFallback((cols) => supabase.from("personal_projects").select(cols).eq("id", id).eq("user_id", user.id).single(), PERSONAL_PROJECT_COLS_TYPED, PERSONAL_PROJECT_COLS);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const p = project as unknown as { name: string; budget: number | null; currency: string; status: string; project_type?: string | null; type_label?: string | null; type_icon?: string | null; type_color?: string | null };

  const [exp, spends, profile] = await Promise.all([
    supabase.from("personal_expenses").select(PERSONAL_EXPENSE_COLS).eq("project_id", id),
    supabase.from("personal_spends").select("merchant, amount, currency, amount_usd, category, expense_date, notes").eq("project_id", id),
    supabase.from("profiles").select("full_name, first_name, last_name").eq("id", user.id).single(),
  ]);
  const ownerName = [profile.data?.first_name, profile.data?.last_name].filter(Boolean).join(" ") || profile.data?.full_name || undefined;
  const data = {
    name: p.name, typeLabel: resolveType(p).label, budget: p.budget != null ? Number(p.budget) : null, currency: p.currency, status: p.status, ownerName,
    lines: projectLines((exp.data as never[]) ?? [], (spends.error ? [] : (spends.data as never[])) ?? []),
  };

  if (format === "pdf") {
    const bytes = await buildProjectPdf(data);
    return new NextResponse(new Blob([bytes as BlobPart]), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${projectFileName(p.name, "pdf")}"` } });
  }
  const buffer = await buildProjectWorkbook(data);
  return new NextResponse(new Blob([new Uint8Array(buffer as ArrayBuffer)]), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${projectFileName(p.name, "xlsx")}"` } });
}
