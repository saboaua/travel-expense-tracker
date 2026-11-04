"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  FALLBACK_EXPENSE_CATEGORIES,
  FALLBACK_TRAVEL_CATEGORIES,
  FALLBACK_GROCERY_CATEGORIES,
  type CategoryOption,
} from "@/lib/category-icons";

function useCategoryTable(table: "categories" | "travel_categories" | "grocery_categories", fallback: CategoryOption[]) {
  const [items, setItems] = useState<CategoryOption[]>(fallback);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from(table)
      .select("name, icon")
      .eq("enabled", true)
      .order("sort_order")
      .then(({ data, error }) => {
        // If the table/column is missing (migration not run yet) keep the fallback list.
        if (!error && data && data.length > 0) setItems(data as CategoryOption[]);
      });
  }, [table]);

  return items;
}

/** Expense (receipt) categories managed in Admin > Categories */
export function useExpenseCategories() {
  return useCategoryTable("categories", FALLBACK_EXPENSE_CATEGORIES);
}

/** Trip travel categories managed in Admin > Travel Categories */
export function useTravelCategories() {
  return useCategoryTable("travel_categories", FALLBACK_TRAVEL_CATEGORIES);
}

/** Grocery item categories managed in Admin > Receipt Categories > Grocery */
export function useGroceryCategories() {
  return useCategoryTable("grocery_categories", FALLBACK_GROCERY_CATEGORIES);
}
