import { redirect } from "next/navigation";

export const metadata = { title: "Pro limits" };

/** The old address keeps working. */
export default function Old() {
  redirect("/admin/pro/limits");
}
