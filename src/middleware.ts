import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { createServerClient } from "@supabase/ssr";
import { isTempPasswordExpired } from "@/lib/temp-password-config";
import { canAccessPath, type UserRole } from "@/lib/roles";

export async function middleware(request: NextRequest) {
  // First refresh the session
  const response = await updateSession(request);

  // If updateSession already redirected (e.g. to /login), respect it
  if (response.headers.get("location")) {
    return response;
  }

  const path = request.nextUrl.pathname;

  // Public routes that don't need further checks
  const publicPaths = ["/login", "/forgot-password", "/reset-password", "/auth", "/privacy", "/contact", "/api/support"];
  if (publicPaths.some((p) => path.startsWith(p))) {
    return response;
  }

  // Block public signup completely
  if (path.startsWith("/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Check must_change_password for authenticated users
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {
          // no-op here; session already handled
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, must_change_password")
      .eq("id", user.id)
      .single();

    // Expiry lives in a separate query so the app keeps working if the SQL migration has not run yet
    let expiresAt: string | null = null;
    if (profile?.must_change_password) {
      const { data: exp } = await supabase
        .from("profiles")
        .select("temp_password_expires_at")
        .eq("id", user.id)
        .single();
      expiresAt = (exp?.temp_password_expires_at as string | null) ?? null;
    }

    // Temporary password past its expiry: end the session and send them back to sign in
    if (isTempPasswordExpired(profile?.must_change_password, expiresAt)) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "?expired=1";
      const redirect = NextResponse.redirect(url);
      request.cookies
        .getAll()
        .filter((c) => c.name.startsWith("sb-"))
        .forEach((c) => redirect.cookies.set(c.name, "", { maxAge: 0, path: "/" }));
      return redirect;
    }

    if (profile?.must_change_password && !path.startsWith("/change-password")) {
      const url = request.nextUrl.clone();
      url.pathname = "/change-password";
      return NextResponse.redirect(url);
    }

    // Protect /admin routes using the same role rules as the navigation
    if (path.startsWith("/admin")) {
      const role = ((profile?.role as UserRole) || "user");
      if (!canAccessPath(role, path)) {
        const url = request.nextUrl.clone();
        url.pathname = "/";
        return NextResponse.redirect(url);
      }
    }
  } else if (path.startsWith("/admin")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
