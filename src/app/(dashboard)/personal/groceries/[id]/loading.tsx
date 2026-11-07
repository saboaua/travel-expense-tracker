import { PageSkeleton, SkeletonChart, SkeletonHeader, SkeletonList, SkeletonStats } from "@/components/ui/skeleton";

/** Shown at once while this page's data loads; the menu stays in place. */
export default function Loading() {
  return (
    <PageSkeleton>
      <SkeletonHeader />
      <SkeletonStats count={3} />
      <SkeletonChart />
      <SkeletonList rows={4} />
    </PageSkeleton>
  );
}
