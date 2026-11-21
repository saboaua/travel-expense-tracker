import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cleanDomain, isLogoData } from "@/lib/logo-match";

export const dynamic = "force-dynamic";

/**
 * Finds a website's logo for the signed-in person: ?site=spotify.com answers { logo: "data:image/png;base64,..." } or 404.
 * The phone never contacts the icon service: this server does, and only the website address is sent (nothing about the subscription).
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const domain = cleanDomain(new URL(request.url).searchParams.get("site") ?? "");
  if (!domain) return NextResponse.json({ error: "That does not look like a website address." }, { status: 400 });

  try {
    // fallback_opts=TYPE,SIZE,URL makes the service answer 404 when it has no real icon, instead of a grey globe
    const res = await fetch(`https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(`https://${domain}`)}&size=128`, {
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    const type = (res.headers.get("content-type") || "").split(";")[0];
    if (!res.ok || !/^image\/(png|jpeg|webp|gif)$/.test(type)) return NextResponse.json({ error: "No logo found." }, { status: 404 });
    const bytes = Buffer.from(await res.arrayBuffer());
    const logo = `data:${type};base64,${bytes.toString("base64")}`;
    if (bytes.length < 100 || !isLogoData(logo)) return NextResponse.json({ error: "No logo found." }, { status: 404 });
    return NextResponse.json({ logo, domain }, { headers: { "Cache-Control": "private, max-age=86400" } });
  } catch {
    return NextResponse.json({ error: "Could not look it up right now." }, { status: 502 });
  }
}
