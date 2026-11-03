import { TripForm } from "@/components/trips/TripForm";

export default async function EditTripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TripForm tripId={id} />;
}
