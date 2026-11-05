/**
 * Admin actions typed in the Telegram chat: /newuser and /role. Each one is described back to the admin
 * and only runs after a Confirm tap (stored in telegram_admin_actions, ten minutes, once). Private chats only.
 * Admin accounts are never created or changed from here; that stays in the web app.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendMessage } from "@/lib/telegram";
import { escapeHtml } from "@/lib/telegram-notify";
import { alertAdminsOfAudit } from "@/lib/telegram-alerts";
import { writeAuditRow } from "@/lib/audit";
import { EMAIL_RE, createUserAccount, roleExists } from "@/lib/user-admin";

type Db = SupabaseClient;
type AdminProfile = { id: string; email?: string | null; role: string | null };

const NEWUSER_HELP = "Usage: /newuser email@example.com [role:assistant] First Last\nThe role is optional (default: user). Admin accounts are created in the web app.";
const ROLE_HELP = "Usage: /role email@example.com rolename\nAdmin roles are changed in the web app.";

const META = { ip: "telegram", userAgent: "telegram-bot", origin: "telegram" };
const clean = (v: string) => v.trim().slice(0, 80);

type NewUserArgs = { email: string; role: string; firstName: string | null; lastName: string | null };

export function parseNewUser(args: string[]): { ok: true; value: NewUserArgs } | { ok: false; error: string } {
  const email = (args[0] || "").trim().toLowerCase();
  if (!email) return { ok: false, error: NEWUSER_HELP };
  if (email.length > 254 || !EMAIL_RE.test(email)) return { ok: false, error: `“${escapeHtml(email.slice(0, 60))}” is not a valid email address.\n\n${NEWUSER_HELP}` };
  let role = "user";
  const name: string[] = [];
  for (const a of args.slice(1)) {
    const m = /^role[:=](.+)$/i.exec(a);
    if (m) role = m[1].toLowerCase();
    else name.push(a);
  }
  if (!/^[a-z0-9_-]{1,40}$/.test(role)) return { ok: false, error: "That role name is not valid." };
  if (role === "admin") return { ok: false, error: "Admin accounts are not created from the chat. Use Admin → Users in the web app." };
  return { ok: true, value: { email, role, firstName: name[0] ? clean(name[0]) : null, lastName: name.length > 1 ? clean(name.slice(1).join(" ")) : null } };
}

export function parseRole(args: string[]): { ok: true; email: string; role: string } | { ok: false; error: string } {
  const email = (args[0] || "").trim().toLowerCase();
  const role = (args[1] || "").trim().toLowerCase();
  if (!email || !role) return { ok: false, error: ROLE_HELP };
  if (!EMAIL_RE.test(email)) return { ok: false, error: `“${escapeHtml(email.slice(0, 60))}” is not a valid email address.\n\n${ROLE_HELP}` };
  if (!/^[a-z0-9_-]{1,40}$/.test(role)) return { ok: false, error: "That role name is not valid." };
  if (role === "admin") return { ok: false, error: "Admin roles are not given from the chat. Use Admin → Users in the web app." };
  return { ok: true, email, role };
}

const confirmKeyboard = (id: string) => ({ inline_keyboard: [[{ text: "✅ Confirm", callback_data: `act:ok:${id}` }, { text: "Cancel", callback_data: `act:no:${id}` }]] });

async function store(supabase: Db, admin: AdminProfile, kind: "newuser" | "role", payload: Record<string, unknown>) {
  const { data, error } = await supabase.from("telegram_admin_actions").insert({ admin_id: admin.id, kind, payload }).select("id").single();
  if (error || !data) {
    console.error("[telegram] admin action", error?.message);
    return null;
  }
  return data.id as string;
}

const PRIVATE_ONLY = "For safety, admin actions only work in a private chat with the bot.";
const TABLE_MISSING = "Admin actions are not set up yet. Run supabase/migration_telegram_v3.sql in the Supabase SQL Editor.";

export async function requestNewUser(supabase: Db, chatId: number, isPrivate: boolean, admin: AdminProfile, args: string[]) {
  if (!isPrivate) return void (await sendMessage(chatId, PRIVATE_ONLY));
  const parsed = parseNewUser(args);
  if (!parsed.ok) return void (await sendMessage(chatId, parsed.error));
  const v = parsed.value;
  if (!(await roleExists(supabase, v.role))) return void (await sendMessage(chatId, `The role “${escapeHtml(v.role)}” does not exist.`));
  const { data: existing } = await supabase.from("profiles").select("id").eq("email", v.email).maybeSingle();
  if (existing) return void (await sendMessage(chatId, `${escapeHtml(v.email)} already has an account.`));
  const id = await store(supabase, admin, "newuser", v);
  if (!id) return void (await sendMessage(chatId, TABLE_MISSING));
  const name = [v.firstName, v.lastName].filter(Boolean).join(" ");
  await sendMessage(chatId, `Create this account?\n\n<b>${escapeHtml(v.email)}</b>${name ? `\nName: ${escapeHtml(name)}` : ""}\nRole: ${escapeHtml(v.role)}\n\nThey get a temporary password and must change it at first sign-in.`, { reply_markup: confirmKeyboard(id) });
}

export async function requestRoleChange(supabase: Db, chatId: number, isPrivate: boolean, admin: AdminProfile, args: string[]) {
  if (!isPrivate) return void (await sendMessage(chatId, PRIVATE_ONLY));
  const parsed = parseRole(args);
  if (!parsed.ok) return void (await sendMessage(chatId, parsed.error));
  const { data: target } = await supabase.from("profiles").select("id, email, role, full_name").eq("email", parsed.email).maybeSingle();
  if (!target) return void (await sendMessage(chatId, `No account found for ${escapeHtml(parsed.email)}.`));
  if (target.id === admin.id) return void (await sendMessage(chatId, "You cannot change your own role."));
  if (target.role === "admin") return void (await sendMessage(chatId, "That person is an admin. Admin roles are changed in the web app."));
  if (target.role === parsed.role) return void (await sendMessage(chatId, `${escapeHtml(parsed.email)} already has the role ${escapeHtml(parsed.role)}.`));
  if (!(await roleExists(supabase, parsed.role))) return void (await sendMessage(chatId, `The role “${escapeHtml(parsed.role)}” does not exist.`));
  const id = await store(supabase, admin, "role", { userId: target.id, email: parsed.email, from: target.role || "user", to: parsed.role });
  if (!id) return void (await sendMessage(chatId, TABLE_MISSING));
  await sendMessage(chatId, `Change this role?\n\n<b>${escapeHtml(parsed.email)}</b>\n${escapeHtml(String(target.role || "user"))} → <b>${escapeHtml(parsed.role)}</b>`, { reply_markup: confirmKeyboard(id) });
}

/** Handles the Confirm / Cancel tap. Only the admin who asked can confirm, once, within ten minutes. */
export async function resolveAdminAction(supabase: Db, chatId: number, isPrivate: boolean, admin: AdminProfile, data: string) {
  const m = /^act:(ok|no):([0-9a-f-]{36})$/.exec(data);
  if (!m) return;
  if (admin.role !== "admin") return void (await sendMessage(chatId, "That action is for admins."));
  if (!isPrivate) return void (await sendMessage(chatId, PRIVATE_ONLY));
  const [, choice, id] = m;
  const { data: action } = await supabase.from("telegram_admin_actions").select("id, admin_id, kind, payload, expires_at, done_at").eq("id", id).maybeSingle();
  if (!action || action.admin_id !== admin.id) return void (await sendMessage(chatId, "I could not find that request."));
  if (action.done_at) return void (await sendMessage(chatId, "That request was already handled."));
  if (new Date(String(action.expires_at)).getTime() < Date.now()) return void (await sendMessage(chatId, "That request expired. Send the command again."));

  // Claim it first so a double tap cannot run it twice
  const { data: claimed } = await supabase.from("telegram_admin_actions").update({ done_at: new Date().toISOString() }).eq("id", id).is("done_at", null).select("id");
  if (!claimed || claimed.length === 0) return void (await sendMessage(chatId, "That request was already handled."));
  if (choice === "no") return void (await sendMessage(chatId, "Cancelled. Nothing was changed."));

  const p = action.payload as Record<string, string | null>;
  const actor = { actorId: admin.id, actorEmail: admin.email ?? null };
  if (action.kind === "newuser") {
    const r = await createUserAccount(supabase, { email: String(p.email), firstName: p.firstName, lastName: p.lastName, role: String(p.role) });
    if (!r.ok) return void (await sendMessage(chatId, `Could not create the account: ${escapeHtml(r.error)}`));
    const audit = { ...actor, action: "user.created", entityType: "user", entityId: r.userId, details: { email: r.email, role: r.role, first_name: p.firstName, last_name: p.lastName, created_by_role: "admin", via: "telegram", temp_password_expires_at: r.expiresAt } };
    await writeAuditRow(supabase, META, audit).catch((e) => console.error("[telegram] audit", e));
    await alertAdminsOfAudit(supabase, audit);
    return void (await sendMessage(chatId, [
      `✅ Account created for <b>${escapeHtml(r.email)}</b> (${escapeHtml(r.role)}).`,
      "",
      `Temporary password: <code>${escapeHtml(r.tempPassword)}</code>`,
      `Valid until ${r.expiresAt.slice(0, 16).replace("T", " ")} UTC. They must choose a new one at first sign-in.`,
      "",
      "Send it to them privately, then delete this message.",
      ...(r.warning ? ["", escapeHtml(r.warning)] : []),
    ].join("\n")));
  }

  if (action.kind === "role") {
    const { data: before } = await supabase.from("profiles").select("role").eq("id", String(p.userId)).maybeSingle();
    if (!before || before.role === "admin") return void (await sendMessage(chatId, "That account changed since you asked. Nothing was changed."));
    const { error } = await supabase.from("profiles").update({ role: p.to, updated_at: new Date().toISOString() }).eq("id", String(p.userId));
    if (error) return void (await sendMessage(chatId, "Could not change that role. Please try again."));
    const audit = { ...actor, action: "user.role_changed", entityType: "user", entityId: String(p.userId), details: { email: p.email, from: before.role, to: p.to, via: "telegram" } };
    await writeAuditRow(supabase, META, audit).catch((e) => console.error("[telegram] audit", e));
    await alertAdminsOfAudit(supabase, audit);
    return void (await sendMessage(chatId, `✅ ${escapeHtml(String(p.email))} is now <b>${escapeHtml(String(p.to))}</b>.`));
  }
}
