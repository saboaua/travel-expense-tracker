import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildYearlyWorkbook } from "@/lib/export";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ year: string }> }
) {
  const { year: yearStr } = await params;
  const year = parseInt(yearStr, 10);
  if (isNaN(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: trips } = await supabase
    .from("trips")
    .select("*, expenses(*)")
    .eq("user_id", user.id)
    .gte("start_date", `${year}-01-01`)
    .lte("start_date", `${year}-12-31`)
    .order("start_date", { ascending: true });

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, first_name, last_name, company_name")
    .eq("id", user.id)
    .single();

  const userName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
    profile?.full_name ||
    undefined;

  const buffer = await buildYearlyWorkbook({
    year,
    trips: (trips || []).map((t) => ({
      id: t.id,
      name: t.name,
      start_date: t.start_date,
      end_date: t.end_date,
      currency: t.currency,
      status: t.status,
      expenses: t.expenses || [],
    })),
    userName,
    companyName: profile?.company_name || undefined,
  });

  const bytes = new Uint8Array(buffer as ArrayBuffer);

  return new NextResponse(new Blob([bytes]), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="travel_expenses_${year}.xlsx"`,
    },
  });
}
