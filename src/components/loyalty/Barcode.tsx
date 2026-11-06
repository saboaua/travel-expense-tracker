"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import { cleanNumber, type BarcodeFormat } from "@/lib/loyalty";

/** A crisp black-on-white barcode (JsBarcode for 1D codes, qrcode for QR) drawn as scalable SVG. */
export function Barcode({ value, format, className, label }: { value: string; format: BarcodeFormat; className?: string; label?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [failed, setFailed] = useState(false);
  const text = cleanNumber(value, format);

  const qr = useMemo(() => {
    if (format !== "QR" || !text) return null;
    try {
      const { size, data } = QRCode.create(text, { errorCorrectionLevel: "M" }).modules;
      let d = "";
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (data[y * size + x]) d += `M${x} ${y}h1v1h-1z`;
      return { size, d };
    } catch {
      return null;
    }
  }, [format, text]);

  useEffect(() => {
    if (format === "QR") return setFailed(!qr);
    const svg = ref.current;
    if (!svg || !text) return setFailed(true);
    try {
      JsBarcode(svg, text, { format: format === "UPCA" ? "UPC" : format, displayValue: false, margin: 0, width: 2, height: 100, background: "#ffffff", lineColor: "#000000" });
      // scale with the box instead of the fixed pixel size JsBarcode sets
      const w = svg.getAttribute("width"), h = svg.getAttribute("height");
      if (w && h) svg.setAttribute("viewBox", `0 0 ${parseFloat(w)} ${parseFloat(h)}`);
      svg.removeAttribute("width");
      svg.removeAttribute("height");
      svg.removeAttribute("style");
      svg.setAttribute("preserveAspectRatio", "none");
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [format, text, qr]);

  if (failed) return <p className="py-6 text-center text-sm text-muted-foreground">This number cannot be drawn as a {format} barcode. Edit the card and pick another format.</p>;
  if (format === "QR" && qr) {
    return (
      <svg viewBox={`0 0 ${qr.size} ${qr.size}`} shapeRendering="crispEdges" role="img" aria-label={label || "QR code"} className={className}>
        <rect width={qr.size} height={qr.size} fill="#ffffff" />
        <path d={qr.d} fill="#000000" />
      </svg>
    );
  }
  return <svg ref={ref} role="img" aria-label={label || "Barcode"} shapeRendering="crispEdges" className={className} />;
}
