import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { inboundAddress } from "@/lib/personal/bill-email";

export const dynamic = "force-dynamic";

const newToken = () => randomBytes(16).toString("hex");
const configured = () => Boolean(process.env.INBOUND_EMAIL_BASE && process.env.INBOUND_EMAIL_SECRET);

async function current(regenerate: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const found = await supabase.from("bill_email_addresses").select("token").eq("user_id", user.id).maybeSingle();
  if (found.error) return NextResponse.json({ setup: /relation|schema cache|does not exist/i.test(found.error.message) ? "migration" : "error" });
  let token = (found.data as { token: string } | null)?.token ?? null;
  if (!token || regenerate) {
    token = newToken();
    const { error } = await supabase.from("bill_email_addresses").upsert({ user_id: user.id, token }, { onConflict: "user_id" });
    if (error) return NextResponse.json({ setup: "error" });
  }
  return NextResponse.json({ address: inboundAddress(process.env.INBOUND_EMAIL_BASE, token), configured: configured() }, { headers: { "Cache-Control": "no-store" } });
}

/** Your private forwarding address (made the first time you ask). */
export async function GET() { return current(false); }
/** A new address: the old one stops working. */
export async function POST() { return current(true); }
