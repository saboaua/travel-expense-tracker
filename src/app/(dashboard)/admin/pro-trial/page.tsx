import { redirect } from "next/navigation";

export const metadata = { title: "Pro trial" };

/** The old address keeps working. */
export default function Old() {
  redirect("/admin/pro/trial");
}
