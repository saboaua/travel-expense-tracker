import { NextResponse } from "next/server";
import { requireUserManager } from "@/lib/admin-api";
import { logAudit } from "@/lib/audit";
import { canAssignRole } from "@/lib/roles";

/** Suspends a person (they cannot sign in; nothing is deleted) or restores them. Not for yourself, and assistants only for regular users. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireUserManager();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { admin, me } = ctx;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { suspend?: unknown };
  const suspend = body.suspend !== false;
  if (id === me.id) return NextResponse.json({ error: "You cannot suspend yourself." }, { status: 400 });

  const { data: target } = await admin.from("profiles").select("email, role").eq("id", id).maybeSingle();
  const { data: authTarget, error: lookupErr } = await admin.auth.admin.getUserById(id);
  if (lookupErr || !authTarget.user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  const role = (target?.role as string) || "user";
  if (!canAssignRole(me.role) && role !== "user") return NextResponse.json({ error: "Assistants can only suspend regular users." }, { status: 403 });
  if (suspend && role === "admin") {
    const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
    if ((count ?? 0) <= 1) return NextResponse.json({ error: "You cannot suspend the last admin." }, { status: 400 });
  }

  // ~100 years: a ban with no end date until someone restores the person
  const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: suspend ? "876000h" : "none" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  // phone alerts stop while suspended
  if (suspend) await admin.from("push_subscriptions").delete().eq("user_id", id);

  await logAudit({
    actorId: me.id, actorEmail: me.email,
    action: suspend ? "user.suspended" : "user.restored",
    entityType: "user", entityId: id,
    details: { email: target?.email || authTarget.user.email },
  }).catch((e) => console.error("Audit log failed:", e));
  return NextResponse.json({ success: true, suspended: suspend });
}
