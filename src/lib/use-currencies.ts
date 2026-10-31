"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CURRENCIES, type CurrencyOption } from "@/lib/currencies";

export function useCurrencies() {
  const [currencies, setCurrencies] = useState<CurrencyOption[]>(CURRENCIES);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("currencies")
      .select("code, name, usd_rate")
      .eq("enabled", true)
      .order("sort_order")
      .then(({ data }) => {
        if (data && data.length > 0) setCurrencies(data);
      });
  }, []);

  return currencies;
}
