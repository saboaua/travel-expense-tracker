import { randomInt } from "crypto";
import { createClient } from "@supabase/supabase-js";

const API = "https://api.telegram.org";

type BotConfig = {
  token: string;
  secret: string | null;
  username: string;
  enabled: boolean;
};

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

/** Token priority: admin-saved secret, then TELEGRAM_BOT_TOKEN env. */
export async function getBotConfig(): Promise<BotConfig | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return null;
    return {
      token,
      secret: process.env.TELEGRAM_WEBHOOK_SECRET || null,
      username: "travelexpenseassistant_bot",
      enabled: true,
    };
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

  const token =
    secrets?.telegram_bot_token || process.env.TELEGRAM_BOT_TOKEN || null;
  if (!token) return null;

  return {
    token,
    secret:
      secrets?.telegram_webhook_secret ||
      process.env.TELEGRAM_WEBHOOK_SECRET ||
      null,
    username: settings?.telegram_bot_username || "travelexpenseassistant_bot",
    enabled: !!settings?.telegram_enabled,
  };
}

export async function tg(method: string, body?: Record<string, unknown>) {
  const config = await getBotConfig();
  if (!config) throw new Error("Bot token is not configured");
  const res = await fetch(`${API}/bot${config.token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.description || `Telegram ${method} failed`);
  return json.result;
}

export async function tgWithToken(
  token: string,
  method: string,
  body?: Record<string, unknown>
) {
  const res = await fetch(`${API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.description || `Telegram ${method} failed`);
  return json.result;
}

export async function sendMessage(
  chatId: number,
  text: string,
  extra?: Record<string, unknown>
) {
  return tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", ...extra });
}

export async function answerCallback(id: string, text?: string) {
  return tg("answerCallbackQuery", { callback_query_id: id, text });
}

export async function getFile(fileId: string): Promise<{ file_path: string }> {
  return tg("getFile", { file_id: fileId });
}

export async function downloadFile(filePath: string): Promise<ArrayBuffer> {
  const config = await getBotConfig();
  if (!config) throw new Error("Bot token is not configured");
  const res = await fetch(`${API}/file/bot${config.token}/${filePath}`);
  if (!res.ok) throw new Error("Failed to download Telegram file");
  return res.arrayBuffer();
}

export async function setWebhook(url: string, secret?: string | null, token?: string) {
  const body = {
    url,
    secret_token: secret || undefined,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: false,
  };
  if (token) return tgWithToken(token, "setWebhook", body);
  return tg("setWebhook", body);
}

export function randomCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[randomInt(chars.length)];
  return out;
}

export function maskToken(token: string) {
  if (token.length < 10) return "\u2022\u2022\u2022\u2022";
  return `${token.slice(0, 6)}\u2022\u2022\u2022\u2022${token.slice(-4)}`;
}
