"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapPin = { lat: number; lng: number; name: string; /** rank among stores with your prices, or null for a store with no receipts yet */ n: number | null; best?: boolean; label?: string };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** A real map from OpenStreetMap (free, © OpenStreetMap contributors). Stores with your receipts are numbered; others are small grey dots. */
export default function StoreMap({ me, km, pins }: { me: { lat: number; lng: number }; km: number; pins: MapPin[] }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: false, attributionControl: true, scrollWheelZoom: false }).setView([me.lat, me.lng], 13);
    L.control.zoom({ position: "topright" }).addTo(m);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors' }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => { m.remove(); map.current = null; layer.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- created once; the effect below keeps it current
  }, []);

  useEffect(() => {
    const m = map.current, g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const circle = L.circle([me.lat, me.lng], { radius: km * 1000, color: "#1d4ed8", weight: 1.5, dashArray: "5 4", fillOpacity: 0.05 }).addTo(g);
    // You: a small blue dot with a soft pulse, the way phone maps show your position
    const me_html = '<div style="position:relative;width:44px;height:44px"><span class="store-map-pulse" style="position:absolute;inset:0;border-radius:22px;background:rgba(37,99,235,.28)"></span><span style="position:absolute;left:13px;top:13px;width:18px;height:18px;border-radius:9px;background:#2563eb;border:3px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.45)"></span></div>';
    L.marker([me.lat, me.lng], { icon: L.divIcon({ className: "", html: me_html, iconSize: [44, 44], iconAnchor: [22, 22] }), title: "You", alt: "You are here", zIndexOffset: 5000 }).addTo(g);
    for (const p of [...pins].sort((a, b) => (b.n ?? 999) - (a.n ?? 999))) {
      const html = p.n != null
        ? `<div style="width:26px;height:26px;border-radius:13px;background:${p.best ? "#059669" : "#1d4ed8"};color:#fff;font:700 13px system-ui;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">${p.n}</div>`
        : '<div style="width:10px;height:10px;border-radius:5px;background:#94a3b8;border:2px solid #fff;box-shadow:0 0 0 1px #64748b"></div>';
      const size = p.n != null ? 26 : 10;
      L.marker([p.lat, p.lng], { icon: L.divIcon({ className: "", html, iconSize: [size, size], iconAnchor: [size / 2, size / 2] }), title: p.name, zIndexOffset: p.n != null ? 1000 - p.n : 0 })
        .bindPopup(`<b>${esc(p.name)}</b>${p.label ? `<br>${esc(p.label)}` : ""}`)
        .addTo(g);
    }
    m.fitBounds(circle.getBounds(), { padding: [8, 8] });
  }, [me.lat, me.lng, km, pins]);

  return (
    <div className="relative">
      <style>{`@keyframes store-map-pulse{0%{transform:scale(.45);opacity:.9}100%{transform:scale(1);opacity:0}}.store-map-pulse{animation:store-map-pulse 2s ease-out infinite}@media (prefers-reduced-motion:reduce){.store-map-pulse{animation:none;opacity:.5}}`}</style>
      <div ref={el} className="h-80 w-full overflow-hidden rounded-xl border sm:h-96 md:h-[30rem]" data-testid="mini-map" role="region" aria-label={`Best store map: stores within ${km} km of you`} />
      <span className="pointer-events-none absolute left-2.5 top-2.5 z-[500] rounded-full border bg-white px-3 py-1 text-sm font-extrabold text-slate-900 shadow">Best store</span>
    </div>
  );
}
