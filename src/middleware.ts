import { type NextRequest, NextResponse } from "next/server";
import { resolveSession } from "@/lib/supabase/middleware";
import { createServerClient } from "@supabase/ssr";
import { isTempPasswordExpired } from "@/lib/temp-password-config";
import { canAccessPath, clientRedirect, ruleForPath } from "@/lib/access";
import { loadPermissions } from "@/lib/access-server";
import { metaFromRequest, writeSecurityEvent } from "@/lib/security-log";
import { buildCsp, cspHeaderName, makeNonce } from "@/lib/csp";

async function handle(request: NextRequest) {
  // First refresh the session
  const { response, user } = await resolveSession(request);

  // If updateSession already redirected (e.g. to /login), respect it
  if (response.headers.get("location")) {
    return response;
  }

  const path = request.nextUrl.pathname;

  // Public routes that don't need further checks
  const publicPaths = ["/login", "/forgot-password", "/reset-password", "/auth", "/privacy", "/contact", "/api/support", "/api/request-account", "/api/auth/login", "/api/csp-report", "/api/version", "/s/"];
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
      await writeSecurityEvent(metaFromRequest(request), {
        eventType: "temp_password_expired",
        severity: "warning",
        emailAttempted: user.email,
        userId: user.id,
        details: { path, where: "middleware" },
      });
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

    // Protect pages with the same role rules as the navigation (admin pages and feature sections)
    const role = (profile?.role as string) || "user";
    // A person who only has an IPTV client login gets their one page, wherever they try to go
    const toClientPage = clientRedirect(role, path);
    if (toClientPage) {
      const url = request.nextUrl.clone();
      url.pathname = toClientPage;
      url.search = "";
      return NextResponse.redirect(url);
    }
    if (role !== "admin" && ruleForPath(path).kind !== "open") {
      const perms = await loadPermissions(supabase, role);
      if (!canAccessPath(role, perms, path)) {
        await writeSecurityEvent(metaFromRequest(request), {
          eventType: "access_denied",
          severity: "warning",
          emailAttempted: user.email,
          userId: user.id,
          details: { path, role },
        });
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

export async function middleware(request: NextRequest) {
  // Content-Security-Policy with a fresh nonce. It is put on the request too, so Next.js adds the nonce to its scripts.
  const enforce = process.env.CSP_ENFORCE === "1";
  const nonce = makeNonce();
  const csp = buildCsp({ nonce, dev: process.env.NODE_ENV !== "production", supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, turnstile: !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY });
  const name = cspHeaderName(enforce);
  request.headers.set("x-nonce", nonce);
  request.headers.set(name, csp);

  const response = await handle(request);
  response.headers.set(name, csp);
  response.headers.set("Reporting-Endpoints", 'csp="/api/csp-report"');
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.json|tesseract/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
