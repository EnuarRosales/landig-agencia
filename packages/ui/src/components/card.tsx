"use client";

import * as React from "react";
import { Slot } from "radix-ui";
import { cn } from "../lib/utils";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Renderiza el elemento hijo directamente mediante `Slot.Root` de Radix. */
  asChild?: boolean;
}

/**
 * Contenedor de tarjeta con superficie `--dsn-surface` y hairline `--dsn-border`.
 */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot.Root : "div";
    return (
      <Comp
        ref={ref}
        className={cn(
          "rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] text-[var(--dsn-text)] shadow-xs",
          className,
        )}
        {...props}
      />
    );
  },
);
Card.displayName = "Card";

/** Cabecera de tarjeta. */
export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-5", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

/** Título de tarjeta. */
export const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("text-sm md:text-base font-semibold leading-tight text-[var(--dsn-text)]", className)}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

/** Descripción secundaria de tarjeta. */
export const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-xs text-[var(--dsn-text-secondary)]", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

/** Cuerpo principal de tarjeta. */
export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-5 pt-0", className)} {...props} />
  ),
);
CardContent.displayName = "CardContent";

/** Pie de tarjeta con acciones o metadatos. */
export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex items-center justify-end gap-2 border-t border-[var(--dsn-border)] px-5 py-3.5", className)}
      {...props}
    />
  ),
);
CardFooter.displayName = "CardFooter";
