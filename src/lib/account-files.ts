import type { SupabaseClient } from "@supabase/supabase-js";

/** The storage buckets that hold a person's files, each under a folder named for their user id. */
export const USER_BUCKETS = ["receipts", "loyalty-cards", "documents", "avatars"];

/** Every file path under a folder, however deep (folders have no id in a listing), a page at a time. */
async function listFiles(db: SupabaseClient, bucket: string, folder: string, depth = 0): Promise<string[]> {
  if (depth > 6) return [];
  const out: string[] = [];
  for (let offset = 0; offset < 100000; offset += 100) {
    const { data, error } = await db.storage.from(bucket).list(folder, { limit: 100, offset });
    if (error || !data?.length) break;
    for (const f of data) {
      if (f.id) out.push(`${folder}/${f.name}`);
      else out.push(...(await listFiles(db, bucket, `${folder}/${f.name}`, depth + 1)));
    }
    if (data.length < 100) break;
  }
  return out;
}

/** Removes every file under <user id>/ in a bucket, in any depth of folders (photos sit in personal/spends/, personal/utilities/ and so on). */
export async function removeFiles(db: SupabaseClient, bucket: string, userId: string) {
  const paths = await listFiles(db, bucket, userId);
  for (let i = 0; i < paths.length; i += 100) await db.storage.from(bucket).remove(paths.slice(i, i + 100));
}

/** Removes everything a person stored as files. */
export async function removeAllUserFiles(db: SupabaseClient, userId: string) {
  for (const b of USER_BUCKETS) await removeFiles(db, b, userId);
}
