"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type BusinessBranding = { company: string | null; path: string | null; url: string | null; loading: boolean };

/** The company name and logo from your profile, with a short-lived link to show the logo. The logo column comes from migration_report_logo.sql; without it there is no logo. */
export function useBusinessLogo(): BusinessBranding & { reload: () => void } {
  const [state, setState] = useState<BusinessBranding>({ company: null, path: null, url: null, loading: true });
  const [n, setN] = useState(0);
  const reload = useCallback(() => setN((x) => x + 1), []);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        const uid = session?.user.id;
        if (!uid) return live && setState({ company: null, path: null, url: null, loading: false });
        let res = await supabase.from("profiles").select("company_name, business_logo_path").eq("id", uid).single();
        if (res.error) res = (await supabase.from("profiles").select("company_name").eq("id", uid).single()) as typeof res;
        const company = (res.data?.company_name as string | null) ?? null;
        const path = (res.data as { business_logo_path?: string | null } | null)?.business_logo_path ?? null;
        let url: string | null = null;
        if (path && path.startsWith(`${uid}/`)) { const s = await supabase.storage.from("receipts").createSignedUrl(path, 3600); url = s.data?.signedUrl ?? null; }
        if (live) setState({ company, path, url, loading: false });
      } catch { if (live) setState({ company: null, path: null, url: null, loading: false }); }
    })();
    return () => { live = false; };
  }, [n]);
  return { ...state, reload };
}
