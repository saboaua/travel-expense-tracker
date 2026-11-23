import { redirect } from "next/navigation";

export const metadata = { title: "Plans" };

/** The old address keeps working. */
export default function Old() {
  redirect("/admin/pro/people");
}
