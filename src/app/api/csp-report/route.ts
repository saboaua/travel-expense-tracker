import { NextResponse } from "next/server";
import { metaFromRequest, writeSecurityEvent } from "@/lib/security-log";
import { summarizeReport } from "@/lib/csp";

export const dynamic = "force-dynamic";

// Per-instance limiter: reports are unauthenticated, so cap how many one address can write per minute.
const seen = new Map<string, { n: number; reset: number }>();
const PER_MINUTE = 10;

/** Receives Content-Security-Policy violation reports from browsers and keeps them in the security log. */
export async function POST(request: Request) {
  const meta = metaFromRequest(request);
  const now = Date.now();
  const entry = seen.get(meta.ip);
  if (!entry || entry.reset < now) seen.set(meta.ip, { n: 1, reset: now + 60_000 });
  else if (++entry.n > PER_MINUTE) return new NextResponse(null, { status: 204 });
  if (seen.size > 5000) seen.clear();

  const text = await request.text().catch(() => "");
  if (text.length > 8192) return new NextResponse(null, { status: 204 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return new NextResponse(null, { status: 204 });
  }
  const report = summarizeReport(body);
  if (report) {
    await writeSecurityEvent(meta, {
      eventType: "csp_violation",
      severity: "info",
      details: report,
    });
  }
  return new NextResponse(null, { status: 204 });
}
