"use client";

import { useState } from "react";

/** The destination photo. If the picture cannot be loaded it disappears and the gradient behind it shows, instead of a broken image with its text. */
export function DestinationPhoto({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
  );
}
