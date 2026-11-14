import { NextResponse } from "next/server";
import { requireAdminService, isMissingTable } from "@/lib/admin-roles-api";

export const dynamic = "force-dynamic";
const NOT_SET_UP = "Run supabase/migration_account_requests.sql in the Supabase SQL Editor first.";

/** Admin: the requests, newest first. */
export async function GET() {
  const a = await requireAdminService();
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  let q = await a.admin.from("account_requests").select("id, name, email, phone, status, created_at, referred_by").order("created_at", { ascending: false }).limit(200);
  if (q.error && /referred_by|schema cache/i.test(q.error.message)) q = await a.admin.from("account_requests").select("id, name, email, phone, status, created_at").order("created_at", { ascending: false }).limit(200) as typeof q; // migration_invites.sql not run yet
  if (q.error) return NextResponse.json({ error: isMissingTable(q.error.message) ? NOT_SET_UP : q.error.message }, { status: 500 });
  const rows = (q.data ?? []) as unknown as { referred_by?: string | null }[];
  const ids = [...new Set(rows.map((r) => r.referred_by).filter((v): v is string => !!v))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: people } = await a.admin.from("profiles").select("id, full_name, email").in("id", ids);
    for (const p of people ?? []) names.set(p.id as string, ((p.full_name as string | null) || (p.email as string | null) || "").trim());
  }
  const requests = rows.map(({ referred_by, ...r }) => ({ ...r, recommended_by: (referred_by && names.get(referred_by)) || null }));
  return NextResponse.json({ requests }, { headers: { "Cache-Control": "no-store" } });
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
