import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { randomCode } from "@/lib/telegram";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: settings } = await supabase
    .from("app_settings")
    .select("telegram_enabled, telegram_bot_username")
    .eq("id", 1)
    .single();

  if (!settings?.telegram_enabled) {
    return NextResponse.json({ error: "Telegram is disabled" }, { status: 403 });
  }

  const code = randomCode();
  const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const { error } = await supabase
    .from("profiles")
    .update({
      telegram_link_code: code,
      telegram_link_expires: expires,
    })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const username = settings.telegram_bot_username || "travelexpenseassistant_bot";
  return NextResponse.json({
    code,
    expires,
    bot: username,
    link: `https://t.me/${username}?start=${code}`,
  });
}
