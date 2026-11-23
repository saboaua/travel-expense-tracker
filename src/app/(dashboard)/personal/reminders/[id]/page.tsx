import { PageShell } from "@/components/layout/PageShell";
import { BackLink } from "@/components/ui/page-header";
import { ReminderDetail } from "@/components/reminders/ReminderDetail";

export default async function ReminderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <PageShell size="wide" className="pb-28 md:pb-8">
      <BackLink href="/personal/reminders">Reminders</BackLink>
      <ReminderDetail id={id} />
    </PageShell>
  );
}
