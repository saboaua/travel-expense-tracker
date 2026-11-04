import { NextResponse } from "next/server";
import { requireAdminService } from "@/lib/admin-roles-api";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** Change a person's role. Admin only, and never your own (so there is always an admin). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdminService();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;
  if (id === ctx.me.id) return NextResponse.json({ error: "You cannot change your own role." }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const role = typeof body.role === "string" ? body.role : "";
  const { data: roleRow, error: roleErr } = await ctx.admin.from("roles").select("key").eq("key", role).maybeSingle();
  const known = roleErr ? ["user", "assistant", "admin"].includes(role) : !!roleRow;
  if (!known) return NextResponse.json({ error: "That role does not exist." }, { status: 400 });

  const { data: before } = await ctx.admin.from("profiles").select("role, email").eq("id", id).maybeSingle();
  if (!before) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const { error } = await ctx.admin.from("profiles").update({ role, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await logAudit({ actorId: ctx.me.id, actorEmail: ctx.me.email, action: "user.role_changed", entityType: "user", entityId: id, details: { email: before.email, from: before.role, to: role } }).catch(() => {});
  return NextResponse.json({ success: true });
}
