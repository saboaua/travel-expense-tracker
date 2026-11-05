/**
 * What the bot does with each message and button press. The webhook route only checks the secret and hands updates here.
 * Uses the service role, so every query is limited to the linked person's own id.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { answerCallback, sendMessage } from "@/lib/telegram";
import { PERSONAL_PROJECT_COLS, TELEGRAM_PENDING_COLS, TELEGRAM_PENDING_COLS_V2, isMissingColumn } from "@/lib/columns";
import { loadPermissions } from "@/lib/access-server";
import { buildScanOptions, type ScanOption } from "@/lib/scan-destination";
import { requestNewUser, requestRoleChange, resolveAdminAction } from "@/lib/telegram-admin";
import { digestText, gatherDigest } from "@/lib/telegram-reminders";
import { applyNotifyCommand, parseCommand } from "@/lib/telegram-commands";
import { escapeHtml, loadPrefs, savePrefs } from "@/lib/telegram-notify";
import { removeSaved, saveBusiness, saveDocument, saveGrocery, savePersonalExpense, type Saved, type TgFile } from "@/lib/telegram-save";
import { decideUpload, destCallback, formatSavedRef, parseDestCallback, parseSavedRef } from "@/lib/telegram-upload";
import { DOC_BUCKET } from "@/lib/document-upload";
import { todayISO } from "@/lib/utils";

type Db = SupabaseClient;
type Profile = { id: string; email?: string | null; full_name: string | null; telegram_id: number; telegram_default_trip_id: string | null; role: string | null };

/** The parts of a Telegram update this bot reads. */
export type TgMessage = {
  chat: { id: number; type?: string };
  from?: { id: number };
  text?: string;
  caption?: string;
  photo?: { file_id: string }[];
  document?: { file_id: string; mime_type?: string; file_name?: string };
};
export type TgCallback = { id: string; data?: string; from: { id: number }; message: { chat: { id: number; type?: string } } };

const HELP = [
  "Send a photo or PDF and I will file it for you:",
  "• a business trip, groceries, a home project, personal travel, or your documents",
  "• add a word to the caption to choose, for example \"groceries\" or \"passport\"",
  "",
  "/trips — pick a default trip",
  "/recent — last expenses",
  "/notify — messages from the app",
  "/help — this message",
].join("\n");

const ADMIN_HELP = ["", "Admins:", "/digest — today's summary", "/newuser email [role:name] First Last — create an account", "/role email rolename — change a role"].join("\n");

export async function handleMessage(supabase: Db, message: TgMessage) {
  const chatId = message.chat.id;
  const fromId = message.from?.id;
  if (!fromId) return;
  const text = (message.text || "").trim();
  const cmd = parseCommand(text);

  if (cmd?.name === "start") {
    const code = cmd.args[0];
    if (!code) return void (await sendMessage(chatId, "Welcome. Link your account from Settings in the web app, then send the code, or send a receipt photo once linked."));
    return linkAccount(supabase, chatId, fromId, code);
  }

  const profile = await getProfile(supabase, fromId);
  if (!profile) return void (await sendMessage(chatId, "This Telegram account is not linked yet.\n\nOpen the web app → Settings → Enable Telegram, then open the link."));

  if (cmd?.name === "help") return void (await sendMessage(chatId, profile.role === "admin" ? HELP + ADMIN_HELP : HELP));
  if (cmd?.name === "trips") return listTrips(supabase, chatId, profile);
  if (cmd?.name === "recent") return listRecent(supabase, chatId, profile.id);
  if (cmd?.name === "newuser" || cmd?.name === "role") {
    if (profile.role !== "admin") return void (await sendMessage(chatId, "That command is for admins."));
    const priv = message.chat.type === "private";
    return cmd.name === "newuser" ? requestNewUser(supabase, chatId, priv, profile, cmd.args) : requestRoleChange(supabase, chatId, priv, profile, cmd.args);
  }
  if (cmd?.name === "digest") {
    if (profile.role !== "admin") return void (await sendMessage(chatId, "That command is for admins."));
    return void (await sendMessage(chatId, digestText(await gatherDigest(supabase, todayISO()))));
  }
  if (cmd?.name === "notify") {
    const prefs = await loadPrefs(supabase, profile.id);
    const { patch, reply } = applyNotifyCommand(prefs, cmd.args);
    if (Object.keys(patch).length && !(await savePrefs(supabase, profile.id, patch))) return void (await sendMessage(chatId, "Could not save that. Please try again in a moment."));
    return void (await sendMessage(chatId, reply));
  }

  const photo = message.photo?.[message.photo.length - 1];
  const doc = message.document;
  const fileId = photo?.file_id || doc?.file_id;
  if (fileId) {
    const mime = doc?.mime_type || "image/jpeg";
    return handleUpload(supabase, chatId, profile, { file_id: fileId, mime, file_name: doc?.file_name || "receipt.jpg" }, message.caption ?? null);
  }
  await sendMessage(chatId, "Send a photo or PDF, or use /help.");
}

export async function handleCallback(supabase: Db, cq: TgCallback) {
  const chatId = cq.message.chat.id;
  const data = String(cq.data || "");
  await answerCallback(cq.id).catch(() => {});

  const profile = await getProfile(supabase, cq.from.id);
  if (!profile) return;

  // Default trip from /trips (and a held receipt waiting for a trip, as before)
  if (data.startsWith("trip:")) {
    const tripId = data.slice(5);
    const { error } = await supabase.from("profiles").update({ telegram_default_trip_id: tripId }).eq("id", profile.id).select("id");
    if (error) {
      console.error("[telegram] default trip", error.message);
      return void (await sendMessage(chatId, "Could not save your trip choice. Please try again."));
    }
    const pending = await getPending(supabase, profile.telegram_id);
    if (pending && !pending.saved_ref) return saveHeld(supabase, chatId, { ...profile, telegram_default_trip_id: tripId }, `trip:${tripId}`, pending, "Your default trip");
    return void (await sendMessage(chatId, "Default trip updated. Send a receipt whenever you are ready."));
  }

  if (data.startsWith("act:")) return resolveAdminAction(supabase, chatId, cq.message.chat.type === "private", profile, data);

  const key = parseDestCallback(data);
  if (key) {
    const pending = await getPending(supabase, profile.telegram_id);
    if (!pending) return void (await sendMessage(chatId, "That receipt expired. Please send it again."));
    if (pending.saved_ref) return void (await sendMessage(chatId, "Already saved. Tap Change on the saved message to move it."));
    return saveHeld(supabase, chatId, profile, key, pending, null);
  }

  if (data === "chg") {
    const pending = await getPending(supabase, profile.telegram_id);
    const ref = parseSavedRef(pending?.saved_ref);
    if (!pending || !ref) return void (await sendMessage(chatId, "Too late to change that one here. Edit it in the web app, or send the receipt again."));
    const bucket = ref.table === "travel_documents" ? DOC_BUCKET : "receipts";
    if (!(await removeSaved(supabase, profile.id, ref, pending.saved_path ?? null, bucket))) return void (await sendMessage(chatId, "Could not undo that. Please try again."));
    await holdPending(supabase, { telegram_id: profile.telegram_id, file_id: pending.file_id, file_name: pending.file_name, mime: pending.mime, saved_ref: null, saved_path: null });
    return askWhere(supabase, chatId, profile, pending, "Pick the right place:");
  }
}

/* ---------------- uploads ---------------- */

async function loadOptions(supabase: Db, profile: Profile): Promise<ScanOption[]> {
  const perms = await loadPermissions(supabase, profile.role || "user");
  let personalOn = false;
  if (perms.has("personal")) {
    const { data: flag } = await supabase.from("app_settings").select("personal_enabled").eq("id", 1).maybeSingle();
    personalOn = !(flag && flag.personal_enabled === false);
  }
  const [trips, projects] = await Promise.all([
    perms.has("trips") ? supabase.from("trips").select("id, name, destination, start_date, end_date").eq("user_id", profile.id).eq("status", "active").order("start_date", { ascending: false }) : Promise.resolve({ data: [] }),
    personalOn ? supabase.from("personal_projects").select(PERSONAL_PROJECT_COLS).eq("user_id", profile.id).eq("status", "active").order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
  ]);
  return buildScanOptions({
    trips: (trips.data || []) as never,
    projects: (projects.data || []) as never,
    canTrips: perms.has("trips"),
    canPersonal: personalOn,
    canDocuments: perms.has("documents"),
  });
}

async function handleUpload(supabase: Db, chatId: number, profile: Profile, file: TgFile, caption: string | null) {
  const options = await loadOptions(supabase, profile);
  if (!options.length) return void (await sendMessage(chatId, "There is nowhere to save this yet. Create a trip in the web app first, or ask your admin for access."));

  const prefs = await loadPrefs(supabase, profile.id);
  const isPdf = file.mime === "application/pdf" || /\.pdf$/i.test(file.file_name || "");
  const decision = decideUpload({
    options, caption, isPdf, today: todayISO(),
    defaultKey: profile.telegram_default_trip_id ? `trip:${profile.telegram_default_trip_id}` : null,
    last: prefs.last_choice,
  });

  const held = { telegram_id: profile.telegram_id, file_id: file.file_id, file_name: file.file_name ?? null, mime: file.mime ?? null, saved_ref: null, saved_path: null };
  if (decision.pick && decision.confident) {
    await holdPending(supabase, held);
    return saveHeld(supabase, chatId, profile, decision.pick.key, { ...held }, decision.reason, options);
  }
  if (!(await holdPending(supabase, held))) return void (await sendMessage(chatId, "Could not hold this while you choose. Please send it again."));
  return askWhere(supabase, chatId, profile, held, "Where does this go?", decision.reason, decision.choices);
}

async function askWhere(supabase: Db, chatId: number, profile: Profile, pending: Pending, title: string, reason?: string | null, choices?: ScanOption[]) {
  const options = choices ?? (await loadOptions(supabase, profile));
  const list = options.length ? options : [];
  if (!list.length) return void (await sendMessage(chatId, "There is nowhere to save this. Create a trip in the web app first."));
  const isPdf = pending.mime === "application/pdf";
  const shown = isPdf ? [...list].sort((a) => (a.kind === "document" ? -1 : 0)) : list;
  await sendMessage(chatId, `<b>${title}</b>${reason ? `\n${escapeHtml(reason)}` : ""}`, {
    reply_markup: { inline_keyboard: shown.slice(0, 8).map((o, i) => [{ text: `${i === 0 ? "✓ " : ""}${o.label} · ${o.sub.split(" · ")[0]}`.slice(0, 60), callback_data: destCallback(o.key) }]) },
  });
}

/** Saves the held file to the chosen place, remembers the choice, and offers Change. */
async function saveHeld(supabase: Db, chatId: number, profile: Profile, key: string, pending: Pending, reason: string | null, known?: ScanOption[]) {
  const options = known ?? (await loadOptions(supabase, profile));
  const opt = options.find((o) => o.key === key);
  if (!opt) return void (await sendMessage(chatId, "I cannot save to that place. Pick another one."));

  const file: TgFile = { file_id: pending.file_id, file_name: pending.file_name, mime: pending.mime };
  await sendMessage(chatId, opt.kind === "document" ? "Saving…" : "Reading receipt…");
  try {
    let saved: Saved;
    if (opt.kind === "trip") saved = await saveBusiness(supabase, profile.id, opt.id!, file);
    else if (opt.kind === "project" || opt.kind === "ptrip") saved = await savePersonalExpense(supabase, profile.id, opt.id!, file);
    else if (opt.kind === "grocery") saved = await saveGrocery(supabase, profile.id, file);
    else saved = await saveDocument(supabase, profile.id, file);

    await holdPending(supabase, { telegram_id: profile.telegram_id, file_id: pending.file_id, file_name: pending.file_name, mime: pending.mime, saved_ref: formatSavedRef(saved.ref), saved_path: saved.path });
    await savePrefs(supabase, profile.id, { last_choice: opt.key });
    const text = [`Saved to <b>${escapeHtml(saved.where)}</b>`, ...(reason ? [escapeHtml(reason)] : []), "", ...saved.lines, "", "Open the web app to correct anything."].join("\n");
    await sendMessage(chatId, text, {
      reply_markup: { inline_keyboard: [[{ text: "Change", callback_data: "chg" }]] },
    });
  } catch (err) {
    console.error("[telegram] save", err);
    await sendMessage(chatId, "Could not save that. Please try again or upload it in the web app.").catch(() => {});
  }
}

/* ---------------- held file (one per person) ---------------- */

type Pending = { telegram_id?: number; file_id: string; file_name: string | null; mime: string | null; saved_ref?: string | null; saved_path?: string | null };

async function getPending(supabase: Db, telegramId: number): Promise<Pending | null> {
  let res = await supabase.from("telegram_pending").select(TELEGRAM_PENDING_COLS_V2).eq("telegram_id", telegramId).maybeSingle();
  if (isMissingColumn(res.error)) res = await supabase.from("telegram_pending").select(TELEGRAM_PENDING_COLS).eq("telegram_id", telegramId).maybeSingle();
  return (res.data as unknown as Pending | null) ?? null;
}

async function holdPending(supabase: Db, row: Pending & { telegram_id: number }): Promise<boolean> {
  const base = { telegram_id: row.telegram_id, file_id: row.file_id, file_name: row.file_name, mime: row.mime, created_at: new Date().toISOString() };
  let { error } = await supabase.from("telegram_pending").upsert({ ...base, saved_ref: row.saved_ref ?? null, saved_path: row.saved_path ?? null });
  // Migration for Change not run yet: hold the file without it
  if (isMissingColumn(error)) ({ error } = await supabase.from("telegram_pending").upsert(base));
  if (error) console.error("[telegram] hold", error.message);
  return !error;
}

/* ---------------- account and lists ---------------- */

async function linkAccount(supabase: Db, chatId: number, telegramId: number, code: string) {
  const { data: profile } = await supabase.from("profiles").select("id, full_name, telegram_link_expires").eq("telegram_link_code", code.toUpperCase()).maybeSingle();
  if (!profile) return void (await sendMessage(chatId, "That code is invalid. Generate a new one in Settings."));
  if (profile.telegram_link_expires && new Date(profile.telegram_link_expires) < new Date()) return void (await sendMessage(chatId, "That code expired. Generate a new one in Settings."));

  const { error } = await supabase.from("profiles").update({ telegram_id: telegramId, telegram_link_code: null, telegram_link_expires: null }).eq("id", profile.id);
  if (error) {
    console.error("[telegram] link", error.message);
    return void (await sendMessage(chatId, "Could not link your account right now. Please try again in a moment."));
  }
  await sendMessage(chatId, `Linked${profile.full_name ? ` as ${escapeHtml(profile.full_name)}` : ""}.\n\n${HELP}`);
}

async function getProfile(supabase: Db, telegramId: number): Promise<Profile | null> {
  const { data } = await supabase.from("profiles").select("id, email, full_name, telegram_id, telegram_default_trip_id, role").eq("telegram_id", telegramId).maybeSingle();
  return (data as Profile | null) ?? null;
}

async function listTrips(supabase: Db, chatId: number, profile: Profile) {
  const { data: trips } = await supabase.from("trips").select("id, name").eq("user_id", profile.id).eq("status", "active").order("start_date", { ascending: false }).limit(8);
  if (!trips?.length) return void (await sendMessage(chatId, "You have no active trips. Create one in the web app first."));
  await sendMessage(chatId, "Choose a default trip for new receipts:", {
    reply_markup: { inline_keyboard: trips.map((t) => [{ text: `${t.id === profile.telegram_default_trip_id ? "✓ " : ""}${t.name}`, callback_data: `trip:${t.id}` }]) },
  });
}

async function listRecent(supabase: Db, chatId: number, userId: string) {
  const { data } = await supabase.from("expenses").select("merchant, amount, currency, expense_date, category").eq("user_id", userId).order("created_at", { ascending: false }).limit(5);
  if (!data?.length) return void (await sendMessage(chatId, "No expenses yet."));
  await sendMessage(chatId, data.map((e) => `• ${e.expense_date} — ${escapeHtml(e.merchant || "Receipt")} — ${e.amount} ${e.currency || ""} (${escapeHtml(e.category || "Other")})`).join("\n"));
}
