import { PageShell } from "@/components/layout/PageShell";
import { BackLink, PageHeader } from "@/components/ui/page-header";
import { IconTile } from "@/components/ui/icon-tile";
import { Bell } from "lucide-react";
import { RemindersList } from "@/components/reminders/RemindersList";

export const metadata = { title: "Reminders" };

export default function RemindersPage() {
  return (
    <PageShell size="wide" className="pb-28 md:pb-8">
      <BackLink href="/personal">Personal</BackLink>
      <PageHeader icon={<IconTile tone="notifications" className="h-11 w-11"><Bell className="h-[22px] w-[22px]" /></IconTile>} title="Reminders" description="Things to remember, with an alert at the right time." />
      <RemindersList />
    </PageShell>
  );
}
