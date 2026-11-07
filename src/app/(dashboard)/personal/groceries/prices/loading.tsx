import { PageSkeleton, SkeletonHeader, SkeletonList } from "@/components/ui/skeleton";

/** Shown at once while this page's data loads; the menu stays in place. */
export default function Loading() {
  return (
    <PageSkeleton>
      <SkeletonHeader />
      <SkeletonList rows={6} />
    </PageSkeleton>
  );
}
