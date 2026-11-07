import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { verifiedUser, type SessionUser } from "@/lib/supabase/verified-user";

/** The signed-in person for this request. Asked once per request however many parts of the page need it. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => verifiedUser(await createClient()));
