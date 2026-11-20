import * as React from "react";
import { cn } from "../lib/utils";

export interface EmptyStateProps {
  /** Icono ilustrativo del estado vacío. */
  icon?: React.ReactNode;
  /** Título principal del estado vacío. */
  title: React.ReactNode;
  /** Descripción explicativa y guía de recuperación. */
  description?: React.ReactNode;
  /** Botón o enlace de acción primaria. */
  action?: React.ReactNode;
  /** Identificador estable de pruebas. */
  testId?: string;
  /** Clases adicionales para el contenedor. */
  className?: string;
}

/**
 * Estado vacío estandarizado para listas, tablas y vistas sin registros (`ADM-001 RF-13`).
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  testId,
  className,
}: EmptyStateProps) {
  return (
    <div
      data-testid={testId}
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-6 py-10 text-center",
        className,
      )}
    >
      {icon && (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] text-[var(--dsn-accent)]">
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold text-[var(--dsn-text)]">{title}</p>
      {description && (
        <p className="mt-1 max-w-md text-xs text-[var(--dsn-text-secondary)]">{description}</p>
      )}
      {action && <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}
