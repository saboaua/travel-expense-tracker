import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createUserAccount } from "@/lib/user-admin";
import { IPTV_CLIENT_ROLE } from "@/lib/access";
import { logAudit } from "@/lib/audit";

/** Needs the "IPTV clients" option (admin always has it): makes a sign-in for an IPTV client and links it to their record. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role, email").eq("id", user.id).single();
  const { data: allowed } = me?.role === "admin" ? { data: true } : await supabase.rpc("has_permission", { p: "iptv.manage" });
  if (allowed !== true) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { customerId?: unknown; email?: unknown };
  const customerId = typeof body.customerId === "string" ? body.customerId : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[0-9a-f-]{36}$/i.test(customerId)) return NextResponse.json({ error: "Missing client" }, { status: 400 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "Server misconfigured: SUPABASE_SERVICE_ROLE_KEY is not set." }, { status: 500 });

  const { data: client } = await supabase.from("iptv_customers").select("id, name").eq("id", customerId).maybeSingle();
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const db = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const [first, ...rest] = String(client.name).split(/\s+/);
  const result = await createUserAccount(db, { email, firstName: first || null, lastName: rest.join(" ") || null, role: IPTV_CLIENT_ROLE });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  const { error } = await db.from("iptv_customers").update({ client_user_id: result.userId }).eq("id", customerId);
  if (error) return NextResponse.json({ error: "The login was made but could not be linked. Link it by email." }, { status: 500 });

  await logAudit({ actorId: user.id, actorEmail: me?.email || user.email, action: "user.created", entityType: "user", entityId: result.userId, details: { email, role: IPTV_CLIENT_ROLE, iptv_customer: customerId } }).catch(() => {});
  return NextResponse.json({ success: true, email, tempPassword: result.tempPassword, expiresAt: result.expiresAt, warning: result.warning });
}
