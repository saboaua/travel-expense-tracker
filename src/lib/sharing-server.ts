import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { sharingErrorCode, sharingMessage, statusForCode } from "@/lib/sharing";

/** Refuses a request that a page on another site sent (a browser always sends Origin on a cross-site POST). */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export const jsonError = (code: string | null, status = statusForCode(code)) =>
  NextResponse.json({ error: sharingMessage(code), code }, { status, headers: { "Cache-Control": "no-store" } });

type Ctx = { supabase: Awaited<ReturnType<typeof createClient>>; userId: string };

/**
 * Every sharing route starts here: same-site request, a person whose sign-in the server has just checked
 * (not only read from the token, so a blocked or deleted person is refused at once), and a per-person rate limit.
 */
export async function withSharingUser<T extends Response>(
  request: Request,
  opts: { write?: boolean; limit?: { key: string; max: number; windowSec: number } },
  run: (ctx: Ctx) => Promise<T>,
): Promise<Response> {
  if (opts.write && !sameOrigin(request)) return jsonError("bad_action", 403);
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return jsonError("not_signed_in");
  const userId = data.user.id;
  const l = opts.limit ?? { key: opts.write ? "write" : "read", max: opts.write ? 120 : 600, windowSec: 3600 };
  if (!(await rateLimit(`sharing:${l.key}:${userId}`, l.max, l.windowSec))) {
    return jsonError(l.key === "invite" ? "daily_limit" : null, 429);
  }
  try {
    return await run({ supabase, userId });
  } catch (e) {
    console.error("[sharing]", e instanceof Error ? e.message : e);
    return jsonError(null, 500);
  }
}

/** Calls a database function as the signed-in person. Database refusals become short, safe messages. */
export async function callSharing(supabase: Ctx["supabase"], fn: string, args: Record<string, unknown> = {}) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { error: sharingErrorCode(error.message), data: null as unknown };
  return { error: null, data: data as unknown };
}

export const noStore = { "Cache-Control": "no-store" } as const;
