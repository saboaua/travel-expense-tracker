/** The app's name as a safe start for a file name: "My App" -> "my-app". Falls back to "app". */
export const fileSlug = (name: string | null | undefined): string => (name ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "app";
