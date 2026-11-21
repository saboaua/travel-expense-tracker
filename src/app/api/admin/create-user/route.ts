import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { logAudit } from "@/lib/audit";
import { canAssignRole, type UserRole } from "@/lib/roles";
import { loadPermissions } from "@/lib/access-server";
import { createUserAccount } from "@/lib/user-admin";
import { emailConfigured, sendEmail } from "@/lib/email";
import { getBrand } from "@/lib/brand-icon";
import { loginEmail } from "@/lib/login-email";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, email")
      .eq("id", user.id)
      .single();

    const myRole = (profile?.role as UserRole) || "user";

    if (!(await loadPermissions(supabase, myRole)).has("users.manage")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    let { email, firstName, lastName, role } = body;
    email = typeof email === "string" ? email.trim().toLowerCase() : "";
    const clean = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 80) : null);
    firstName = clean(firstName);
    lastName = clean(lastName);
    role = typeof role === "string" && role ? role : "user";

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
    }

    // How the person gets the login: emailed, shown here, or both. At least one.
    const delivery = body.delivery && typeof body.delivery === "object" ? body.delivery : { show: true };
    const wantEmail = delivery.email === true;
    const wantShow = delivery.show !== false || !wantEmail;
    if (wantEmail && !emailConfigured()) {
      return NextResponse.json({ error: "Email sending is not set up. Turn on \"Show it here\" instead." }, { status: 400 });
    }

    // Only an admin chooses the role; everyone else with the "create users" feature creates regular users
    if (!canAssignRole(myRole)) role = "user";

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Server misconfigured: SUPABASE_SERVICE_ROLE_KEY is not set." }, { status: 500 });
    }
    const adminClient = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const result = await createUserAccount(adminClient, { email, firstName, lastName, role });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    const { userId, tempPassword: password, expiresAt, warning } = result;

    let emailed = false;
    let emailError: string | undefined;
    if (wantEmail) {
      const mail = await sendEmail({ to: email, ...loginEmail({ email, firstName, password, expiresAt, appName: (await getBrand()).appName || undefined }) });
      emailed = mail.ok;
      if (!mail.ok) emailError = mail.error;
    }

    await logAudit({
      actorId: user.id,
      actorEmail: profile?.email || user.email,
      action: "user.created",
      entityType: "user",
      entityId: userId,
      details: { email, role, first_name: firstName, last_name: lastName, created_by_role: myRole, temp_password_expires_at: expiresAt, login_emailed: emailed, ...(wantEmail && !emailed ? { login_email_failed: emailError } : {}) },
    }).catch((e) => console.error("Audit log failed:", e));

    return NextResponse.json({
      success: true,
      userId,
      email,
      // The password goes back to the screen when it is meant to be shown, or when the email did not go out
      tempPassword: wantShow || !emailed ? password : null,
      expiresAt,
      emailed,
      emailError,
      warning,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
