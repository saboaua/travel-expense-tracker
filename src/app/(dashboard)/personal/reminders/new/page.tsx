import { PageShell } from "@/components/layout/PageShell";
import { BackLink, PageHeader } from "@/components/ui/page-header";
import { ReminderForm } from "@/components/reminders/ReminderForm";

export default function NewReminderPage() {
  return (
    <PageShell size="wide" className="pb-28 md:pb-8">
      <BackLink href="/personal/reminders">Reminders</BackLink>
      <PageHeader title="New reminder" />
      <ReminderForm />
    </PageShell>
  );
}
