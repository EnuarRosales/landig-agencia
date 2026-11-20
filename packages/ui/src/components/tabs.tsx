"use client";

import * as React from "react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { cn } from "../lib/utils";

/**
 * Sistema de pestañas accesible con navegación por teclado basado en Radix `Tabs`.
 */
export const Tabs = TabsPrimitive.Root;

/** Contenedor de lista de pestañas. */
export const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex flex-wrap items-center gap-1 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] p-1 text-[var(--dsn-text-secondary)]",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = "TabsList";

/** Botón activador de cada pestaña. */
export const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex min-h-[34px] items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dsn-accent)]",
      "disabled:pointer-events-none disabled:opacity-50",
      "data-[state=active]:bg-[var(--dsn-surface)] data-[state=active]:text-[var(--dsn-text)] data-[state=active]:shadow-xs data-[state=active]:border data-[state=active]:border-[var(--dsn-accent)]/40",
      "hover:text-[var(--dsn-text)]",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = "TabsTrigger";

/** Panel de contenido asociado a una pestaña. */
export const TabsContent = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dsn-accent)] rounded-lg",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = "TabsContent";
