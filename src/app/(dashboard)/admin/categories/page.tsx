"use client";

import { Tag } from "lucide-react";
import { CategoryManager } from "@/components/admin/category-manager";

export default function AdminCategoriesPage() {
  return (
    <CategoryManager
      table="categories"
      title="Receipt Categories"
      subtitle="Expense categories shown as buttons when adding a receipt. Disabled ones are hidden from new expenses."
      addHint="New categories appear immediately in the receipt forms."
      deleteWarning="Delete this category? Existing expenses will keep the old name."
      headerIcon={Tag}
      defaultIcon="tag"
    />
  );
}
