import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { logAudit } from "@/lib/audit";
import { canAssignRole, canCreateUsers, type UserRole } from "@/lib/roles";

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

    if (!canCreateUsers(myRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    let { email, password, firstName, lastName, role } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    // Assistants can only create regular users
    if (!canAssignRole(myRole)) {
      role = "user";
    } else if (!["user", "assistant", "admin"].includes(role)) {
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

    const { error: profileError } = await adminClient.from("profiles").upsert({
      id: newUser.user.id,
      email,
      first_name: firstName || null,
      last_name: lastName || null,
      full_name: fullName,
      role,
      must_change_password: true,
      updated_at: new Date().toISOString(),
    });

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
      },
    });

    return NextResponse.json({
      success: true,
      userId: newUser.user.id,
      email,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
