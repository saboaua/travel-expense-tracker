import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasPro } from "@/lib/plans-server";
import { loadAccountSettings } from "@/lib/accounting-server";
import { cleanSettings, isProgram } from "@/lib/accounting";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPro(supabase, user.id))) return NextResponse.json({ error: "Accounting export is part of Pro." }, { status: 402 });
  return NextResponse.json(await loadAccountSettings(supabase, user.id), { headers: { "Cache-Control": "no-store" } });
}

/** Save the credit account and the account code of each category. */
export async function PUT(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPro(supabase, user.id))) return NextResponse.json({ error: "Accounting export is part of Pro." }, { status: 402 });
  const body = await request.json().catch(() => ({}));
  const s = cleanSettings(body);
  if (!s.credit_code) return NextResponse.json({ error: "Enter the account the money came from, for example 2100." }, { status: 400 });
  const { error } = await supabase.from("accounting_settings").upsert({ user_id: user.id, program: isProgram(body?.program) ? body.program : null, ...s, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return NextResponse.json({ error: "Could not save. Ask your admin to run migration_accounting.sql." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
