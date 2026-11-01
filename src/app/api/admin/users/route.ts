import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { requireUserManager } from "@/lib/admin-api";
import { tempPasswordWindow } from "@/lib/temp-password";

export const dynamic = "force-dynamic";

/**
 * Lists every account with last login and temporary-password status.
 * Runs with the service role because profiles RLS only lets a person read their own row.
 * Accounts that exist in Auth but have no profile row are repaired automatically.
 */
export async function GET() {
  const ctx = await requireUserManager();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { admin } = ctx;

  // All auth accounts (source of truth for existence and last_sign_in_at)
  const authUsers: User[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    authUsers.push(...data.users);
    if (data.users.length < 200) break;
  }

  const { data: profiles, error: profErr } = await admin.from("profiles").select("*");
  if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 });
  const byId = new Map((profiles || []).map((p) => [p.id as string, p]));

  // Repair auth users that have no profile row (e.g. profile insert failed at creation time)
  const missing = authUsers.filter((u) => !byId.has(u.id));
  for (const u of missing) {
    const neverSignedIn = !u.last_sign_in_at;
    const created = new Date(u.created_at);
    const row = {
      id: u.id,
      email: u.email,
      first_name: (u.user_metadata?.first_name as string) || null,
      last_name: (u.user_metadata?.last_name as string) || null,
      full_name: (u.user_metadata?.full_name as string) || null,
      role: "user",
      must_change_password: neverSignedIn,
      ...(neverSignedIn
        ? {
            temp_password_issued_at: created.toISOString(),
            temp_password_expires_at: tempPasswordWindow(created).expiresAt,
          }
        : {}),
      updated_at: new Date().toISOString(),
    };
    const { data: saved } = await admin.from("profiles").upsert(row).select("*").single();
    if (saved) byId.set(u.id, saved);
  }

  const users = authUsers
    .map((u) => {
      const p = byId.get(u.id);
      return {
        id: u.id,
        email: p?.email || u.email || null,
        first_name: p?.first_name ?? null,
        last_name: p?.last_name ?? null,
        full_name: p?.full_name ?? null,
        role: (p?.role as string) || "user",
        must_change_password: !!p?.must_change_password,
        temp_password_expires_at: (p?.temp_password_expires_at as string) ?? null,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        repaired: missing.some((m) => m.id === u.id),
      };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  return NextResponse.json({ users, me: ctx.me });
}
