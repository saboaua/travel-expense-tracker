import { redirect } from "next/navigation";

export const metadata = { title: "Do it" };

/** The old address keeps working. */
export default function Old() {
  redirect("/admin/supermarkets/doit");
}
