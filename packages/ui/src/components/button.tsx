"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { Slot } from "radix-ui";
import { cn } from "../lib/utils";

/**
 * Variantes visuales canónicas del botón de Mocter (`DSN-001`, `AGENTS.md §4.19`).
 */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dsn-accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--dsn-background)] disabled:pointer-events-none disabled:opacity-50 cursor-pointer [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-[var(--dsn-accent)] text-white shadow-xs hover:opacity-90",
        default: "bg-[var(--dsn-accent)] text-white shadow-xs hover:opacity-90",
        secondary:
          "border border-[var(--dsn-border)] bg-[var(--dsn-surface)] text-[var(--dsn-text)] hover:border-[var(--dsn-accent)] hover:bg-[var(--dsn-surface-secondary)]",
        outline:
          "border border-[var(--dsn-border)] bg-transparent text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)]",
        ghost:
          "bg-transparent text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface-secondary)] hover:text-[var(--dsn-text)]",
        destructive: "bg-rose-600 text-white shadow-xs hover:bg-rose-500",
        warning: "bg-amber-600 text-white shadow-xs hover:bg-amber-500",
        ai: "border border-[var(--dsn-accent)]/40 bg-[var(--dsn-accent)]/10 text-[var(--dsn-accent)] hover:bg-[var(--dsn-accent)]/20",
      },
      size: {
        md: "min-h-[40px] rounded-lg px-4 py-2 text-xs",
        default: "min-h-[40px] rounded-lg px-4 py-2 text-xs",
        sm: "min-h-[34px] rounded-md px-3 py-1.5 text-xs",
        lg: "min-h-[44px] rounded-lg px-5 py-2.5 text-sm",
        icon: "min-h-[38px] min-w-[38px] rounded-lg p-2",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Renderiza el elemento hijo directamente mediante `Slot.Root` de Radix. */
  asChild?: boolean;
  /** Activa el estado de carga deshabilitando el botón y mostrando un spinner. */
  loading?: boolean;
  /** Texto opcional mostrado mientras `loading` es verdadero. */
  loadingText?: string;
}

/**
 * Botón accesible estandarizado de `@mocter/ui` mapeado a los tokens `--dsn-*`.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      loadingText,
      disabled,
      type = "button",
      children,
      ...props
    },
    ref,
  ) => {
    if (asChild) {
      return (
        <Slot.Root
          ref={ref}
          className={cn(buttonVariants({ variant, size }), className)}
          {...props}
        >
          {children}
        </Slot.Root>
      );
    }

    const isDisabled = Boolean(disabled || loading);

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {loading && loadingText ? <span>{loadingText}</span> : children}
      </button>
    );
  },
);
Button.displayName = "Button";
