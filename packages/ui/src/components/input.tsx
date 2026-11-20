"use client";

import * as React from "react";
import { cn } from "../lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Icono opcional alineado a la izquierda del campo. */
  leftIcon?: React.ReactNode;
  /** Icono o acción opcional alineada a la derecha del campo. */
  rightIcon?: React.ReactNode;
  /** Marca visualmente el campo en estado de error con borde `--dsn-error`. */
  error?: boolean;
  /** Clases adicionales para el contenedor cuando se usan iconos laterales. */
  wrapperClassName?: string;
}

/**
 * Campo de entrada de texto accesible de `@mocter/ui` con área táctil Mobile First (`min-h-[40px]`).
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", leftIcon, rightIcon, error = false, wrapperClassName, ...props }, ref) => {
    const baseInputClass = cn(
      "w-full min-h-[40px] rounded-lg border bg-[var(--dsn-input-bg)] px-3 py-2 text-xs md:text-sm text-[var(--dsn-text)] placeholder:text-[var(--dsn-text-tertiary)] transition-colors",
      "focus:outline-none focus:ring-2 focus:ring-[var(--dsn-accent)]/40 focus:border-[var(--dsn-accent)]",
      "disabled:cursor-not-allowed disabled:opacity-50",
      error
        ? "border-[var(--dsn-error)] focus:border-[var(--dsn-error)] focus:ring-[var(--dsn-error)]/30"
        : "border-[var(--dsn-input-border,var(--dsn-border))]",
      leftIcon ? "pl-9" : "",
      rightIcon ? "pr-9" : "",
      className,
    );

    if (leftIcon || rightIcon) {
      return (
        <div className={cn("relative flex w-full items-center", wrapperClassName)}>
          {leftIcon && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-3 flex items-center text-[var(--dsn-text-secondary)]"
            >
              {leftIcon}
            </span>
          )}
          <input
            ref={ref}
            type={type}
            aria-invalid={error || props["aria-invalid"]}
            className={baseInputClass}
            {...props}
          />
          {rightIcon && (
            <span className="absolute right-3 flex items-center text-[var(--dsn-text-secondary)]">
              {rightIcon}
            </span>
          )}
        </div>
      );
    }

    return (
      <input
        ref={ref}
        type={type}
        aria-invalid={error || props["aria-invalid"]}
        className={baseInputClass}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";
