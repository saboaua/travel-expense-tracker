import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { verifiedUser, type SessionUser } from "@/lib/supabase/verified-user";

type CookieToSet = {
  name: string;
  value: string;
  options?: {
    path?: string;
    domain?: string;
    maxAge?: number;
    expires?: Date;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "lax" | "strict" | "none" | boolean;
    [key: string]: unknown;
  };
};

/** Paths that must stay public (no login redirect). */
const PUBLIC_PREFIXES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/api/auth/login",
  "/privacy",
  "/contact",
  "/api/support",
  "/api/request-account",
  "/api/csp-report",
  "/reset-password",
  "/auth",
  "/api/telegram/",
  "/api/cron/",
  "/api/email/inbound", "/api/email/gmail",
  "/api/manifest",
  "/api/icon",
  "/api/version",
  "/s/",
];

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

/** The refreshed response (session cookies) plus the signed-in person, so later steps need not ask again. */
export async function resolveSession(request: NextRequest): Promise<{ response: NextResponse; user: SessionUser | null }> {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          supabaseResponse = NextResponse.next({
            request,
          });

          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Refresh session if expired
  const user = await verifiedUser(supabase);

  const pathname = request.nextUrl.pathname;

  // Public routes (webhook, login, icons, etc.) must never be redirected
  if (isPublic(pathname)) {
    return { response: supabaseResponse, user };
  }

  // Protect dashboard routes
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // The app's start address must not redirect: iOS saves a redirecting page as a plain bookmark (opens in the Safari view with an X)
    // instead of an app. So signed-out visitors see the sign-in screen AT "/" (a rewrite keeps the address).
    if (pathname === "/") {
      const rewrite = NextResponse.rewrite(url, { request });
      supabaseResponse.cookies.getAll().forEach((c) => rewrite.cookies.set(c));
      return { response: rewrite, user };
    }
    return { response: NextResponse.redirect(url), user };
  }

  // Redirect logged-in users away from auth pages
  if (
    user &&
    (pathname.startsWith("/login") || pathname.startsWith("/signup"))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return { response: NextResponse.redirect(url), user };
  }

  return { response: supabaseResponse, user };
}

export async function updateSession(request: NextRequest) {
  return (await resolveSession(request)).response;
}
