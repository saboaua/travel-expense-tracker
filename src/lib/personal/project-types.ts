/** What a project is for: ten ready types, or one the person names themselves. Pure data, no React. */

export type ProjectTypeKey = "home" | "car" | "motorbike" | "boat" | "garden" | "pets" | "tech" | "event" | "business" | "other" | "custom";

export type ProjectTypeInfo = { key: ProjectTypeKey; label: string; icon: string; color: string };

export const PROJECT_TYPES: ProjectTypeInfo[] = [
  { key: "home", label: "Home", icon: "Home", color: "#7c3aed" },
  { key: "car", label: "Car", icon: "Car", color: "#0284c7" },
  { key: "motorbike", label: "Motorbike", icon: "Bike", color: "#dc2626" },
  { key: "boat", label: "Boat", icon: "Sailboat", color: "#0891b2" },
  { key: "garden", label: "Garden", icon: "Sprout", color: "#16a34a" },
  { key: "pets", label: "Pets", icon: "PawPrint", color: "#d97706" },
  { key: "tech", label: "Tech", icon: "Laptop", color: "#4f46e5" },
  { key: "event", label: "Event", icon: "PartyPopper", color: "#c026d3" },
  { key: "business", label: "Business", icon: "Briefcase", color: "#0f766e" },
  { key: "other", label: "Other", icon: "Folder", color: "#64748b" },
];

/** Icons and colors offered for a type the person makes themselves. */
export const TYPE_ICON_CHOICES = ["Home", "Car", "Bike", "Sailboat", "Sprout", "PawPrint", "Laptop", "PartyPopper", "Briefcase", "Palette", "Gift", "Wrench", "Camera", "Music", "GraduationCap", "Heart"] as const;
export const TYPE_COLOR_CHOICES = ["#7c3aed", "#0284c7", "#dc2626", "#16a34a", "#d97706", "#c026d3", "#0f766e", "#64748b"] as const;

export type ProjectTypeFields = { project_type?: string | null; type_label?: string | null; type_icon?: string | null; type_color?: string | null };

const BY_KEY = new Map(PROJECT_TYPES.map((t) => [t.key as string, t]));
const HOME = BY_KEY.get("home")!;

export function sanitizeTypeLabel(v: string): string {
  return v.replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 24);
}

/** The type a project shows: its own custom type, a ready one, or Home for projects made before types existed. */
export function resolveType(p: ProjectTypeFields | null | undefined): ProjectTypeInfo {
  if (!p) return HOME;
  if (p.project_type === "custom" && p.type_label) {
    const icon = (TYPE_ICON_CHOICES as readonly string[]).includes(p.type_icon || "") ? (p.type_icon as string) : "Folder";
    const color = /^#[0-9a-f]{6}$/i.test(p.type_color || "") ? (p.type_color as string) : "#64748b";
    return { key: "custom", label: p.type_label, icon, color };
  }
  return BY_KEY.get(p.project_type || "home") ?? HOME;
}

/** A filter and sort key that tells two types apart, ready or custom. */
export function typeId(p: ProjectTypeFields | null | undefined): string {
  const t = resolveType(p);
  return t.key === "custom" ? `custom:${t.label.toLowerCase()}` : t.key;
}

/** The custom types a person already made, one each, so a second project can pick them again. */
export function customTypesFrom(projects: ProjectTypeFields[]): ProjectTypeInfo[] {
  const seen = new Map<string, ProjectTypeInfo>();
  for (const p of projects) {
    if (p.project_type !== "custom") continue;
    const t = resolveType(p);
    const id = typeId(p);
    if (t.key === "custom" && !seen.has(id)) seen.set(id, t);
  }
  return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** The columns to save for a chosen type. Home saves nothing extra, so a database without the migration still works. */
export function typeColumns(t: ProjectTypeInfo, changed = true): ProjectTypeFields {
  if (t.key === "custom") return { project_type: "custom", type_label: sanitizeTypeLabel(t.label), type_icon: t.icon, type_color: t.color };
  if (t.key === "home" && !changed) return {};
  return { project_type: t.key, type_label: null, type_icon: null, type_color: null };
}
