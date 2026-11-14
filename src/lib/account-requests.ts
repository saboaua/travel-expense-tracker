/** Checks a "request an account" form. Pure, so it is unit-tested. At least an email or a phone number is needed. */
export type RequestInput = { name: string; email: string; phone: string };
export type RequestClean = { name: string; email: string | null; phone: string | null };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function cleanRequest(i: RequestInput): { ok: true; value: RequestClean } | { ok: false; error: string } {
  const name = i.name.trim().replace(/\s+/g, " ");
  const email = i.email.trim().toLowerCase();
  const phone = i.phone.trim().replace(/\s+/g, " ");
  if (name.length < 2) return { ok: false, error: "Enter your name." };
  if (name.length > 80) return { ok: false, error: "That name is too long." };
  if (!email && !phone) return { ok: false, error: "Add an email or a phone number so we can reach you." };
  if (email && (!EMAIL.test(email) || email.length > 160)) return { ok: false, error: "That email does not look right." };
  if (phone) {
    const digits = phone.replace(/\D/g, "");
    if (!/^[+\d][\d\s().-]*$/.test(phone) || digits.length < 6 || digits.length > 15) return { ok: false, error: "That phone number does not look right." };
  }
  return { ok: true, value: { name, email: email || null, phone: phone || null } };
}
