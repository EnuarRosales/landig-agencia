"use client";

import * as React from "react";
import { Check, Minus } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { cn } from "../lib/utils";

export type CheckboxProps = React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>;

/**
 * Casilla de verificación accesible basada en Radix `Checkbox`.
 */
export const Checkbox = React.forwardRef<
  React.ComponentRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(({ className, checked, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    checked={checked}
    className={cn(
      "peer inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border border-[var(--dsn-input-border,var(--dsn-border))] bg-[var(--dsn-input-bg)] text-white transition-colors cursor-pointer",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dsn-accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--dsn-background)]",
      "data-[state=checked]:border-[var(--dsn-accent)] data-[state=checked]:bg-[var(--dsn-accent)]",
      "data-[state=indeterminate]:border-[var(--dsn-accent)] data-[state=indeterminate]:bg-[var(--dsn-accent)]",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
      {checked === "indeterminate" ? (
        <Minus className="h-3 w-3 stroke-[2.5]" aria-hidden="true" />
      ) : (
        <Check className="h-3 w-3 stroke-[2.5]" aria-hidden="true" />
      )}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = "Checkbox";
