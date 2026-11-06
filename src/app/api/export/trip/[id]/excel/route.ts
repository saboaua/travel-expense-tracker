import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildTripWorkbook } from "@/lib/export";
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

  const buffer = await buildTripWorkbook({
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

  const filename = `${trip.name.replace(/[^a-z0-9-_]/gi, "_")}_expenses.xlsx`;
  const bytes = new Uint8Array(buffer as ArrayBuffer);

  return new NextResponse(new Blob([bytes]), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
