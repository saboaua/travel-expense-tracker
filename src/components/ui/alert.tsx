import * as React from "react";
import { cn } from "@/lib/utils";

const VARIANTS = {
  error: "bg-red-50 text-red-600",
  success: "bg-green-50 text-green-700",
  warning: "bg-amber-50 text-amber-800",
  info: "bg-blue-50 text-blue-800",
} as const;

type AlertProps = React.HTMLAttributes<HTMLDivElement> & { variant?: keyof typeof VARIANTS };

/** The one message box for errors, confirmations and warnings. */
export function Alert({ variant = "error", className, children, role, ...props }: AlertProps) {
  return (
    <div role={role ?? (variant === "error" ? "alert" : "status")} className={cn("rounded-lg p-3 text-sm", VARIANTS[variant], className)} {...props}>
      {children}
    </div>
  );
}
