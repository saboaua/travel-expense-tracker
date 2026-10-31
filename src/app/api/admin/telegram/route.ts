import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createService } from "@supabase/supabase-js";
import { setWebhook } from "@/lib/telegram";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { supabase, user };
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { data } = await auth.supabase
    .from("app_settings")
    .select("telegram_enabled, telegram_bot_username")
    .eq("id", 1)
    .single();

  return NextResponse.json({
    enabled: !!data?.telegram_enabled,
    botUsername: data?.telegram_bot_username || "travelexpenseassistant_bot",
    tokenConfigured: !!process.env.TELEGRAM_BOT_TOKEN,
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await request.json();
  const enabled = !!body.enabled;
  const botUsername =
    typeof body.botUsername === "string" && body.botUsername.trim()
      ? body.botUsername.trim().replace(/^@/, "")
      : "travelexpenseassistant_bot";

  const service = createService(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );

  const { error } = await service.from("app_settings").upsert({
    id: 1,
    telegram_enabled: enabled,
    telegram_bot_username: botUsername,
    updated_at: new Date().toISOString(),
    updated_by: auth.user!.id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  let webhook: string | null = null;
  if (enabled && body.setWebhook && process.env.TELEGRAM_BOT_TOKEN) {
    const origin =
      process.env.NEXT_PUBLIC_SITE_URL ||
      request.headers.get("origin") ||
      "";
    if (origin) {
      const url = `${origin.replace(/\/$/, "")}/api/telegram/webhook`;
      await setWebhook(url, process.env.TELEGRAM_WEBHOOK_SECRET);
      webhook = url;
    }
  }

  return NextResponse.json({ ok: true, webhook });
}
