import { NextResponse } from "next/server";
import { requireAdminService, ROLES_MISSING, isMissingTable } from "@/lib/admin-roles-api";
import { logAudit } from "@/lib/audit";
import { FEATURE_KEYS, RESERVED_ROLE_KEYS, effectivePermissions, sanitizeLabel, sanitizePermissions, slugifyRoleKey, type RoleRecord } from "@/lib/access";

export const dynamic = "force-dynamic";

/** All roles with how many people have each one. */
export async function GET() {
  const ctx = await requireAdminService();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { data: roles, error } = await ctx.admin.from("roles").select("*").order("is_system", { ascending: false }).order("created_at");
  if (error) return NextResponse.json({ error: isMissingTable(error.message) ? ROLES_MISSING : error.message, setupNeeded: isMissingTable(error.message) }, { status: isMissingTable(error.message) ? 200 : 500 });

  const { data: profiles } = await ctx.admin.from("profiles").select("role");
  const counts: Record<string, number> = {};
  for (const p of profiles || []) counts[p.role as string] = (counts[p.role as string] || 0) + 1;

  return NextResponse.json({
    roles: (roles || []).map((r) => ({
      ...r,
      // What the role can do right now, including unreviewed defaults, so the editor starts from the truth
      effective: [...effectivePermissions(r as RoleRecord)],
      users: counts[r.key as string] || 0,
    })),
  });
}

/** Create a role. Body: { label, description?, copyFrom?, permissions? } */
export async function POST(request: Request) {
  const ctx = await requireAdminService();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await request.json().catch(() => ({}));
  const label = sanitizeLabel(body.label);
  if (!label) return NextResponse.json({ error: "Give the role a name." }, { status: 400 });
  const base = slugifyRoleKey(label);
  if (!base || RESERVED_ROLE_KEYS.has(base)) return NextResponse.json({ error: "Choose a different name for this role." }, { status: 400 });
  const description = typeof body.description === "string" ? body.description.replace(/[<>]/g, "").trim().slice(0, 200) || null : null;

  const { data: existing, error: listErr } = await ctx.admin.from("roles").select("key, label, permissions, known_features");
  if (listErr) return NextResponse.json({ error: isMissingTable(listErr.message) ? ROLES_MISSING : listErr.message }, { status: 500 });
  const keys = new Set((existing || []).map((r) => r.key as string));
  if ((existing || []).some((r) => (r.label as string).toLowerCase() === label.toLowerCase())) {
    return NextResponse.json({ error: "A role with that name already exists." }, { status: 409 });
  }

  let key = base;
  for (let i = 2; keys.has(key) || RESERVED_ROLE_KEYS.has(key); i++) key = `${base.slice(0, 27)}-${i}`;

  let permissions = sanitizePermissions(body.permissions);
  if (typeof body.copyFrom === "string") {
    const src = (existing || []).find((r) => r.key === body.copyFrom);
    if (src) permissions = [...effectivePermissions(src as RoleRecord)].filter((k) => FEATURE_KEYS.includes(k));
  }

  const { error } = await ctx.admin.from("roles").insert({ key, label, description, permissions, known_features: FEATURE_KEYS, is_system: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await logAudit({ actorId: ctx.me.id, actorEmail: ctx.me.email, action: "role.created", entityType: "role", entityId: key, details: { label, permissions } }).catch(() => {});
  return NextResponse.json({ success: true, key });
}
