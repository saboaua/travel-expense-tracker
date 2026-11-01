"use client";

import { iconFor, type CategoryOption } from "@/lib/category-icons";

export function CategoryButtons({
  options,
  value,
  onChange,
}: {
  options: CategoryOption[];
  value: string;
  onChange: (name: string) => void;
}) {
  // Keep a previously saved value visible even if an admin later disabled/removed it.
  const list =
    value && !options.some((o) => o.name === value) ? [...options, { name: value, icon: null }] : options;

  return (
    <div className="flex flex-wrap gap-2">
      {list.map(({ name, icon }) => {
        const Icon = iconFor(icon);
        const active = value === name;
        return (
          <button
            key={name}
            type="button"
            onClick={() => onChange(name)}
            aria-pressed={active}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-background hover:bg-accent"
            }`}
          >
            <Icon className="h-4 w-4" />
            {name}
          </button>
        );
      })}
    </div>
  );
}
