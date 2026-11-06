"use client";

import { useState } from "react";
import { photoProxyUrl } from "@/lib/destination";

/**
 * The destination photo. It is loaded through our own route first; if that fails the original address is tried,
 * and if that fails too the photo disappears and the gradient behind it shows (no broken image).
 */
export function DestinationPhoto({ src }: { src: string }) {
  const [attempt, setAttempt] = useState<0 | 1 | 2>(0);
  if (attempt === 2) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={attempt}
      src={attempt === 0 ? photoProxyUrl(src) : src}
      alt=""
      className="absolute inset-0 h-full w-full object-cover"
      referrerPolicy="no-referrer"
      onError={() => setAttempt((a) => (a === 0 ? 1 : 2))}
    />
  );
}
