import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { getBotConfig, sendMessage } from "@/lib/telegram";
import { handleCallback, handleMessage } from "@/lib/telegram-bot";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function POST(request: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ ok: true });

  const config = await getBotConfig();
  if (!config) return NextResponse.json({ ok: true });

  // Fail closed: without a configured secret anyone could post a fake update and act as a linked Telegram user.
  // (Admin > Telegram always registers the webhook with a secret.)
  if (!config.secret) return NextResponse.json({ ok: false }, { status: 401 });
  const header = request.headers.get("x-telegram-bot-api-secret-token") || "";
  const a = Buffer.from(header);
  const b = Buffer.from(config.secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ ok: false }, { status: 401 });

  const update = await request.json();
  const supabase = admin();

  if (!config.enabled) {
    const chatId = update.message?.chat?.id || update.callback_query?.message?.chat?.id;
    if (chatId) {
      await sendMessage(chatId, "Telegram uploads are currently disabled by the administrator.").catch(() => {});
    }
    return NextResponse.json({ ok: true });
  }

  try {
    if (update.callback_query) await handleCallback(supabase, update.callback_query);
    else if (update.message) await handleMessage(supabase, update.message);
  } catch (err) {
    const chatId = update.message?.chat?.id || update.callback_query?.message?.chat?.id;
    if (chatId) {
      await sendMessage(chatId, "Something went wrong saving that receipt. Try again or use the web app.").catch(() => {});
    }
    console.error("telegram webhook", err);
  }

  return NextResponse.json({ ok: true });
}
