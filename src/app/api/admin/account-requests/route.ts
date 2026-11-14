import { NextResponse } from "next/server";
import { requireAdminService, isMissingTable } from "@/lib/admin-roles-api";

export const dynamic = "force-dynamic";
const NOT_SET_UP = "Run supabase/migration_account_requests.sql in the Supabase SQL Editor first.";

/** Admin: the requests, newest first. */
export async function GET() {
  const a = await requireAdminService();
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const { data, error } = await a.admin.from("account_requests").select("id, name, email, phone, status, created_at").order("created_at", { ascending: false }).limit(200);
  if (error) return NextResponse.json({ error: isMissingTable(error.message) ? NOT_SET_UP : error.message }, { status: 500 });
  return NextResponse.json({ requests: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

/** Admin: mark a request done (account created) or dismissed. */
export async function PATCH(request: Request) {
  const a = await requireAdminService();
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const body = (await request.json().catch(() => null)) as { id?: string; status?: string } | null;
  if (!body?.id || !["done", "dismissed", "new"].includes(body.status ?? "")) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const { error } = await a.admin.from("account_requests").update({ status: body.status, handled_at: body.status === "new" ? null : new Date().toISOString() }).eq("id", body.id);
  if (error) return NextResponse.json({ error: isMissingTable(error.message) ? NOT_SET_UP : error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
