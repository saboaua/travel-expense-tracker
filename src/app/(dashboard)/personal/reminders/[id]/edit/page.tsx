import { PageShell } from "@/components/layout/PageShell";
import { BackLink, PageHeader } from "@/components/ui/page-header";
import { ReminderForm } from "@/components/reminders/ReminderForm";

export default async function EditReminderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <PageShell size="wide" className="pb-28 md:pb-8">
      <BackLink href={`/personal/reminders/${id}`}>Reminder</BackLink>
      <PageHeader title="Edit reminder" />
      <ReminderForm id={id} />
    </PageShell>
  );
}
