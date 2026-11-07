import { PageSkeleton, Skeleton, SkeletonChart, SkeletonList, SkeletonStats } from "@/components/ui/skeleton";

/** Shown at once while this page's data loads; the menu stays in place. */
export default function Loading() {
  return (
    <PageSkeleton>
      <Skeleton className="h-28 w-full rounded-2xl" />
      <SkeletonStats count={3} />
      <SkeletonChart />
      <SkeletonList rows={3} />
    </PageSkeleton>
  );
}
