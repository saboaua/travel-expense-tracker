"use client";

import { useState } from "react";
import { Briefcase, Home, ShoppingBasket } from "lucide-react";
import { BackLink, PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { AccordionGroup, AccordionSection } from "@/components/ui/accordion";
import { CategoryManager } from "@/components/admin/category-manager";

const TRAVEL_TABS = [
  { id: "receipts", label: "Receipts" },
  { id: "trips", label: "Trip types" },
] as const;

/** All category lists in one place: Travel (receipt categories and trip types) and Groceries. One section open at a time. */
export default function AdminCategoriesPage() {
  const [tab, setTab] = useState<(typeof TRAVEL_TABS)[number]["id"]>("receipts");
  const [counts, setCounts] = useState<{ receipts?: number; trips?: number; grocery?: number; house?: number }>({});

  const n = (v: number | undefined, one: string, many: string) => (v === undefined ? null : `${v} ${v === 1 ? one : many}`);
  const travelSummary = [n(counts.receipts, "receipt category", "receipt categories"), n(counts.trips, "trip type", "trip types")].filter(Boolean).join(" · ") || "Receipt categories and trip types";

  return (
    <div className="p-4 md:p-8 pb-24 max-w-3xl mx-auto space-y-6">
      <BackLink href="/admin/settings">Global Settings</BackLink>
      <PageHeader title="Categories" description={<>Edit, reorder or create the categories offered on receipts, trips and the house.</>} />

      <AccordionGroup defaultOpen="travel">
        <AccordionSection id="travel" title="Travel" icon={<Briefcase />} summary={travelSummary}>
          <Tabs
            semantics="group"
            label="Travel lists"
            value={tab}
            onChange={(id) => setTab(id as typeof tab)}
            options={TRAVEL_TABS.map((t) => ({ id: t.id, label: t.label }))}
            fullWidth
          />
          {/* both lists stay mounted (one hidden), so a name being typed is not lost when switching */}
          <div hidden={tab !== "receipts"}>
            <CategoryManager
              table="categories"
              noun="category"
              subtitle="Shown as buttons when adding a travel receipt. Disabled ones are hidden from new expenses."
              addTitle="Add a category"
              addPlaceholder="e.g. Parking"
              deleteWarning="Delete this category? Existing expenses will keep the old name."
              defaultIcon="tag"
              onCount={(v) => setCounts((c) => ({ ...c, receipts: v }))}
            />
          </div>
          <div hidden={tab !== "trips"}>
            <CategoryManager
              table="travel_categories"
              noun="trip type"
              subtitle="Shown as buttons when creating or editing a trip. Disabled ones are hidden from new trips."
              addTitle="Add a trip type"
              addPlaceholder="e.g. Training"
              deleteWarning="Delete this trip type? Existing trips will keep the old name."
              defaultIcon="briefcase"
              onCount={(v) => setCounts((c) => ({ ...c, trips: v }))}
            />
          </div>
        </AccordionSection>

        <AccordionSection id="groceries" title="Groceries" icon={<ShoppingBasket />} summary={n(counts.grocery, "item category", "item categories") ?? "Item categories"}>
          <CategoryManager
            table="grocery_categories"
            noun="item category"
            subtitle="Categories for grocery receipt items. They drive the monthly category summary and the AI scan."
            addTitle="Add an item category"
            addPlaceholder="e.g. Snacks"
            deleteWarning="Delete this category? Existing grocery items will keep the old name."
            defaultIcon="shopping-basket"
            onCount={(v) => setCounts((c) => ({ ...c, grocery: v }))}
          />
        </AccordionSection>

        <AccordionSection id="house" title="House areas" icon={<Home />} summary={n(counts.house, "area", "areas") ?? "Areas of the house"}>
          <CategoryManager
            table="house_areas"
            noun="house area"
            subtitle="Shown in the Quick spend dropdown when the category is House, next to the home projects. Disabled ones are hidden from new spends."
            addTitle="Add a house area"
            addPlaceholder="e.g. Garage"
            deleteWarning="Delete this area? Spends you already saved keep the name."
            defaultIcon="home"
            onCount={(v) => setCounts((c) => ({ ...c, house: v }))}
          />
        </AccordionSection>
      </AccordionGroup>
    </div>
  );
}
