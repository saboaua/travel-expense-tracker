const API = "https://api.telegram.org";

export function botToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN || null;
}

export async function tg(method: string, body?: Record<string, unknown>) {
  const token = botToken();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
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
  const token = botToken();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  const res = await fetch(`${API}/file/bot${token}/${filePath}`);
  if (!res.ok) throw new Error("Failed to download Telegram file");
  return res.arrayBuffer();
}

export async function setWebhook(url: string, secret?: string) {
  return tg("setWebhook", {
    url,
    secret_token: secret || undefined,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: false,
  });
}

export function randomCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
