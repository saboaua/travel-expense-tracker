import { redirect } from "next/navigation";

export const metadata = { title: "Payment settings" };

/** The old address keeps working. */
export default function Old() {
  redirect("/admin/pro/payments");
}
