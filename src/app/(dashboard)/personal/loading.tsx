import { PageSkeleton, SkeletonHeader, SkeletonList, SkeletonStats, SkeletonTabs } from "@/components/ui/skeleton";

/** Shown at once while this page's data loads; the menu stays in place. */
export default function Loading() {
  return (
    <PageSkeleton>
      <SkeletonTabs />
      <SkeletonHeader action={false} />
      <SkeletonStats count={2} />
      <SkeletonList rows={4} />
    </PageSkeleton>
  );
}
