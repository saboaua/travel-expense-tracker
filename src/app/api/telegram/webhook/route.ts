import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  answerCallback,
  downloadFile,
  getBotConfig,
  getFile,
  sendMessage,
} from "@/lib/telegram";
import { runReceiptOcr } from "@/lib/ocr";

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
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ ok: true });
  }

  const config = await getBotConfig();
  if (!config) return NextResponse.json({ ok: true });

  if (config.secret) {
    const header = request.headers.get("x-telegram-bot-api-secret-token");
    if (header !== config.secret) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
  }

  const update = await request.json();
  const supabase = admin();

  if (!config.enabled) {
    const chatId =
      update.message?.chat?.id || update.callback_query?.message?.chat?.id;
    if (chatId) {
      await sendMessage(
        chatId,
        "Telegram uploads are currently disabled by the administrator."
      ).catch(() => {});
    }
    return NextResponse.json({ ok: true });
  }

  try {
    if (update.callback_query) {
      await handleCallback(supabase, update.callback_query);
    } else if (update.message) {
      await handleMessage(supabase, update.message);
    }
  } catch (err) {
    const chatId =
      update.message?.chat?.id || update.callback_query?.message?.chat?.id;
    if (chatId) {
      await sendMessage(
        chatId,
        "Something went wrong saving that receipt. Try again or use the web app."
      ).catch(() => {});
    }
    console.error("telegram webhook", err);
  }

  return NextResponse.json({ ok: true });
}

async function handleMessage(supabase: ReturnType<typeof admin>, message: any) {
  const chatId = message.chat.id as number;
  const fromId = message.from?.id as number | undefined;
  if (!fromId) return;

  const text = (message.text || "").trim();

  if (text.startsWith("/start")) {
    const code = text.split(/\s+/)[1];
    if (!code) {
      await sendMessage(
        chatId,
        "Welcome. Link your account from Settings in the web app, then send the code, or send a receipt photo once linked."
      );
      return;
    }
    await linkAccount(supabase, chatId, fromId, code);
    return;
  }

  const profile = await getProfile(supabase, fromId);
  if (!profile) {
    await sendMessage(
      chatId,
      "This Telegram account is not linked yet.\n\nOpen the web app \u2192 Settings \u2192 Enable Telegram, then open the link."
    );
    return;
  }

  if (text === "/help") {
    await sendMessage(
      chatId,
      [
        "Send a photo or PDF of a receipt to log it.",
        "/trips \u2014 list active trips and set a default",
        "/recent \u2014 last expenses",
        "/help \u2014 this message",
      ].join("\n")
    );
    return;
  }

  if (text === "/trips") {
    await listTrips(supabase, chatId, profile);
    return;
  }

  if (text === "/recent") {
    await listRecent(supabase, chatId, profile.id);
    return;
  }

  const photo = message.photo?.[message.photo.length - 1];
  const doc = message.document;
  if (photo || doc) {
    await startReceipt(supabase, chatId, profile, {
      fileId: photo?.file_id || doc?.file_id,
      mime: doc?.mime_type || "image/jpeg",
      fileName: doc?.file_name || "receipt.jpg",
    });
    return;
  }

  await sendMessage(chatId, "Send a receipt photo or PDF, or use /trips /recent /help.");
}

async function handleCallback(supabase: ReturnType<typeof admin>, cq: any) {
  const chatId = cq.message.chat.id as number;
  const fromId = cq.from.id as number;
  const data = String(cq.data || "");
  await answerCallback(cq.id).catch(() => {});

  const profile = await getProfile(supabase, fromId);
  if (!profile) return;

  if (data.startsWith("trip:")) {
    const tripId = data.slice(5);
    await supabase
      .from("profiles")
      .update({ telegram_default_trip_id: tripId })
      .eq("id", profile.id);

    const { data: pending } = await supabase
      .from("telegram_pending")
      .select("*")
      .eq("telegram_id", fromId)
      .maybeSingle();

    if (pending) {
      await supabase.from("telegram_pending").delete().eq("telegram_id", fromId);
      await saveReceipt(
        supabase,
        chatId,
        { ...profile, telegram_default_trip_id: tripId },
        pending
      );
    } else {
      await sendMessage(chatId, "Default trip updated. Send a receipt whenever you are ready.");
    }
  }
}

async function linkAccount(
  supabase: ReturnType<typeof admin>,
  chatId: number,
  telegramId: number,
  code: string
) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, telegram_link_expires")
    .eq("telegram_link_code", code.toUpperCase())
    .maybeSingle();

  if (!profile) {
    await sendMessage(chatId, "That code is invalid. Generate a new one in Settings.");
    return;
  }
  if (
    profile.telegram_link_expires &&
    new Date(profile.telegram_link_expires) < new Date()
  ) {
    await sendMessage(chatId, "That code expired. Generate a new one in Settings.");
    return;
  }

  await supabase
    .from("profiles")
    .update({
      telegram_id: telegramId,
      telegram_link_code: null,
      telegram_link_expires: null,
    })
    .eq("id", profile.id);

  await sendMessage(
    chatId,
    `Linked${profile.full_name ? ` as ${profile.full_name}` : ""}.\n\nSend a photo or PDF of a receipt to log an expense. Use /trips to pick a default trip.`
  );
}

async function getProfile(supabase: ReturnType<typeof admin>, telegramId: number) {
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, telegram_id, telegram_default_trip_id")
    .eq("telegram_id", telegramId)
    .maybeSingle();
  return data;
}

async function listTrips(
  supabase: ReturnType<typeof admin>,
  chatId: number,
  profile: { id: string; telegram_default_trip_id?: string | null }
) {
  const { data: trips } = await supabase
    .from("trips")
    .select("id, name")
    .eq("user_id", profile.id)
    .eq("status", "active")
    .order("start_date", { ascending: false })
    .limit(8);

  if (!trips?.length) {
    await sendMessage(chatId, "You have no active trips. Create one in the web app first.");
    return;
  }

  await sendMessage(chatId, "Choose a default trip for new receipts:", {
    reply_markup: {
      inline_keyboard: trips.map((t) => [
        {
          text: `${t.id === profile.telegram_default_trip_id ? "\u2713 " : ""}${t.name}`,
          callback_data: `trip:${t.id}`,
        },
      ]),
    },
  });
}

async function listRecent(
  supabase: ReturnType<typeof admin>,
  chatId: number,
  userId: string
) {
  const { data } = await supabase
    .from("expenses")
    .select("merchant, amount, expense_date, category")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (!data?.length) {
    await sendMessage(chatId, "No expenses yet.");
    return;
  }

  const lines = data.map(
    (e) =>
      `\u2022 ${e.expense_date} \u2014 ${e.merchant || "Receipt"} \u2014 ${e.amount} (${e.category || "Other"})`
  );
  await sendMessage(chatId, lines.join("\n"));
}

async function startReceipt(
  supabase: ReturnType<typeof admin>,
  chatId: number,
  profile: {
    id: string;
    telegram_id: number;
    telegram_default_trip_id?: string | null;
  },
  file: { fileId: string; mime: string; fileName: string }
) {
  const { data: trips } = await supabase
    .from("trips")
    .select("id, name")
    .eq("user_id", profile.id)
    .eq("status", "active")
    .order("start_date", { ascending: false });

  if (!trips?.length) {
    await sendMessage(chatId, "Create an active trip in the web app before uploading receipts.");
    return;
  }

  const preferred =
    trips.find((t) => t.id === profile.telegram_default_trip_id) ||
    (trips.length === 1 ? trips[0] : null);

  if (!preferred) {
    await supabase.from("telegram_pending").upsert({
      telegram_id: profile.telegram_id,
      file_id: file.fileId,
      file_name: file.fileName,
      mime: file.mime,
      created_at: new Date().toISOString(),
    });

    await sendMessage(chatId, "Which trip is this receipt for?", {
      reply_markup: {
        inline_keyboard: trips.map((t) => [
          { text: t.name, callback_data: `trip:${t.id}` },
        ]),
      },
    });
    return;
  }

  await saveReceipt(
    supabase,
    chatId,
    { ...profile, telegram_default_trip_id: preferred.id },
    { file_id: file.fileId, file_name: file.fileName, mime: file.mime }
  );
}

async function saveReceipt(
  supabase: ReturnType<typeof admin>,
  chatId: number,
  profile: { id: string; telegram_default_trip_id?: string | null },
  file: { file_id: string; file_name?: string | null; mime?: string | null }
) {
  const tripId = profile.telegram_default_trip_id;
  if (!tripId) {
    await sendMessage(chatId, "Pick a trip first with /trips.");
    return;
  }

  await sendMessage(chatId, "Reading receipt\u2026");

  const info = await getFile(file.file_id);
  const buf = await downloadFile(info.file_path);
  const mime = file.mime || "image/jpeg";
  const name = file.file_name || "receipt.jpg";
  const ext = name.split(".").pop() || info.file_path.split(".").pop() || "jpg";
  const path = `${profile.id}/${tripId}/${Date.now()}.${ext}`;

  const { error: upErr } = await supabase.storage.from("receipts").upload(path, buf, {
    contentType: mime,
    upsert: false,
  });
  if (upErr) throw upErr;

  let merchant: string | null = null;
  let amount: number | null = null;
  let date: string | null = null;
  let raw = "";

  try {
    const bytes = new Uint8Array(buf);
    const ocrFile = new File([bytes], name, { type: mime });
    const ocr = await runReceiptOcr(ocrFile);
    merchant = ocr.merchant;
    amount = ocr.amount;
    date = ocr.date;
    raw = ocr.rawText;
  } catch {
    // OCR is best-effort
  }

  const expenseDate = date || new Date().toISOString().slice(0, 10);
  const finalAmount = amount ?? 0;

  const { error: insErr } = await supabase.from("expenses").insert({
    trip_id: tripId,
    user_id: profile.id,
    merchant,
    amount: finalAmount,
    category: "Other",
    expense_date: expenseDate,
    notes:
      amount == null
        ? "Imported from Telegram \u2014 amount not detected"
        : "Imported from Telegram",
    receipt_path: path,
    ocr_raw: raw ? { text: raw.slice(0, 4000) } : null,
  });
  if (insErr) throw insErr;

  const { data: trip } = await supabase
    .from("trips")
    .select("name")
    .eq("id", tripId)
    .single();

  await sendMessage(
    chatId,
    [
      `Saved on <b>${trip?.name || "trip"}</b>`,
      merchant ? `Merchant: ${merchant}` : "Merchant: not detected",
      amount != null ? `Amount: ${amount.toFixed(2)}` : "Amount: not detected (saved as 0)",
      `Date: ${expenseDate}`,
      "",
      "Open the web app to correct category or amount if needed.",
    ].join("\n")
  );
}
