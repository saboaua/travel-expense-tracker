import * as React from "react";
import { cn } from "@/lib/utils";

const VARIANTS = {
  error: "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-300",
  success: "bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-300",
  warning: "bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
  info: "bg-blue-50 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200",
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
