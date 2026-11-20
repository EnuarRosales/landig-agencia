"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { cn } from "../lib/utils";

/**
 * Raíz de diálogo modal accesible basado en Radix `Dialog`.
 */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogClose = DialogPrimitive.Close;

/**
 * Capa de fondo traslúcida del diálogo modal.
 */
export const DialogOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/60 backdrop-blur-xs transition-opacity",
      "data-[state=open]:animate-in data-[state=closed]:animate-out",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = "DialogOverlay";

export interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  /** Muestra el botón superior derecho para cerrar el diálogo. */
  showCloseButton?: boolean;
  /** Etiqueta accesible para el botón de cierre. */
  closeAriaLabel?: string;
  /** Deshabilita el cierre del diálogo cuando el usuario pulsa `Escape`. */
  disableEscapeKeyDown?: boolean;
  /** Deshabilita el cierre al interactuar fuera de la superficie del modal. */
  disableInteractOutside?: boolean;
  /** Permite desactivar `Portal` en escenarios de pruebas que requieran montaje en línea. */
  portal?: boolean;
  /** Clases adicionales para el overlay. */
  overlayClassName?: string;
}

/**
 * Superficie principal del diálogo modal con trampa de foco, cierre con `Escape` y tokens `--dsn-*`.
 */
export const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(
  (
    {
      className,
      children,
      showCloseButton = true,
      closeAriaLabel = "Cerrar modal",
      disableEscapeKeyDown = false,
      disableInteractOutside = false,
      portal = true,
      overlayClassName,
      onEscapeKeyDown,
      onPointerDownOutside,
      onInteractOutside,
      ...props
    },
    ref,
  ) => {
    const contentNode = (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <DialogOverlay className={overlayClassName} />
        <DialogPrimitive.Content
          ref={ref}
          aria-modal="true"
          onEscapeKeyDown={(event) => {
            if (disableEscapeKeyDown) {
              event.preventDefault();
            }
            onEscapeKeyDown?.(event);
          }}
          onPointerDownOutside={(event) => {
            if (disableInteractOutside) {
              event.preventDefault();
            }
            onPointerDownOutside?.(event);
          }}
          onInteractOutside={(event) => {
            if (disableInteractOutside) {
              event.preventDefault();
            }
            onInteractOutside?.(event);
          }}
          className={cn(
            "relative z-50 w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 text-left text-[var(--dsn-text)] shadow-2xl focus:outline-none",
            className,
          )}
          {...props}
        >
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close
              type="button"
              disabled={disableEscapeKeyDown}
              aria-label={closeAriaLabel}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-[var(--dsn-text-secondary)] transition-colors hover:bg-[var(--dsn-surface-secondary)] hover:text-[var(--dsn-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dsn-accent)] disabled:opacity-50 cursor-pointer"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Content>
      </div>
    );

    if (!portal) {
      return contentNode;
    }

    return <DialogPortal>{contentNode}</DialogPortal>;
  },
);
DialogContent.displayName = "DialogContent";

/** Cabecera de diálogo modal. */
export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-col space-y-1 border-b border-[var(--dsn-border)] pb-3 mb-4 pr-8 text-left",
        className,
      )}
      {...props}
    />
  );
}

/** Título accesible vinculado automáticamente vía `aria-labelledby`. */
export const DialogTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-base font-bold leading-tight text-[var(--dsn-text)]", className)}
    {...props}
  />
));
DialogTitle.displayName = "DialogTitle";

/** Descripción accesible vinculada automáticamente vía `aria-describedby`. */
export const DialogDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-xs text-[var(--dsn-text-secondary)]", className)}
    {...props}
  />
));
DialogDescription.displayName = "DialogDescription";

/** Pie del diálogo modal para acciones principales y secundarias. */
export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "mt-5 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 border-t border-[var(--dsn-border)] pt-4",
        className,
      )}
      {...props}
    />
  );
}
