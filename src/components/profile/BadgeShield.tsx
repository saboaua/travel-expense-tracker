import { tierOf } from "@/lib/personal/badges";

/** The badge picture for a level (1 to 5). Locked shows a padlock in grey. */
export function BadgeShield({ level, size = 56, locked = false }: { level: number; size?: number; locked?: boolean }) {
  const t = tierOf(level);
  if (!t) return null;
  const dark = locked ? "#94a3b8" : t.dark, light = locked ? "#e2e8f0" : t.light;
  const id = `bs-${level}-${locked ? "l" : "u"}`;
  const pips = locked ? [] : Array.from({ length: level }, (_, j) => 32 - (level - 1) * 5 + j * 10);
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="shrink-0">
      <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={light} /><stop offset="1" stopColor={dark} /></linearGradient></defs>
      <path d="M32 3 56 11v20c0 14-10 24-24 30C18 55 8 45 8 31V11z" fill={`url(#${id})`} stroke={dark} strokeWidth="2" />
      {locked ? (
        <>
          <rect x="25" y="25" width="14" height="11" rx="2" fill="#fff" />
          <path d="M28 25v-3a4 4 0 0 1 8 0v3" fill="none" stroke="#fff" strokeWidth="2.4" />
        </>
      ) : (
        <path d="M32 15l4.2 8.6 9.4 1.3-6.8 6.6 1.6 9.4L32 36.4l-8.4 4.5 1.6-9.4-6.8-6.6 9.4-1.3z" fill="#fff" />
      )}
      {pips.map((cx) => <circle key={cx} cx={cx} cy="46" r="2.2" fill="#fff" opacity=".95" />)}
    </svg>
  );
}
