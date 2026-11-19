import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasPro } from "@/lib/plans-server";
import { buildFile, buildJournals, catOf, fileName, isProgram, programOf, totals } from "@/lib/accounting";
import { exportedKeys, loadAccountSettings, loadExpenses, markExported } from "@/lib/accounting-server";

export const dynamic = "force-dynamic";

/** The journal entries of a trip, project, year or month. `preview=1` returns the numbers for the review screen; without it the file downloads and the expenses are marked as exported. Pro only, checked here and not only on the buttons. */
export async function GET(request: Request) {
  const u = new URL(request.url);
  const program = u.searchParams.get("program");
  if (!isProgram(program)) return NextResponse.json({ error: "Choose your accounting program." }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPro(supabase, user.id))) return NextResponse.json({ error: "Accounting export is part of Pro. Ask your admin to turn Pro on for your account." }, { status: 402 });

  const loaded = await loadExpenses(supabase, user.id, { scope: u.searchParams.get("scope") ?? "", id: u.searchParams.get("id"), year: u.searchParams.get("year"), month: u.searchParams.get("month") });
  if ("error" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status });

  const [{ settings, ready }, done] = await Promise.all([loadAccountSettings(supabase, user.id), exportedKeys(supabase, user.id, loaded.items)]);
  const skip = u.searchParams.get("skip") !== "0";
  const already = loaded.items.filter((i) => done.has(i.key)).length;
  const chosen = skip ? loaded.items.filter((i) => !done.has(i.key)) : loaded.items;
  const built = buildJournals(chosen, settings, loaded.prefix);
  const sum = totals(built.journals);
  const setupDone = !!settings.credit_code.trim();

  if (u.searchParams.get("preview") === "1") {
    const categories = [...new Set(loaded.items.map((i) => catOf(i.category)))].sort();
    return NextResponse.json({
      label: loaded.label, program, programName: programOf(program).name, currency: "USD", expenses: loaded.items.length, already, entries: built.journals.length,
      lines: sum.lines, debit: sum.debit, credit: sum.credit, balanced: sum.balanced, missing: built.missing, skippedNoUsd: built.skippedNoUsd, categories, settings, setupDone, ready,
    }, { headers: { "Cache-Control": "no-store" } });
  }

  if (!setupDone || built.missing.length) return NextResponse.json({ error: "Set up your accounts first." }, { status: 400 });
  if (!built.journals.length) return NextResponse.json({ error: "Nothing new to export." }, { status: 400 });
  if (!sum.balanced) return NextResponse.json({ error: "Debits and credits do not balance." }, { status: 500 });
  const body = buildFile(program, built.journals, loaded.label);
  await markExported(supabase, user.id, chosen.filter((c) => built.journals.some((j) => j.key === c.key)), program);
  return new NextResponse(body, { headers: { "Content-Type": programOf(program).ext === "iif" ? "application/octet-stream" : "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${fileName(program, loaded.label)}"`, "Cache-Control": "no-store" } });
}
