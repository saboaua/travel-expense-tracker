import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadPermissions } from "@/lib/access-server";
import type { UserRole } from "@/lib/roles";
import { emailConfigured, sendEmail } from "@/lib/email";

async function who() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const ok = (await loadPermissions(supabase, ((profile?.role as UserRole) || "user"))).has("users.manage");
  return ok ? user : null;
}

/** Is email sending set up? */
export async function GET() {
  if (!(await who())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ configured: emailConfigured() });
}

/** Sends a short test email to the admin's own address. */
export async function POST() {
  const user = await who();
  if (!user?.email) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const r = await sendEmail({ to: user.email, subject: "Lifolio test email", text: "Email sending works. New people can now get their login by email.", html: "<p>Email sending works. New people can now get their login by email.</p>" });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });
  return NextResponse.json({ ok: true, to: user.email });
}
