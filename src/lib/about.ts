/** What the About page shows about the running release. */
export type AboutInfo = { version: string; build: string; updated: string | null };

/** The release code is the first 7 characters of the commit; a local run has no commit, so it says "Development". */
export function aboutInfo(version: string | undefined, buildId: string | undefined, builtAt: string | undefined): AboutInfo {
  const id = (buildId ?? "").trim();
  const build = !id || id === "local" || id === "unknown" ? "Development" : /^[0-9a-f]{40}$/i.test(id) ? id.slice(0, 7) : id.slice(0, 12);
  const t = builtAt ? Date.parse(builtAt) : NaN;
  const updated = Number.isFinite(t) ? new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : null;
  return { version: (version ?? "").trim() || "0.0.0", build, updated };
}

/** Compares this phone's release with the live one: "latest", "behind" or "unknown" (offline, or a local run). */
export function updateState(mine: string | undefined, live: string | null | undefined): "latest" | "behind" | "unknown" {
  if (!mine || mine === "local" || mine === "unknown" || !live || live === "unknown") return "unknown";
  return mine === live ? "latest" : "behind";
}
