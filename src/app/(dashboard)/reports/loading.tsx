import { PageSkeleton, SkeletonChart, SkeletonHeader, SkeletonStats } from "@/components/ui/skeleton";

/** Shown at once while this page's data loads; the menu stays in place. */
export default function Loading() {
  return (
    <PageSkeleton>
      <SkeletonHeader />
      <SkeletonStats count={4} />
      <SkeletonChart />
      <SkeletonChart height="h-44" />
    </PageSkeleton>
  );
}
