import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { randomCode } from "@/lib/telegram";

async function context() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: settings } = await supabase
    .from("app_settings")
    .select("telegram_enabled, telegram_bot_username")
    .eq("id", 1)
    .single();

  if (!settings?.telegram_enabled) {
    return { error: NextResponse.json({ error: "Telegram is disabled" }, { status: 403 }) };
  }

  const username = settings.telegram_bot_username || "travelexpenseassistant_bot";
  return { supabase, user, username };
}

export async function GET() {
  const ctx = await context();
  if (ctx.error) return ctx.error;

  const { data } = await ctx.supabase
    .from("profiles")
    .select("telegram_id, telegram_link_code, telegram_link_expires")
    .eq("id", ctx.user!.id)
    .single();

  const expires = data?.telegram_link_expires
    ? new Date(data.telegram_link_expires)
    : null;
  const codeValid = !!data?.telegram_link_code && !!expires && expires > new Date();

  return NextResponse.json({
    linked: !!data?.telegram_id,
    bot: ctx.username,
    botUrl: `https://t.me/${ctx.username}`,
    code: codeValid ? data!.telegram_link_code : null,
    expires: codeValid ? data!.telegram_link_expires : null,
    link: codeValid
      ? `https://t.me/${ctx.username}?start=${data!.telegram_link_code}`
      : null,
  });
}

export async function POST() {
  const ctx = await context();
  if (ctx.error) return ctx.error;

  // Opaque one-time code. Never put the user id in the start payload.
  const code = randomCode(8);
  const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const { error } = await ctx.supabase
    .from("profiles")
    .update({
      telegram_link_code: code,
      telegram_link_expires: expires,
    })
    .eq("id", ctx.user!.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const link = `https://t.me/${ctx.username}?start=${code}`;
  return NextResponse.json({
    code,
    expires,
    bot: ctx.username,
    link,
    appLink: `tg://resolve?domain=${ctx.username}&start=${code}`,
  });
}

export async function DELETE() {
  const ctx = await context();
  if (ctx.error) return ctx.error;

  const { error } = await ctx.supabase
    .from("profiles")
    .update({
      telegram_id: null,
      telegram_link_code: null,
      telegram_link_expires: null,
      telegram_default_trip_id: null,
    })
    .eq("id", ctx.user!.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
