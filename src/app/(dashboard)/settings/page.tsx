import { redirect } from "next/navigation";

export const metadata = { title: "Settings" };

/** Settings and Profile held the same details, so there is one page now: Profile. Old links and bookmarks land there. */
export default function SettingsPage() {
  redirect("/profile#telegram");
}
