import { avatarColour, initialOf } from "@/lib/reminder-partners";

/** A round initial for a person, the same colour every time. */
export function PersonAvatar({ name, size = 28 }: { name: string; size?: number }) {
  return (
    <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center rounded-full border-2 border-card font-extrabold text-white" style={{ width: size, height: size, background: avatarColour(name), fontSize: Math.round(size * 0.42) }}>
      {initialOf(name)}
    </span>
  );
}
