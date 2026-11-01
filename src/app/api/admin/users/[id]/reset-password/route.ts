import { NextResponse } from "next/server";
import { requireUserManager } from "@/lib/admin-api";
import { logAudit } from "@/lib/audit";
import { canAssignRole } from "@/lib/roles";
import { generateTempPassword, tempPasswordWindow } from "@/lib/temp-password";

/** Issues a new temporary password (valid 24h) and forces a change at next sign-in. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireUserManager();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { admin, me } = ctx;
  const { id } = await params;

  if (id === me.id) {
    return NextResponse.json({ error: "Use Profile to change your own password." }, { status: 400 });
  }

  const { data: target } = await admin.from("profiles").select("email, role").eq("id", id).single();
  const { data: authTarget, error: lookupErr } = await admin.auth.admin.getUserById(id);
  if (lookupErr || !authTarget.user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Assistants may only reset regular users
  if (!canAssignRole(me.role) && (target?.role || "user") !== "user") {
    return NextResponse.json({ error: "Assistants can only reset passwords for regular users." }, { status: 403 });
  }

  const password = generateTempPassword();
  const { issuedAt, expiresAt } = tempPasswordWindow();

  const { error: pwErr } = await admin.auth.admin.updateUserById(id, { password });
  if (pwErr) return NextResponse.json({ error: pwErr.message }, { status: 400 });

  const { error: profErr } = await admin.from("profiles").upsert({
    id,
    email: target?.email || authTarget.user.email,
    must_change_password: true,
    temp_password_issued_at: issuedAt,
    temp_password_expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  });
  if (profErr) {
    return NextResponse.json({ error: `Password changed but profile update failed: ${profErr.message}` }, { status: 500 });
  }

  await logAudit({
    actorId: me.id,
    actorEmail: me.email,
    action: "user.temp_password_issued",
    entityType: "user",
    entityId: id,
    details: { email: target?.email || authTarget.user.email, temp_password_expires_at: expiresAt },
  }).catch((e) => console.error("Audit log failed:", e));

  return NextResponse.json({
    success: true,
    email: target?.email || authTarget.user.email,
    tempPassword: password,
    expiresAt,
  });
}
