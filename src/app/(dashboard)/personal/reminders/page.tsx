import { PageShell } from "@/components/layout/PageShell";
import { BackLink, PageHeader } from "@/components/ui/page-header";
import { RemindersList } from "@/components/reminders/RemindersList";

export const metadata = { title: "Reminders" };

export default function RemindersPage() {
  return (
    <PageShell size="wide" className="pb-28 md:pb-8">
      <BackLink href="/personal">Personal</BackLink>
      <PageHeader title="Reminders" description="Things to remember, with an alert at the right time." />
      <RemindersList />
    </PageShell>
  );
}
