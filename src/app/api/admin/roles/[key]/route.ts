import { NextResponse } from "next/server";
import { requireAdminService } from "@/lib/admin-roles-api";
import { logAudit } from "@/lib/audit";
import { FEATURE_KEYS, isSystemRole, sanitizeLabel, sanitizePermissions } from "@/lib/access";
import { ROLE_COLS } from "@/lib/columns";

export const dynamic = "force-dynamic";

/** Edit a role. Saving marks every current feature as reviewed for it. Admin cannot be edited. */
export async function PATCH(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const ctx = await requireAdminService();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { key } = await params;
  if (key === "admin") return NextResponse.json({ error: "The Admin role always has full access and cannot be changed." }, { status: 400 });

  const { data: role } = await ctx.admin.from("roles").select(ROLE_COLS).eq("key", key).maybeSingle();
  if (!role) return NextResponse.json({ error: "Role not found." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.permissions !== undefined) {
    patch.permissions = sanitizePermissions(body.permissions);
    patch.known_features = FEATURE_KEYS;
  }
  if (!isSystemRole(key)) {
    if (body.label !== undefined) {
      const label = sanitizeLabel(body.label);
      if (!label) return NextResponse.json({ error: "Give the role a name." }, { status: 400 });
      patch.label = label;
    }
    if (body.description !== undefined) {
      patch.description = typeof body.description === "string" ? body.description.replace(/[<>]/g, "").trim().slice(0, 200) || null : null;
    }
  }

  const { error } = await ctx.admin.from("roles").update(patch).eq("key", key);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await logAudit({
    actorId: ctx.me.id,
    actorEmail: ctx.me.email,
    action: "role.updated",
    entityType: "role",
    entityId: key,
    details: { before: role.permissions, after: patch.permissions ?? role.permissions, label: patch.label ?? role.label },
  }).catch(() => {});
  return NextResponse.json({ success: true });
}

/** Delete a custom role. People who had it go back to the User role. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const ctx = await requireAdminService();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { key } = await params;
  if (isSystemRole(key)) return NextResponse.json({ error: "Built-in roles cannot be deleted." }, { status: 400 });

  const { data: moved, error: moveErr } = await ctx.admin.from("profiles").update({ role: "user" }).eq("role", key).select("id");
  if (moveErr) return NextResponse.json({ error: moveErr.message }, { status: 400 });

  const { error } = await ctx.admin.from("roles").delete().eq("key", key);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await logAudit({ actorId: ctx.me.id, actorEmail: ctx.me.email, action: "role.deleted", entityType: "role", entityId: key, details: { users_moved_to_user: moved?.length || 0 } }).catch(() => {});
  return NextResponse.json({ success: true, moved: moved?.length || 0 });
}
