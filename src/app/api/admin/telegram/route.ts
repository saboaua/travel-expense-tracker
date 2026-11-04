import { NextResponse } from "next/server";
import { loadPermissions } from "@/lib/access-server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createService } from "@supabase/supabase-js";
import { maskToken, randomCode, setWebhook, tgWithToken } from "@/lib/telegram";

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

  if (!(await loadPermissions(supabase, (profile?.role as string) || "user")).has("telegram.manage")) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user };
}

function service() {
  return createService(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Service role key is not configured" }, { status: 500 });
  }

  const supabase = service();
  const [{ data: settings }, { data: secrets }] = await Promise.all([
    supabase
      .from("app_settings")
      .select("telegram_enabled, telegram_bot_username")
      .eq("id", 1)
      .maybeSingle(),
    supabase
      .from("app_secrets")
      .select("telegram_bot_token, telegram_webhook_secret")
      .eq("id", 1)
      .maybeSingle(),
  ]);

  const token = secrets?.telegram_bot_token || process.env.TELEGRAM_BOT_TOKEN || "";

  return NextResponse.json({
    enabled: !!settings?.telegram_enabled,
    botUsername: settings?.telegram_bot_username || "",
    tokenConfigured: !!token,
    tokenPreview: token ? maskToken(token) : null,
    secretConfigured: !!(secrets?.telegram_webhook_secret || process.env.TELEGRAM_WEBHOOK_SECRET),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Service role key is not configured" }, { status: 500 });
  }

  const body = await request.json();
  const supabase = service();

  const { data: existing } = await supabase
    .from("app_secrets")
    .select("telegram_bot_token, telegram_webhook_secret")
    .eq("id", 1)
    .maybeSingle();

  const incoming =
    typeof body.botToken === "string" ? body.botToken.trim() : "";
  const token =
    incoming || existing?.telegram_bot_token || process.env.TELEGRAM_BOT_TOKEN || "";

  if (!token) {
    return NextResponse.json({ error: "Bot token is required" }, { status: 400 });
  }

  // Confirm the token with Telegram before saving it.
  let me: { username?: string };
  try {
    me = await tgWithToken(token, "getMe");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Invalid bot token";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const username = (
    typeof body.botUsername === "string" && body.botUsername.trim()
      ? body.botUsername.trim()
      : me.username || ""
  ).replace(/^@/, "");

  const secret =
    existing?.telegram_webhook_secret ||
    process.env.TELEGRAM_WEBHOOK_SECRET ||
    randomCode(32);

  const { error: secretErr } = await supabase.from("app_secrets").upsert({
    id: 1,
    telegram_bot_token: token,
    telegram_webhook_secret: secret,
    updated_at: new Date().toISOString(),
  });
  if (secretErr) {
    return NextResponse.json({ error: secretErr.message }, { status: 400 });
  }

  const { error: settingsErr } = await supabase.from("app_settings").upsert({
    id: 1,
    telegram_enabled: !!body.enabled,
    telegram_bot_username: username,
    updated_at: new Date().toISOString(),
    updated_by: auth.user!.id,
  });
  if (settingsErr) {
    return NextResponse.json({ error: settingsErr.message }, { status: 400 });
  }

  let webhook: string | null = null;
  if (body.setWebhook) {
    const origin = process.env.NEXT_PUBLIC_SITE_URL || request.headers.get("origin") || "";
    if (!origin) {
      return NextResponse.json({
        ok: true,
        botUsername: username,
        error: "Saved, but no public site URL to register the webhook",
      });
    }
    const url = `${origin.replace(/\/$/, "")}/api/telegram/webhook`;
    await setWebhook(url, secret, token);
    webhook = url;
  }

  return NextResponse.json({
    ok: true,
    botUsername: username,
    webhook,
    tokenPreview: maskToken(token),
  });
}
