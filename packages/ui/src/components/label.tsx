"use client";

import * as React from "react";
import { Label as LabelPrimitive } from "radix-ui";
import { cn } from "../lib/utils";

export interface LabelProps extends React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> {
  /** Muestra un asterisco accesible fuera del texto consultable de `<label>` cuando el campo es obligatorio. */
  required?: boolean;
}

/**
 * Etiqueta de formulario sobre Radix `Label`.
 *
 * Respeta `AGENTS.md §4.8`: nunca fuerza `uppercase` ni variantes de mayúsculas sostenidas.
 */
export const Label = React.forwardRef<
  React.ComponentRef<typeof LabelPrimitive.Root>,
  LabelProps
>(({ className, children, required = false, ...props }, ref) => {
  const labelElement = (
    <LabelPrimitive.Root
      ref={ref}
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium leading-snug text-[var(--dsn-text)] peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        required ? undefined : className,
      )}
      {...props}
    >
      {children}
    </LabelPrimitive.Root>
  );

  if (!required) {
    return labelElement;
  }

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {labelElement}
      <span aria-hidden="true" className="text-xs font-semibold text-[var(--dsn-error)]">
        *
      </span>
    </span>
  );
});
Label.displayName = "Label";

export interface FormFieldProps {
  /** Etiqueta en formato Title Case asociada al control. */
  label: React.ReactNode;
  /** Identificador `htmlFor` del control asociado. */
  htmlFor?: string;
  /** Indica campo obligatorio. */
  required?: boolean;
  /** Texto auxiliar descriptivo mostrado debajo del control. */
  hint?: React.ReactNode;
  /** Mensaje de error de validación mostrado en color `--dsn-error`. */
  error?: React.ReactNode;
  /** Clases adicionales para el contenedor del campo. */
  className?: string;
  /** Control de formulario hijo. */
  children: React.ReactNode;
}

/**
 * Contenedor estándar de campo de formulario con etiqueta, control, ayuda y error.
 */
export function FormField({
  label,
  htmlFor,
  required = false,
  hint,
  error,
  className,
  children,
}: FormFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor} required={required}>
        {label}
      </Label>
      {children}
      {error ? (
        <p role="alert" className="text-[11px] font-medium text-[var(--dsn-error)]">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[11px] text-[var(--dsn-text-secondary)]">{hint}</p>
      ) : null}
    </div>
  );
}
