import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildMonthlyWorkbook } from "@/lib/export";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ month: string }> }
) {
  const { month } = await params;
  // Expect YYYY-MM
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "Invalid month. Use YYYY-MM" }, { status: 400 });
  }

  const [yearStr, monthStr] = month.split("-");
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthStr, 10);
  if (monthNum < 1 || monthNum > 12 || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "Invalid month" }, { status: 400 });
  }

  const start = `${month}-01`;
  // Last day of month
  const lastDay = new Date(year, monthNum, 0).getDate();
  const end = `${month}-${String(lastDay).padStart(2, "0")}`;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Expenses in the selected month, with trip name + destination
  const { data: expenses } = await supabase
    .from("expenses")
    .select("*, trips(name, destination, currency)")
    .eq("user_id", user.id)
    .gte("expense_date", start)
    .lte("expense_date", end)
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

  const rows = (expenses || []).map((e) => {
    const trip = e.trips as { name?: string; destination?: string | null; currency?: string } | null;
    return {
      id: e.id,
      merchant: e.merchant,
      amount: e.amount,
      currency: e.currency || trip?.currency || "USD",
      exchange_rate: e.exchange_rate,
      amount_usd: e.amount_usd,
      category: e.category,
      expense_date: e.expense_date,
      notes: e.notes,
      receipt_path: e.receipt_path,
      tripName: trip?.name || "",
      destination: trip?.destination || null,
    };
  });

  const buffer = await buildMonthlyWorkbook({
    month,
    expenses: rows,
    userName,
    companyName: profile?.company_name || undefined,
  });

  const bytes = new Uint8Array(buffer as ArrayBuffer);

  return new NextResponse(new Blob([bytes]), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="expenses_${month}.xlsx"`,
    },
  });
}
