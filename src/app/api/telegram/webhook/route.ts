import { todayISO } from "@/lib/utils";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";
import {
  answerCallback,
  downloadFile,
  getBotConfig,
  getFile,
  sendMessage,
} from "@/lib/telegram";
import { runReceiptOcr, type OcrResult } from "@/lib/ocr";
import { AI_IMAGE_TYPES, aiOcrConfigured, extractReceiptWithClaude } from "@/lib/ocr-ai";
import { CURRENCIES, rateToUsd, toUsd } from "@/lib/currencies";

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

/** The parts of a Telegram update this bot reads. */
type TgMessage = {
  chat: { id: number };
  from?: { id: number };
  text?: string;
  photo?: { file_id: string }[];
  document?: { file_id: string; mime_type?: string; file_name?: string };
};
type TgCallback = { id: string; data?: string; from: { id: number }; message: { chat: { id: number } } };

async function handleMessage(supabase: ReturnType<typeof admin>, message: TgMessage) {
  const chatId = message.chat.id as number;
  const fromId = message.from?.id as number | undefined;
  if (!fromId) return;
  const text = (message.text || "").trim();

  if (text.startsWith("/start")) {
    const code = text.split(/\s+/)[1];
    if (!code) {
      await sendMessage(chatId, "Welcome. Link your account from Settings in the web app, then send the code, or send a receipt photo once linked.");
      return;
    }
    await linkAccount(supabase, chatId, fromId, code);
    return;
  }

  const profile = await getProfile(supabase, fromId);
  if (!profile) {
    await sendMessage(chatId, "This Telegram account is not linked yet.\n\nOpen the web app \u2192 Settings \u2192 Enable Telegram, then open the link.");
    return;
  }

  if (text === "/help") {
    await sendMessage(chatId, ["Send a photo or PDF of a receipt to log it.", "/trips \u2014 list active trips and set a default", "/recent \u2014 last expenses", "/help \u2014 this message"].join("\n"));
    return;
  }
  if (text === "/trips") return listTrips(supabase, chatId, profile);
  if (text === "/recent") return listRecent(supabase, chatId, profile.id);

  const photo = message.photo?.[message.photo.length - 1];
  const doc = message.document;
  const fileId = photo?.file_id || doc?.file_id;
  if (fileId) {
    await startReceipt(supabase, chatId, profile, {
      fileId,
      mime: doc?.mime_type || "image/jpeg",
      fileName: doc?.file_name || "receipt.jpg",
    });
    return;
  }
  await sendMessage(chatId, "Send a receipt photo or PDF, or use /trips /recent /help.");
}

async function handleCallback(supabase: ReturnType<typeof admin>, cq: TgCallback) {
  const chatId = cq.message.chat.id as number;
  const fromId = cq.from.id as number;
  const data = String(cq.data || "");
  await answerCallback(cq.id).catch(() => {});

  const profile = await getProfile(supabase, fromId);
  if (!profile) return;

  if (data.startsWith("trip:")) {
    const tripId = data.slice(5);
    const { error: tripErr } = await supabase.from("profiles").update({ telegram_default_trip_id: tripId }).eq("id", profile.id);
    if (tripErr) {
      console.error("[telegram] default trip", tripErr.message);
      return void (await sendMessage(chatId, "Could not save your trip choice. Please try again."));
    }

    const { data: pending } = await supabase.from("telegram_pending").select("*").eq("telegram_id", fromId).maybeSingle();
    if (pending) {
      const { error: delErr } = await supabase.from("telegram_pending").delete().eq("telegram_id", fromId);
      if (delErr) console.error("[telegram] clear pending", delErr.message);
      await saveReceipt(supabase, chatId, { ...profile, telegram_default_trip_id: tripId }, pending);
    } else {
      await sendMessage(chatId, "Default trip updated. Send a receipt whenever you are ready.");
    }
  }
}

async function linkAccount(supabase: ReturnType<typeof admin>, chatId: number, telegramId: number, code: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, telegram_link_expires")
    .eq("telegram_link_code", code.toUpperCase())
    .maybeSingle();

  if (!profile) return sendMessage(chatId, "That code is invalid. Generate a new one in Settings.");
  if (profile.telegram_link_expires && new Date(profile.telegram_link_expires) < new Date()) {
    return sendMessage(chatId, "That code expired. Generate a new one in Settings.");
  }

  const { error: linkErr } = await supabase.from("profiles").update({
    telegram_id: telegramId,
    telegram_link_code: null,
    telegram_link_expires: null,
  }).eq("id", profile.id);
  if (linkErr) {
    console.error("[telegram] link", linkErr.message);
    return sendMessage(chatId, "Could not link your account right now. Please try again in a moment.");
  }

  await sendMessage(chatId, `Linked${profile.full_name ? ` as ${profile.full_name}` : ""}.\n\nSend a photo or PDF of a receipt to log an expense. Use /trips to pick a default trip.`);
}

async function getProfile(supabase: ReturnType<typeof admin>, telegramId: number) {
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, telegram_id, telegram_default_trip_id")
    .eq("telegram_id", telegramId)
    .maybeSingle();
  return data;
}

async function listTrips(supabase: ReturnType<typeof admin>, chatId: number, profile: { id: string; telegram_default_trip_id?: string | null }) {
  const { data: trips } = await supabase.from("trips").select("id, name").eq("user_id", profile.id).eq("status", "active").order("start_date", { ascending: false }).limit(8);
  if (!trips?.length) return sendMessage(chatId, "You have no active trips. Create one in the web app first.");
  await sendMessage(chatId, "Choose a default trip for new receipts:", {
    reply_markup: { inline_keyboard: trips.map((t) => [{ text: `${t.id === profile.telegram_default_trip_id ? "\u2713 " : ""}${t.name}`, callback_data: `trip:${t.id}` }]) },
  });
}

async function listRecent(supabase: ReturnType<typeof admin>, chatId: number, userId: string) {
  const { data } = await supabase.from("expenses").select("merchant, amount, currency, expense_date, category").eq("user_id", userId).order("created_at", { ascending: false }).limit(5);
  if (!data?.length) return sendMessage(chatId, "No expenses yet.");
  await sendMessage(chatId, data.map((e) => `\u2022 ${e.expense_date} \u2014 ${e.merchant || "Receipt"} \u2014 ${e.amount} ${e.currency || ""} (${e.category || "Other"})`).join("\n"));
}

async function startReceipt(
  supabase: ReturnType<typeof admin>,
  chatId: number,
  profile: { id: string; telegram_id: number; telegram_default_trip_id?: string | null },
  file: { fileId: string; mime: string; fileName: string }
) {
  const { data: trips } = await supabase.from("trips").select("id, name").eq("user_id", profile.id).eq("status", "active").order("start_date", { ascending: false });
  if (!trips?.length) return sendMessage(chatId, "Create an active trip in the web app before uploading receipts.");

  const preferred = trips.find((t) => t.id === profile.telegram_default_trip_id) || (trips.length === 1 ? trips[0] : null);
  if (!preferred) {
    const { error: holdErr } = await supabase.from("telegram_pending").upsert({
      telegram_id: profile.telegram_id,
      file_id: file.fileId,
      file_name: file.fileName,
      mime: file.mime,
      created_at: new Date().toISOString(),
    });
    if (holdErr) {
      console.error("[telegram] hold receipt", holdErr.message);
      return sendMessage(chatId, "Could not hold this receipt while you pick a trip. Please send it again.");
    }
    await sendMessage(chatId, "Which trip is this receipt for?", {
      reply_markup: { inline_keyboard: trips.map((t) => [{ text: t.name, callback_data: `trip:${t.id}` }]) },
    });
    return;
  }

  await saveReceipt(supabase, chatId, { ...profile, telegram_default_trip_id: preferred.id }, {
    file_id: file.fileId,
    file_name: file.fileName,
    mime: file.mime,
  });
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms)
    ),
  ]);
}

async function saveReceipt(
  supabase: ReturnType<typeof admin>,
  chatId: number,
  profile: { id: string; telegram_default_trip_id?: string | null },
  file: { file_id: string; file_name?: string | null; mime?: string | null }
) {
  const tripId = profile.telegram_default_trip_id;
  if (!tripId) return sendMessage(chatId, "Pick a trip first with /trips.");

  await sendMessage(chatId, "Reading receipt\u2026");

  try {
    const { data: trip } = await supabase.from("trips").select("name, currency").eq("id", tripId).single();
    const currency = trip?.currency || "USD";

    const info = await getFile(file.file_id);
    const buf = await downloadFile(info.file_path);
    const mime = file.mime || "image/jpeg";
    const name = file.file_name || "receipt.jpg";
    const ext = name.split(".").pop() || info.file_path.split(".").pop() || "jpg";
    const path = `${profile.id}/${tripId}/${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage.from("receipts").upload(path, buf, { contentType: mime, upsert: false });
    if (upErr) throw upErr;

    let merchant: string | null = null;
    let amount: number | null = null;
    let date: string | null = null;
    let detectedCurrency: string | null = null;
    let detectedCategory: string | null = null;
    let raw = "";
    let ocrNote = "";
    let usedAi = false;

    const { data: catRows } = await supabase.from("categories").select("name").eq("enabled", true);
    const categoryNames = (catRows || []).map((c: { name: string }) => c.name);
    const hints = { currency, categories: categoryNames };

    try {
      let ocr: OcrResult | null = null;
      if (aiOcrConfigured() && AI_IMAGE_TYPES.includes(mime)) {
        try {
          ocr = await withTimeout(extractReceiptWithClaude({ data: new Uint8Array(buf), mime }, hints), 25000);
          usedAi = true;
        } catch (aiErr) {
          console.error("telegram AI OCR failed, falling back", aiErr instanceof Error ? aiErr.message : aiErr);
        }
      }
      if (!ocr) {
        ocr = await withTimeout(
          runReceiptOcr(new File([new Uint8Array(buf)], name, { type: mime }), hints),
          25000
        );
      }
      merchant = ocr.merchant;
      amount = ocr.amount;
      date = ocr.date;
      detectedCurrency = ocr.currency;
      detectedCategory = ocr.category;
      raw = ocr.rawText;
    } catch (e) {
      ocrNote = e instanceof Error && e.message === "timeout"
        ? "OCR timed out"
        : "OCR failed";
    }

    const expenseDate = date || todayISO();
    const finalAmount = amount ?? 0;

    // Use the currency printed on the receipt when AI read one that the app supports
    let finalCurrency = currency;
    if (usedAi && detectedCurrency && detectedCurrency !== currency) {
      const { data: curRows } = await supabase.from("currencies").select("code").eq("enabled", true);
      const supported = curRows && curRows.length > 0 ? curRows.map((c: { code: string }) => c.code) : CURRENCIES.map((c) => c.code);
      if (supported.includes(detectedCurrency)) finalCurrency = detectedCurrency;
    }

    let rate = finalCurrency === "USD" ? 1 : 0;
    try { rate = await rateToUsd(finalCurrency); } catch {}
    const usd = toUsd(finalAmount, rate);

    const notes = [
      "Imported from Telegram",
      amount == null ? "amount not detected" : "",
      ocrNote,
    ].filter(Boolean).join(" \u2014 ");

    const { error: insErr } = await supabase.from("expenses").insert({
      trip_id: tripId,
      user_id: profile.id,
      merchant,
      amount: finalAmount,
      currency: finalCurrency,
      exchange_rate: rate,
      amount_usd: usd,
      category: detectedCategory || "Other",
      expense_date: expenseDate,
      notes,
      receipt_path: path,
      ocr_raw: raw ? { text: raw.slice(0, 4000), source: usedAi ? "ai" : "tesseract" } : null,
    });
    if (insErr) throw insErr;

    await sendMessage(chatId, [
      `Saved on <b>${trip?.name || "trip"}</b>`,
      merchant ? `Merchant: ${merchant}` : "Merchant: not detected",
      amount != null ? `Amount: ${amount.toFixed(2)} ${finalCurrency}` : "Amount: not detected (saved as 0)",
      finalCurrency !== "USD" ? `USD: ${usd.toFixed(2)}` : "",
      detectedCategory ? `Category: ${detectedCategory}` : "",
      `Date: ${expenseDate}`,
      ocrNote ? `Note: ${ocrNote}` : "",
      "",
      "Open the web app to correct category, currency, or amount if needed.",
    ].filter(Boolean).join("\n"));
  } catch (err) {
    console.error("saveReceipt", err);
    await sendMessage(chatId, "Could not save the receipt. Please try again or upload it in the web app.").catch(() => {});
  }
}
