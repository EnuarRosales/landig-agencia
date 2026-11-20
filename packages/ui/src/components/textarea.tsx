"use client";

import * as React from "react";
import { cn } from "../lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Marca visualmente el área de texto en estado de error con borde `--dsn-error`. */
  error?: boolean;
}

/**
 * Área de texto multilínea accesible de `@mocter/ui` conectada a los tokens `--dsn-*`.
 */
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error = false, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        aria-invalid={error || props["aria-invalid"]}
        className={cn(
          "w-full min-h-[96px] rounded-lg border bg-[var(--dsn-input-bg)] px-3 py-2.5 text-xs md:text-sm text-[var(--dsn-text)] placeholder:text-[var(--dsn-text-tertiary)] transition-colors",
          "focus:outline-none focus:ring-2 focus:ring-[var(--dsn-accent)]/40 focus:border-[var(--dsn-accent)]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          error
            ? "border-[var(--dsn-error)] focus:border-[var(--dsn-error)] focus:ring-[var(--dsn-error)]/30"
            : "border-[var(--dsn-input-border,var(--dsn-border))]",
          className,
        )}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";
