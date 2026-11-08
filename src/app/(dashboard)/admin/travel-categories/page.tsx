import { redirect } from "next/navigation";

/** Trip types now live under Admin > Categories > Travel. Old links and bookmarks land there. */
export default function AdminTravelCategoriesPage() {
  redirect("/admin/categories#travel");
}
