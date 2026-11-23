import { redirect } from "next/navigation";

export const metadata = { title: "Trip categories" };

/** Trip types now live under Admin > Categories > Travel. Old links and bookmarks land there. */
export default function AdminTravelCategoriesPage() {
  redirect("/admin/categories#travel");
}
