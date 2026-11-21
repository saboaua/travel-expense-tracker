import { NextResponse } from "next/server";

/**
 * Android's share sheet posts a photo or PDF here. The service worker (public/sw.js) normally answers first and keeps the file for the
 * dashboard to pick up. This runs only when the service worker is not in charge yet (first visit after installing): the file is not read
 * or kept, and the person lands on the dashboard with a note to share it again.
 */
export function POST(request: Request) {
  return NextResponse.redirect(new URL("/?shared=none", request.url), 303);
}

export function GET(request: Request) {
  return NextResponse.redirect(new URL("/", request.url), 303);
}
