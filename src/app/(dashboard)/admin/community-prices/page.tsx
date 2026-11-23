import { redirect } from "next/navigation";

export const metadata = { title: "Community prices" };

/** The old address keeps working. */
export default function Old() {
  redirect("/admin/supermarkets/community");
}
