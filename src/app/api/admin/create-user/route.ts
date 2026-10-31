import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  try {
    // 1. Verify the caller is an authenticated admin
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 2. Parse body
    const body = await request.json();
    const { email, password, firstName, lastName, role } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        {
          error:
            "Server misconfigured: SUPABASE_SERVICE_ROLE_KEY is not set. Add it in Vercel environment variables.",
        },
        { status: 500 }
      );
    }

    // 3. Create user with service role (never expose this key to the client)
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
        email_confirm: true, // skip email confirmation for admin-created users
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

    // 4. Ensure profile exists with role + must_change_password
    const fullName = [firstName, lastName].filter(Boolean).join(" ") || null;

    const { error: profileError } = await adminClient.from("profiles").upsert({
      id: newUser.user.id,
      email,
      first_name: firstName || null,
      last_name: lastName || null,
      full_name: fullName,
      role: role === "admin" ? "admin" : "user",
      must_change_password: true,
      updated_at: new Date().toISOString(),
    });

    if (profileError) {
      // User was created in Auth; profile write failed — still report success with warning
      console.error("Profile upsert failed:", profileError);
    }

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
