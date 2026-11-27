import { redirect } from "next/navigation";

/** The email pages are one Email inbox now; old links and bookmarks still land there. */
export default function Page() {
  redirect("/personal/email");
}
