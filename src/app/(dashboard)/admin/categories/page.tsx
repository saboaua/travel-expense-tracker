"use client";

import { useState } from "react";
import { ShoppingBasket, Tag } from "lucide-react";
import { CategoryManager } from "@/components/admin/category-manager";

const TABS = [
  { id: "travel", label: "Travel receipts" },
  { id: "grocery", label: "Groceries" },
] as const;

export default function AdminCategoriesPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("travel");

  return (
    <div className="p-4 md:p-8 pb-24 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
          <Tag className="h-7 w-7" />
          Receipt Categories
        </h1>
        <p className="text-muted-foreground mt-1">Edit, reorder or create the categories offered on each kind of receipt.</p>
      </div>

      <div role="tablist" className="inline-flex rounded-xl border bg-muted p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${tab === t.id ? "bg-background shadow-sm" : "text-muted-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "travel" ? (
        <CategoryManager
          key="travel"
          embedded
          table="categories"
          title="Travel receipts"
          subtitle="Categories shown as buttons when adding a travel receipt. Disabled ones are hidden from new expenses."
          addHint="New categories appear immediately in the receipt forms."
          deleteWarning="Delete this category? Existing expenses will keep the old name."
          headerIcon={Tag}
          defaultIcon="tag"
        />
      ) : (
        <CategoryManager
          key="grocery"
          embedded
          table="grocery_categories"
          title="Groceries"
          subtitle="Categories for grocery receipt items. They drive the monthly category summary and the AI scan."
          addHint="New categories appear immediately in the grocery receipt form."
          deleteWarning="Delete this category? Existing grocery items will keep the old name."
          headerIcon={ShoppingBasket}
          defaultIcon="shopping-basket"
        />
      )}
    </div>
  );
}
