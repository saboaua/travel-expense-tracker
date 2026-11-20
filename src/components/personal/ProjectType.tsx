"use client";

import { useState } from "react";
import { Home, Car, Bike, Sailboat, Sprout, PawPrint, Laptop, PartyPopper, Briefcase, Folder, Palette, Gift, Wrench, Camera, Music, GraduationCap, Heart, Plus, Check, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PROJECT_TYPES, TYPE_COLOR_CHOICES, TYPE_ICON_CHOICES, sanitizeTypeLabel, typeId, type ProjectTypeInfo } from "@/lib/personal/project-types";

const ICONS: Record<string, LucideIcon> = { Home, Car, Bike, Sailboat, Sprout, PawPrint, Laptop, PartyPopper, Briefcase, Folder, Palette, Gift, Wrench, Camera, Music, GraduationCap, Heart };
export const typeIcon = (name: string): LucideIcon => ICONS[name] ?? Folder;

export function TypeTile({ type, size = 44 }: { type: ProjectTypeInfo; size?: number }) {
  const Icon = typeIcon(type.icon);
  return (
    <span className="flex shrink-0 items-center justify-center rounded-[13px]" style={{ width: size, height: size, background: `${type.color}1f`, color: type.color }} aria-hidden="true">
      <Icon style={{ width: size * 0.5, height: size * 0.5 }} />
    </span>
  );
}

export function TypeChip({ type, className }: { type: ProjectTypeInfo; className?: string }) {
  const Icon = typeIcon(type.icon);
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-bold", className)} style={{ background: `${type.color}1a`, color: type.color }} data-testid="type-chip">
      <Icon className="h-3 w-3" aria-hidden="true" />{type.label}
    </span>
  );
}

const pill = "inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3 text-[13.5px] font-bold";

/** Pick one of the ready types, one made before, or make a new one (name, icon, color). */
export function TypePicker({ value, onChange, custom }: { value: ProjectTypeInfo; onChange: (t: ProjectTypeInfo) => void; custom: ProjectTypeInfo[] }) {
  const [making, setMaking] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string>("PartyPopper");
  const [color, setColor] = useState<string>("#c026d3");
  const chosen = typeId({ project_type: value.key, type_label: value.label });
  const options = [...PROJECT_TYPES.filter((t) => t.key !== "other"), ...custom, PROJECT_TYPES.find((t) => t.key === "other")!];
  const draft: ProjectTypeInfo = { key: "custom", label: sanitizeTypeLabel(name) || "Your type", icon, color };
  return (
    <div>
      <div role="radiogroup" aria-label="Project type" className="flex flex-wrap gap-2">
        {options.map((t) => {
          const Icon = typeIcon(t.icon);
          const on = typeId({ project_type: t.key, type_label: t.label }) === chosen;
          return (
            <button key={`${t.key}:${t.label}`} type="button" role="radio" aria-checked={on} onClick={() => { setMaking(false); onChange(t); }}
              className={cn(pill, on ? "border-primary bg-primary text-primary-foreground" : "bg-card")} data-testid={`type-${t.key === "custom" ? "custom" : t.key}`}>
              <Icon className="h-4 w-4" style={on ? undefined : { color: t.color }} aria-hidden="true" />{t.label}
            </button>
          );
        })}
        <button type="button" onClick={() => setMaking((m) => !m)} aria-expanded={making} className={cn(pill, "border-dashed text-primary")} data-testid="type-own">
          <Plus className="h-4 w-4" aria-hidden="true" />Your own
        </button>
      </div>
      {making && (
        <div className="mt-3 space-y-3 rounded-2xl border bg-muted/30 p-3" data-testid="type-own-form">
          <div>
            <label htmlFor="own-type-name" className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">Type name</label>
            <Input id="own-type-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="Wedding" />
          </div>
          <div>
            <p className="mb-1.5 text-[13px] font-semibold text-muted-foreground">Icon</p>
            <div className="flex flex-wrap gap-2">
              {TYPE_ICON_CHOICES.map((n) => { const I = typeIcon(n); return (
                <button key={n} type="button" onClick={() => setIcon(n)} aria-label={n} aria-pressed={icon === n} className={cn("flex h-11 w-11 items-center justify-center rounded-xl border", icon === n ? "border-primary bg-primary text-primary-foreground" : "bg-card")}><I className="h-5 w-5" aria-hidden="true" /></button>
              ); })}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-[13px] font-semibold text-muted-foreground">Color</p>
            <div className="flex flex-wrap gap-2.5">
              {TYPE_COLOR_CHOICES.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)} aria-label={`Color ${c}`} aria-pressed={color === c} className={cn("h-8 w-8 rounded-full", color === c && "outline outline-[3px] outline-offset-2 outline-foreground")} style={{ background: c }} />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border bg-card p-2.5"><TypeTile type={draft} size={36} /><TypeChip type={draft} /></div>
          <Button type="button" disabled={!sanitizeTypeLabel(name)} onClick={() => { onChange(draft); setMaking(false); setName(""); }} data-testid="type-own-save"><Check className="h-4 w-4" aria-hidden="true" />Use this type</Button>
          <p className="text-xs text-muted-foreground">Your types are private to you.</p>
        </div>
      )}
    </div>
  );
}
