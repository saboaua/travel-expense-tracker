"use client";

import { useEffect, useState } from "react";
import type { CountryCount } from "@/lib/personal/community-stores";

/** What the community has shared, per country (admin only). null while loading or when it cannot be read. Change `version` to read it again. */
export function useCommunityCounts(enabled = true, version = 0): CountryCount[] | null {
  const [data, setData] = useState<CountryCount[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let off = false;
    fetch("/api/admin/community-products").then((r) => r.json()).then((d) => { if (!off && Array.isArray(d.countries)) setData(d.countries as CountryCount[]); }).catch(() => {});
    return () => { off = true; };
  }, [enabled, version]);
  return data;
}
