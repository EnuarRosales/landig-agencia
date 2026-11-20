"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { cn } from "../lib/utils";

/**
 * Cajón lateral deslizante (Drawer/Sheet) accesible construido sobre Radix `Dialog`.
 */
export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;
export const SheetPortal = DialogPrimitive.Portal;

export const SheetOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn("fixed inset-0 z-50 bg-black/60 backdrop-blur-xs transition-opacity", className)}
    {...props}
  />
));
SheetOverlay.displayName = "SheetOverlay";

const sheetVariants = cva(
  "fixed z-50 flex flex-col border-[var(--dsn-border)] bg-[var(--dsn-surface)] text-[var(--dsn-text)] shadow-2xl transition-transform focus:outline-none",
  {
    variants: {
      side: {
        left: "inset-y-0 left-0 h-full w-3/4 max-w-[300px] border-r",
        right: "inset-y-0 right-0 h-full w-3/4 max-w-md border-l",
        top: "inset-x-0 top-0 w-full border-b max-h-[85dvh]",
        bottom: "inset-x-0 bottom-0 w-full border-t max-h-[85dvh]",
      },
    },
    defaultVariants: {
      side: "right",
    },
  },
);

export interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  /** Muestra el botón superior derecho de cierre. */
  showCloseButton?: boolean;
  /** Etiqueta accesible para el botón de cierre. */
  closeAriaLabel?: string;
}

/**
 * Contenido deslizante del panel `Sheet`.
 */
export const SheetContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(
  (
    {
      side = "right",
      className,
      children,
      showCloseButton = true,
      closeAriaLabel = "Cerrar panel",
      ...props
    },
    ref,
  ) => (
    <SheetPortal>
      <SheetOverlay />
      <DialogPrimitive.Content
        ref={ref}
        aria-modal="true"
        className={cn(sheetVariants({ side }), "p-6 overflow-y-auto", className)}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            type="button"
            aria-label={closeAriaLabel}
            className="absolute right-4 top-4 rounded-lg p-1.5 text-[var(--dsn-text-secondary)] transition-colors hover:bg-[var(--dsn-surface-secondary)] hover:text-[var(--dsn-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dsn-accent)] cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </SheetPortal>
  ),
);
SheetContent.displayName = "SheetContent";

/** Cabecera de panel lateral `Sheet`. */
export function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col space-y-1.5 border-b border-[var(--dsn-border)] pb-3 mb-4 pr-8", className)}
      {...props}
    />
  );
}

/** Título accesible del `Sheet`. */
export const SheetTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-base font-bold text-[var(--dsn-text)]", className)}
    {...props}
  />
));
SheetTitle.displayName = "SheetTitle";

/** Descripción accesible del `Sheet`. */
export const SheetDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-xs text-[var(--dsn-text-secondary)]", className)}
    {...props}
  />
));
SheetDescription.displayName = "SheetDescription";

/** Pie de acciones del `Sheet`. */
export function SheetFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mt-auto flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-4 border-t border-[var(--dsn-border)]", className)}
      {...props}
    />
  );
}
