export interface ManagedUser {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  role: string;
  must_change_password: boolean;
  temp_password_expires_at: string | null;
  created_at: string;
  last_sign_in_at: string | null;
}

export type Credentials = { email: string; password: string; expiresAt: string };

export function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days !== 1 ? "s" : ""} ago`;
}

function timeLeft(iso: string) {
  const mins = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)} min`;
  return `${Math.round(mins / 60)} h`;
}

type Status = { label: string; cls: string; needsNewPassword: boolean };

export function statusOf(u: ManagedUser): Status {
  if (u.must_change_password) {
    const expired = u.temp_password_expires_at && new Date(u.temp_password_expires_at).getTime() < Date.now();
    if (expired) {
      return { label: "Temp password expired", cls: "bg-red-100 text-red-700", needsNewPassword: true };
    }
    return {
      label: u.temp_password_expires_at
        ? `Waiting for first login · expires in ${timeLeft(u.temp_password_expires_at)}`
        : "Waiting for first login",
      cls: "bg-amber-100 text-amber-800",
      needsNewPassword: false,
    };
  }
  return u.last_sign_in_at
    ? { label: "Active", cls: "bg-green-100 text-green-700", needsNewPassword: false }
    : { label: "Never signed in", cls: "bg-slate-100 text-slate-600", needsNewPassword: false };
}
