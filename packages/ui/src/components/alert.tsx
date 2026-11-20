import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

/**
 * Variantes semánticas para banners y alertas contextuales (`DSN-001`).
 */
export const alertVariants = cva(
  "relative flex w-full items-start gap-3 rounded-xl border p-3.5 text-xs transition-colors",
  {
    variants: {
      variant: {
        info: "border-[var(--dsn-accent)]/35 bg-[var(--dsn-accent)]/10 text-[var(--dsn-text)] [&_svg]:text-[var(--dsn-accent)]",
        success:
          "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200 [&_svg]:text-emerald-500",
        warning:
          "border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-200 [&_svg]:text-amber-500",
        error:
          "border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-200 [&_svg]:text-rose-500",
        destructive:
          "border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-200 [&_svg]:text-rose-500",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  },
);

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {}

/**
 * Banner de alerta contextual accesible con soporte para variantes semánticas.
 */
export const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant, role = "status", ...props }, ref) => (
    <div
      ref={ref}
      role={role}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  ),
);
Alert.displayName = "Alert";

/** Título de una alerta contextual. */
export const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("font-semibold leading-snug", className)} {...props} />
));
AlertTitle.displayName = "AlertTitle";

/** Descripción de una alerta contextual. */
export const AlertDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("text-xs opacity-90 leading-relaxed", className)} {...props} />
));
AlertDescription.displayName = "AlertDescription";
