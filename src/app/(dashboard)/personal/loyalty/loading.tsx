import { PageSkeleton, SkeletonCards, SkeletonHeader } from "@/components/ui/skeleton";

/** Shown at once while this page's data loads; the menu stays in place. */
export default function Loading() {
  return (
    <PageSkeleton>
      <SkeletonHeader />
      <SkeletonCards count={4} />
    </PageSkeleton>
  );
}
