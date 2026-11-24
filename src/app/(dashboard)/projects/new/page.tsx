import { BackLink, PageHeader } from "@/components/ui/page-header";
import { ProjectForm } from "@/components/projects/ProjectForm";
import { PAGE_WIDTH } from "@/components/layout/PageShell";

export const metadata = { title: "New project" };

export default function NewProjectPage() {
  return (
    <div className={`${PAGE_WIDTH.formColumn} space-y-5 p-4 pb-28 md:p-8`}>
      <BackLink href="/projects">Projects</BackLink>
      <PageHeader title="New project" description="A client, a budget if you have one, and the receipts you spend on it" />
      <ProjectForm />
    </div>
  );
}
