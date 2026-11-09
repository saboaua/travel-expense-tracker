/**
 * Column lists for Supabase queries, so no page reads more than it uses ("select *" also pulls columns that a later
 * migration adds, such as notes or raw OCR text, and sends them to the browser).
 *
 * tests/columns.test.ts checks every column named here against supabase/*.sql, so a typo or a dropped column fails the
 * tests instead of breaking a page.
 */

export const TRIP_COLS = "id, name, destination, category, start_date, end_date, currency, status, notes";
/** What the export workbooks need from a trip. */
export const TRIP_EXPORT_COLS = "id, name, destination, start_date, end_date, currency, status";

export const EXPENSE_COLS = "id, merchant, amount, currency, exchange_rate, amount_usd, category, expense_date, notes, receipt_path";

export const PERSONAL_PROJECT_COLS = "id, user_id, kind, name, destination, description, start_date, end_date, budget, currency, status, created_at";
export const PERSONAL_EXPENSE_COLS = "id, project_id, merchant, amount, currency, exchange_rate, amount_usd, category, expense_date, notes, receipt_path";

export const GROCERY_RECEIPT_COLS = "id, store, purchase_date, total, currency, receipt_path, notes";
export const GROCERY_ITEM_COLS = "id, name, category, quantity, unit_price, unit, line_total";

export const DOCUMENT_COLS_BASE = "id, user_id, trip_id, kind, title, issuing_country, expiry_date, notes, file_path, created_at";
/** document_number comes from migration_documents_number.sql, which an older database may not have yet. */
export const DOCUMENT_COLS = `${DOCUMENT_COLS_BASE}, document_number`;

/** What the document tiles on the home page need. document_number (masked on the tile) needs its own migration. */
export const DOCUMENT_TILE_COLS_BASE = "id, kind, title, issuing_country, expiry_date, trip_id, file_path, created_at";
export const DOCUMENT_TILE_COLS = `${DOCUMENT_TILE_COLS_BASE}, document_number`;

/** Without the back photo: used when migration_loyalty_back.sql has not been run yet. */
export const LOYALTY_CARD_COLS_BASE = "id, user_id, store_name, holder_name, category, card_number, barcode_format, color, image_path, created_at";
export const LOYALTY_CARD_COLS = `${LOYALTY_CARD_COLS_BASE}, back_image_path`;

export const ROLE_COLS = "key, label, description, permissions, known_features, is_system, created_at";

export const SECURITY_EVENT_COLS = "id, created_at, event_type, severity, email_attempted, ip_address, country, origin, user_agent, user_id, details";
export const AUDIT_LOG_COLS = "id, created_at, action, entity_type, entity_id, actor_id, actor_email, ip_address, origin, user_agent, details";

export const HELP_TOPIC_COLS = "id, slug, title, category, summary, body, sort_order, published, updated_at";

export const SUPPORT_REQUEST_COLS = "id, name, email, subject, message, status, created_at";

export const TELEGRAM_PENDING_COLS = "telegram_id, file_id, file_name, mime";
/** saved_ref and saved_path come from migration_telegram_v2.sql */
export const TELEGRAM_PENDING_COLS_V2 = `${TELEGRAM_PENDING_COLS}, saved_ref, saved_path`;

export const BRANDING_COLS_BASE = "app_name, logo_url, primary_color";
/** The rest arrive with later migrations (login support, personal section). */
export const BRANDING_COLS = `${BRANDING_COLS_BASE}, login_logo_size, privacy_policy, support_email, personal_enabled`;

export const PROFILE_HOME_COLS = "first_name, last_name, full_name, avatar_url, role";
/** Home place comes from migration_home_place.sql; an older database does not have it yet. */
export const PROFILE_HOME_PLACE_COLS = `${PROFILE_HOME_COLS}, home_country, home_city`;

/** True when an error means "a column in my select list does not exist" (a migration has not been run). */
export function isMissingColumn(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  return err.code === "42703" || /column .* does not exist|could not find the .* column/i.test(err.message || "");
}

/**
 * Runs `run(full)`; if the database lacks one of the optional columns, runs `run(base)` instead, so a migration that
 * has not been applied never makes a whole page empty.
 */
export async function withColumnFallback<T extends { error: { code?: string; message?: string } | null }>(run: (columns: string) => PromiseLike<T>, full: string, base: string): Promise<T> {
  const first = await run(full);
  if (isMissingColumn(first.error)) return run(base);
  return first;
}

export const SUBSCRIPTION_COLS = "id, name, price, currency, cycle, next_payment, category, status, trial_ends, split_count, remind_days, cancel_url, notes, price_history";
export const IPTV_CLIENT_COLS = "id, customer_id, plan, model, order_no, donation, portal, mac, device_id, location, date_subscribed, frequency, renewal_date, expire_date, notes";
export const IPTV_CUSTOMER_COLS = "id, name, contact, share_enabled, client_user_id";
export const IPTV_RENEWAL_COLS = "id, renewed_on, frequency, expires_after";
