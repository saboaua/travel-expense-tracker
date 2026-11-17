"use client";

import { useParams } from "next/navigation";
import { BackLink, PageHeader } from "@/components/ui/page-header";
import { ProjectForm } from "@/components/projects/ProjectForm";

export default function EditProjectPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="mx-auto max-w-xl space-y-5 p-4 pb-28 md:p-8">
      <BackLink href={`/projects/${id}`}>Project</BackLink>
      <PageHeader title="Edit project" />
      <ProjectForm id={id} />
    </div>
  );
}
