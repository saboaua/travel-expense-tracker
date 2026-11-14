"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { readBadge, tierOf } from "@/lib/personal/badges";
import { BadgeShield } from "@/components/profile/BadgeShield";

/** Small badge beside the name in Profile. Shows nothing until a badge is earned (or when the migration has not been run). */
export function BadgeChip() {
  const [best, setBest] = useState(0);
  useEffect(() => {
    (async () => {
      const r = await createClient().rpc("my_badge");
      if (!r.error) setBest(readBadge(r.data).best);
    })().catch(() => {});
  }, []);
  const t = tierOf(best);
  if (!t) return null;
  return (
    <Link href="/profile/badges" data-testid="badge-chip" className="mt-1 inline-flex items-center gap-1.5 rounded-xl py-0.5 pl-1 pr-2.5 text-xs font-extrabold" style={{ background: t.tint, color: t.dark }}>
      <BadgeShield level={t.level} size={20} />{t.name}
    </Link>
  );
}
