"use client";

import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
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
      <PageHeader title="Receipt Categories" description={<>Edit, reorder or create the categories offered on each kind of receipt.</>} />

      <Tabs label="Category groups" value={tab} onChange={(id) => setTab(id as typeof tab)} options={TABS.map((t) => ({ id: t.id, label: t.label }))} />

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
