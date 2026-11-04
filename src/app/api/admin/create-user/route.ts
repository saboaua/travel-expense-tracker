import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { logAudit } from "@/lib/audit";
import { canAssignRole, type UserRole } from "@/lib/roles";
import { loadPermissions } from "@/lib/access-server";
import { generateTempPassword, tempPasswordWindow } from "@/lib/temp-password";

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

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // The temporary password is always generated on the server (secure RNG)
    const password = generateTempPassword();
    const { issuedAt, expiresAt } = tempPasswordWindow();

    // Only an admin chooses the role; everyone else with the "create users" feature creates regular users
    if (!canAssignRole(myRole)) {
      role = "user";
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        {
          error:
            "Server misconfigured: SUPABASE_SERVICE_ROLE_KEY is not set.",
        },
        { status: 500 }
      );
    }

    const adminClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // The chosen role must exist (custom roles live in public.roles). Before the roles migration only the 3 built-ins exist.
    if (role !== "user") {
      const { data: roleRow, error: roleErr } = await adminClient.from("roles").select("key").eq("key", role).maybeSingle();
      const known = roleErr ? ["assistant", "admin"].includes(role) : !!roleRow;
      if (!known) return NextResponse.json({ error: "That role does not exist." }, { status: 400 });
    }

    const { data: newUser, error: createError } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: [firstName, lastName].filter(Boolean).join(" ") || null,
          first_name: firstName || null,
          last_name: lastName || null,
        },
      });

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 400 });
    }

    if (!newUser.user) {
      return NextResponse.json({ error: "User creation failed" }, { status: 500 });
    }

    const fullName = [firstName, lastName].filter(Boolean).join(" ") || null;

    const baseProfile = {
      id: newUser.user.id,
      email,
      first_name: firstName || null,
      last_name: lastName || null,
      full_name: fullName,
      role,
      must_change_password: true,
      updated_at: new Date().toISOString(),
    };
    let { error: profileError } = await adminClient.from("profiles").upsert({
      ...baseProfile,
      temp_password_issued_at: issuedAt,
      temp_password_expires_at: expiresAt,
    });
    if (profileError) {
      // Fall back without the expiry columns (migration_temp_password.sql not run yet)
      const retry = await adminClient.from("profiles").upsert(baseProfile);
      profileError = retry.error;
    }

    if (profileError) {
      console.error("Profile upsert failed:", profileError);
    }

    await logAudit({
      actorId: user.id,
      actorEmail: profile?.email || user.email,
      action: "user.created",
      entityType: "user",
      entityId: newUser.user.id,
      details: {
        email,
        role,
        first_name: firstName,
        last_name: lastName,
        created_by_role: myRole,
        temp_password_expires_at: expiresAt,
      },
    }).catch((e) => console.error("Audit log failed:", e));

    return NextResponse.json({
      success: true,
      userId: newUser.user.id,
      email,
      tempPassword: password,
      expiresAt,
      warning: profileError
        ? `Account created, but the profile row could not be saved (${profileError.message}). Run the latest SQL migrations in Supabase.`
        : undefined,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
