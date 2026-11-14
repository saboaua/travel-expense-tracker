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
    const m = L.map(el.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false }).setView([me.lat, me.lng], 13);
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
    // You are a person, never a number: a blue badge with a person on it, above every store pin
    const person = '<div style="width:34px;height:34px;border-radius:17px;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 2px #2563eb,0 2px 6px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center"><svg width="20" height="20" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><circle cx="12" cy="7.5" r="4.2"/><path d="M3.5 21c0-4.7 3.8-8 8.5-8s8.5 3.3 8.5 8z"/></svg></div><div style="position:absolute;left:50%;top:38px;transform:translateX(-50%);background:#fff;border:1px solid #cbd5e1;border-radius:8px;padding:0 6px;font:700 11px system-ui;color:#1d4ed8;white-space:nowrap">You</div>';
    L.marker([me.lat, me.lng], { icon: L.divIcon({ className: "", html: person, iconSize: [34, 34], iconAnchor: [17, 17] }), title: "You", zIndexOffset: 5000 }).addTo(g);
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
      <div ref={el} className="h-64 w-full overflow-hidden rounded-xl border" data-testid="mini-map" role="region" aria-label={`Best store map: stores within ${km} km of you`} />
      <span className="pointer-events-none absolute left-2.5 top-2.5 z-[500] rounded-full border bg-white px-3 py-1 text-sm font-extrabold text-slate-900 shadow">Best store</span>
    </div>
  );
}
