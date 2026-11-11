/** A trip's hotel: just a name and an address, plus a link that opens turn-by-turn directions. */

export type Hotel = { name: string; address: string | null };

/** The hotel on a trip row, or null when none was entered. */
export function hotelOf(row: { hotel_name?: string | null; hotel_address?: string | null } | null | undefined): Hotel | null {
  const name = row?.hotel_name?.trim();
  const address = row?.hotel_address?.trim();
  if (!name && !address) return null;
  return { name: name || (address as string), address: name ? address || null : null };
}

/** Opens the maps app (or the website) with the hotel as destination. The name helps the search when the address alone is vague. */
export function directionsUrl(hotel: Hotel): string {
  const where = [hotel.name, hotel.address].filter(Boolean).join(", ");
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(where)}`;
}
