import { redirect } from "next/navigation";

/** The old address keeps working. */
export default function Old() {
  redirect("/admin/pro/trial");
}
