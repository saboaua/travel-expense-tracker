import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { diagnoseAi } from "@/lib/ocr-ai";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Open this page while signed in to see whether the AI receipt reader works. It never shows the key. */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await diagnoseAi(), { headers: { "Cache-Control": "no-store" } });
}
