import { PageSkeleton, SkeletonForm, SkeletonHeader } from "@/components/ui/skeleton";

/** Shown at once while this page's data loads; the menu stays in place. */
export default function Loading() {
  return (
    <PageSkeleton narrow>
      <SkeletonHeader action={false} />
      <SkeletonForm fields={4} />
    </PageSkeleton>
  );
}
