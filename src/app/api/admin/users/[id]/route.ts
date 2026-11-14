import { NextResponse } from "next/server";
import { requireUserManager } from "@/lib/admin-api";
import { logAudit } from "@/lib/audit";
import { canAssignRole } from "@/lib/roles";
import { removeAllUserFiles } from "@/lib/account-files";

export const maxDuration = 60;

/**
 * Deletes a person for good: their files first, then the sign-in itself; every other table follows by cascade.
 * The prices they shared with Community prices stay (store, item and price only, nothing that points back to them).
 * Needs their email typed to confirm. Not for yourself, not the last admin; assistants only for regular users.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireUserManager();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { admin, me } = ctx;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { confirmEmail?: unknown };
  if (id === me.id) return NextResponse.json({ error: "You cannot delete yourself here. Use Your data in Profile." }, { status: 400 });

  const { data: target } = await admin.from("profiles").select("email, role").eq("id", id).maybeSingle();
  const { data: authTarget, error: lookupErr } = await admin.auth.admin.getUserById(id);
  if (lookupErr || !authTarget.user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  const email = (target?.email as string | null) || authTarget.user.email || "";
  const role = (target?.role as string) || "user";
  if (!canAssignRole(me.role) && role !== "user") return NextResponse.json({ error: "Assistants can only delete regular users." }, { status: 403 });
  if (typeof body.confirmEmail !== "string" || !email || body.confirmEmail.trim().toLowerCase() !== email.toLowerCase()) {
    return NextResponse.json({ error: "Type the person's email to confirm." }, { status: 400 });
  }
  if (role === "admin") {
    const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
    if ((count ?? 0) <= 1) return NextResponse.json({ error: "You cannot delete the last admin." }, { status: 400 });
  }

  try {
    await removeAllUserFiles(admin, id);
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw new Error(error.message);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not delete the person." }, { status: 500 });
  }
  await logAudit({
    actorId: me.id, actorEmail: me.email, action: "user.deleted", entityType: "user", entityId: id,
    details: { email, role, shared_prices: "kept" },
  }).catch((e) => console.error("Audit log failed:", e));
  return NextResponse.json({ success: true });
}
