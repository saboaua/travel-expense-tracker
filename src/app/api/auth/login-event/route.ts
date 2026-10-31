import { NextResponse } from "next/server";
import { logSecurityEvent, checkBruteForce, getRequestMeta } from "@/lib/audit";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { success, email, userId, errorMessage } = body;

    const meta = await getRequestMeta();

    if (success) {
      await logSecurityEvent({
        eventType: "login_success",
        severity: "info",
        emailAttempted: email,
        userId: userId || null,
        details: { method: "password" },
      });
    } else {
      await logSecurityEvent({
        eventType: "login_failed",
        severity: "warning",
        emailAttempted: email,
        details: { error: errorMessage || "Invalid credentials" },
      });

      // Brute-force check
      const { blocked, failures } = await checkBruteForce(meta.ip, email);

      if (blocked) {
        return NextResponse.json(
          {
            error: "Too many failed attempts. Please try again later.",
            blocked: true,
            failures,
          },
          { status: 429 }
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
