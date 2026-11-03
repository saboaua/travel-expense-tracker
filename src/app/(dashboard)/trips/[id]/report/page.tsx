import { redirect } from "next/navigation";

// The per-trip report moved into the trip page (summary, category breakdown, Excel and ZIP exports).
export default async function TripReportRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/trips/${id}`);
}
