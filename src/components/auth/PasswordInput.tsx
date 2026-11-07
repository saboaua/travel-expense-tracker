"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { passwordProblem } from "@/lib/password-policy";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** Classes for the input itself; right padding for the eye button is added. */
  inputClassName?: string;
  /** Something drawn inside the left edge, such as an icon. */
  left?: React.ReactNode;
};

/** A password box with a show/hide eye. The text is hidden until the eye is tapped. */
export function PasswordInput({ inputClassName = "", left, ...props }: Props) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      {left}
      <input {...props} type={shown ? "text" : "password"} className={`${inputClassName} pr-11`} />
      <button
        type="button"
        onClick={() => setShown(!shown)}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition-colors hover:text-slate-600"
      >
        {shown ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
      </button>
    </div>
  );
}

/** Live feedback under a new-password pair: what the password still needs, and whether the two match. */
export function PasswordHints({ password, confirm }: { password: string; confirm: string }) {
  const problem = password ? passwordProblem(password) : null;
  const mismatch = confirm.length > 0 && password !== confirm;
  return (
    <div className="space-y-1 text-xs" aria-live="polite">
      {password && (
        <p className={problem ? "text-amber-600" : "text-green-600"} data-testid="password-strength">{problem ?? "Strong password"}</p>
      )}
      {confirm && (
        <p className={mismatch ? "text-amber-600" : "text-green-600"} data-testid="password-match">{mismatch ? "Passwords do not match" : "Passwords match"}</p>
      )}
    </div>
  );
}
