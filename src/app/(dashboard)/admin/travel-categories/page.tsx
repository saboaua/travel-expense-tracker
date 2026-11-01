"use client";

import { Briefcase } from "lucide-react";
import { CategoryManager } from "@/components/admin/category-manager";

export default function AdminTravelCategoriesPage() {
  return (
    <CategoryManager
      table="travel_categories"
      title="Travel Categories"
      subtitle="Trip types shown as buttons when creating or editing a trip. Disabled ones are hidden from new trips."
      addHint="New travel categories appear immediately in the trip forms."
      deleteWarning="Delete this travel category? Existing trips will keep the old name."
      headerIcon={Briefcase}
      defaultIcon="briefcase"
    />
  );
}
