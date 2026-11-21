import { MAX_LOGO_CHARS, fitSquare } from "@/lib/logo-match";

/** A picked picture as a small square logo (96 px, PNG, transparent background kept) ready to store in a row. */
export async function logoFromFile(file: File, size = 96): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose a picture (PNG or JPG).");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const canvas = document.createElement("canvas");
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This picture could not be processed.");
    const [w, h, x, y] = fitSquare(bitmap.width, bitmap.height, size);
    ctx.drawImage(bitmap, x, y, w, h);
    let out = canvas.toDataURL("image/png");
    if (out.length > MAX_LOGO_CHARS) out = canvas.toDataURL("image/jpeg", 0.85);
    if (out.length > MAX_LOGO_CHARS) throw new Error("This picture is too detailed for a logo. Try a simpler one.");
    return out;
  } finally {
    bitmap.close();
  }
}

/** Asks the server for a website's logo. Resolves to the logo, or null when there is none. */
export async function findLogo(site: string): Promise<{ logo: string | null; error?: string }> {
  try {
    const res = await fetch(`/api/logo-lookup?site=${encodeURIComponent(site)}`);
    if (res.status === 404) return { logo: null };
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { logo: null, error: body.error || "Could not look it up right now." };
    return { logo: typeof body.logo === "string" ? body.logo : null };
  } catch {
    return { logo: null, error: "Could not look it up. Check your connection." };
  }
}
