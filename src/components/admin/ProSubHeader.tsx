import { BackLink, PageHeader } from "@/components/ui/page-header";

export type ProPart = "people" | "payments" | "limits" | "trial" | "accounting";

/** The top of every Pro plan sub page: back to the Pro plan menu, and the page title. The menu lists every part, so the pages carry no second menu. */
export function ProSubHeader({ title, description }: { active?: ProPart; title: string; description: string }) {
  return (
    <>
      <BackLink href="/admin/pro">Pro plan</BackLink>
      <PageHeader title={title} description={description} />
    </>
  );
}
