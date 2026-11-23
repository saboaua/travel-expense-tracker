"use client";

import { BackLink, PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { useAccess } from "@/lib/use-access";
import { LogoLibraryManager } from "@/components/admin/LogoLibraryManager";
import { PAGE_WIDTH } from "@/components/layout/PageShell";

export default function AdminLogosPage() {
  const { role, loaded } = useAccess();
  return (
    <div className={`${PAGE_WIDTH.wide} p-4 md:p-8 pb-24 space-y-6`}>
      <BackLink href="/admin/settings">Global Settings</BackLink>
      <PageHeader title="Logo library" description={<>Company logos people can pick when they add a subscription.</>} />
      {loaded && role !== "admin" ? <Alert variant="error">Only an admin can change the logo library.</Alert> : <LogoLibraryManager />}
    </div>
  );
}
