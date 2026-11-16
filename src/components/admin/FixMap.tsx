"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ARUBA, inAruba } from "@/lib/personal/places-fix";

type Pt = { lat: number; lng: number };

const PIN = '<svg width="34" height="34" viewBox="0 0 24 24" fill="#dc2626" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.6" fill="#fff" stroke="none"/></svg>';

/** OpenStreetMap map for fixing a shop's point: tap the map or drag the pin. The grey dot is where the point was saved. */
export default function FixMap({ saved, point, onPick }: { saved: Pt; point: Pt | null; onPick: (p: Pt) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const pin = useRef<L.Marker | null>(null);
  const pick = useRef(onPick);
  pick.current = onPick;

  useEffect(() => {
    if (!el.current || map.current) return;
    const start = point && inAruba(point.lat, point.lng) ? point : { lat: (ARUBA.south + ARUBA.north) / 2, lng: (ARUBA.west + ARUBA.east) / 2 };
    const m = L.map(el.current, { zoomControl: true, scrollWheelZoom: false }).setView([start.lat, start.lng], point && inAruba(point.lat, point.lng) ? 16 : 11);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors' }).addTo(m);
    L.circleMarker([saved.lat, saved.lng], { radius: 7, color: "#fff", weight: 3, fillColor: "#94a3b8", fillOpacity: 1 }).bindTooltip("Saved point", { permanent: true, direction: "right", offset: [8, 0] }).addTo(m);
    const mk = L.marker([point?.lat ?? start.lat, point?.lng ?? start.lng], { draggable: true, icon: L.divIcon({ className: "", html: PIN, iconSize: [34, 34], iconAnchor: [17, 32] }), alt: "Shop location pin", keyboard: true }).addTo(m);
    mk.on("dragend", () => { const p = mk.getLatLng(); pick.current({ lat: p.lat, lng: p.lng }); });
    m.on("click", (e: L.LeafletMouseEvent) => { mk.setLatLng(e.latlng); pick.current({ lat: e.latlng.lat, lng: e.latlng.lng }); });
    map.current = m; pin.current = mk;
    return () => { m.remove(); map.current = null; pin.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- created once; the effect below follows the typed numbers
  }, []);

  useEffect(() => {
    const m = map.current, mk = pin.current;
    if (!m || !mk || !point) return;
    const cur = mk.getLatLng();
    if (Math.abs(cur.lat - point.lat) < 1e-7 && Math.abs(cur.lng - point.lng) < 1e-7) return;
    mk.setLatLng([point.lat, point.lng]);
    if (inAruba(point.lat, point.lng)) m.setView([point.lat, point.lng], Math.max(m.getZoom(), 15));
  }, [point]);

  return <div ref={el} className="h-64 w-full overflow-hidden rounded-xl border" data-testid="fix-map" role="region" aria-label="Map: tap or drag the pin to the shop" />;
}
