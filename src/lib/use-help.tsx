"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { HELP_TOPIC_COLS } from "@/lib/columns";
import type { HelpTopic } from "@/lib/help";

type HelpState = { topics: HelpTopic[]; loading: boolean; error: string | null; reload: () => Promise<void> };
const Ctx = createContext<HelpState>({ topics: [], loading: true, error: null, reload: async () => {} });
export const useHelp = () => useContext(Ctx);

/** Reads the help topics once for the Help pages. Row level security already hides drafts from people who can not manage help. */
export function HelpProvider({ children }: { children: React.ReactNode }) {
  const [topics, setTopics] = useState<HelpTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.from("help_topics").select(HELP_TOPIC_COLS).order("sort_order").order("title").limit(500);
    if (error) {
      setError(/relation|does not exist|schema cache/i.test(error.message) ? "missing" : "Could not load the help topics. Check your connection and try again.");
    } else {
      setError(null);
      setTopics((data as HelpTopic[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void reload(); }, [reload]);
  return <Ctx.Provider value={{ topics, loading, error, reload }}>{children}</Ctx.Provider>;
}
