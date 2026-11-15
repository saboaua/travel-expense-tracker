import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { loadPermissions } from "@/lib/access-server";
import { rateLimit } from "@/lib/rate-limit";
import { summarizeSupport, supportAiConfigured } from "@/lib/support-ai";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Body: { id }. Makes (or remakes) the AI summary of one support request. Needs the Support permission. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!(await loadPermissions(supabase, (me?.role as string) || "user")).has("support.view")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!supportAiConfigured()) return NextResponse.json({ error: "AI is not set up. Add GEMINI_API_KEY in Vercel and redeploy." }, { status: 503 });
  if (!(await rateLimit(`supportai:${user.id}`, 30, 3600))) return NextResponse.json({ error: "Too many tries. Wait a little." }, { status: 429 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "Server misconfigured." }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Choose a request." }, { status: 400 });
  const db = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: row } = await db.from("support_requests").select("name, subject, message").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "That request no longer exists." }, { status: 404 });

  const sum = await summarizeSupport({ name: row.name as string, subject: (row.subject as string | null) ?? null, message: row.message as string });
  const { error } = await db.from("support_requests").update(sum ? { ai_status: "done", ai_summary: sum.summary, ai_category: sum.category, ai_priority: sum.priority, ai_steps: sum.steps } : { ai_status: "failed" }).eq("id", id);
  if (error) return NextResponse.json({ error: /column|schema cache/i.test(error.message) ? "Run supabase/migration_support_ai.sql in the Supabase SQL Editor." : error.message }, { status: 500 });
  if (!sum) return NextResponse.json({ ok: false, failed: true });
  return NextResponse.json({ ok: true, ai: { ai_status: "done", ai_summary: sum.summary, ai_category: sum.category, ai_priority: sum.priority, ai_steps: sum.steps } });
}
