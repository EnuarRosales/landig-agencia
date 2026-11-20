"use client";

import * as React from "react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { Select as SelectPrimitive } from "radix-ui";
import { cn } from "../lib/utils";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** Marca visualmente el selector en estado de error con borde `--dsn-error`. */
  error?: boolean;
  /** Clases adicionales para el contenedor relativo del selector nativo. */
  wrapperClassName?: string;
}

/**
 * Selector Mobile First basado en `<select>` nativo estilizado (`SPEC-21 D-05`).
 *
 * Garantiza uso del picker nativo en dispositivos móviles y compatibilidad directa
 * con `<option>` y eventos estándar `onChange` / `fireEvent.change`.
 */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, wrapperClassName, error = false, children, ...props }, ref) => {
    const hasCustomWidth = Boolean(
      className && /\b(?:w-auto|w-fit|sm:w-|md:w-|lg:w-|min-w-|max-w-)/.test(className),
    );

    return (
      <div
        className={cn(
          "relative",
          hasCustomWidth ? "inline-flex items-center" : "w-full",
          wrapperClassName,
        )}
      >
        <select
          ref={ref}
          aria-invalid={error || props["aria-invalid"]}
          className={cn(
            "w-full min-h-[40px] appearance-none rounded-lg border bg-[var(--dsn-input-bg)] px-3 py-2 pr-9 text-xs md:text-sm text-[var(--dsn-text)] transition-colors cursor-pointer",
            "focus:outline-none focus:ring-2 focus:ring-[var(--dsn-accent)]/40 focus:border-[var(--dsn-accent)]",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error
              ? "border-[var(--dsn-error)] focus:border-[var(--dsn-error)] focus:ring-[var(--dsn-error)]/30"
              : "border-[var(--dsn-input-border,var(--dsn-border))]",
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--dsn-text-secondary)]"
        />
      </div>
    );
  },
);
Select.displayName = "Select";

/** Alias explícito de `<Select />` para selectores nativos Mobile First. */
export const NativeSelect = Select;

/**
 * Selector enriquecido sobre Radix `Select` para opciones personalizadas con iconos o badges (`SPEC-21 D-05`).
 */
export const CustomSelect = SelectPrimitive.Root;
export const CustomSelectGroup = SelectPrimitive.Group;
export const CustomSelectValue = SelectPrimitive.Value;

export const CustomSelectTrigger = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> & { error?: boolean }
>(({ className, children, error = false, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "flex w-full min-h-[40px] items-center justify-between gap-2 rounded-lg border bg-[var(--dsn-input-bg)] px-3 py-2 text-xs md:text-sm text-[var(--dsn-text)] transition-colors cursor-pointer",
      "focus:outline-none focus:ring-2 focus:ring-[var(--dsn-accent)]/40 focus:border-[var(--dsn-accent)]",
      "disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-[var(--dsn-text-tertiary)]",
      error ? "border-[var(--dsn-error)]" : "border-[var(--dsn-input-border,var(--dsn-border))]",
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 shrink-0 text-[var(--dsn-text-secondary)]" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
CustomSelectTrigger.displayName = "CustomSelectTrigger";

export const CustomSelectScrollUpButton = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn("flex cursor-default items-center justify-center py-1 text-[var(--dsn-text-secondary)]", className)}
    {...props}
  >
    <ChevronUp className="h-4 w-4" />
  </SelectPrimitive.ScrollUpButton>
));
CustomSelectScrollUpButton.displayName = "CustomSelectScrollUpButton";

export const CustomSelectScrollDownButton = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn("flex cursor-default items-center justify-center py-1 text-[var(--dsn-text-secondary)]", className)}
    {...props}
  >
    <ChevronDown className="h-4 w-4" />
  </SelectPrimitive.ScrollDownButton>
));
CustomSelectScrollDownButton.displayName = "CustomSelectScrollDownButton";

export const CustomSelectContent = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      position={position}
      className={cn(
        "relative z-50 max-h-80 min-w-[8rem] overflow-hidden rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] text-[var(--dsn-text)] shadow-xl",
        position === "popper" &&
          "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
        className,
      )}
      {...props}
    >
      <CustomSelectScrollUpButton />
      <SelectPrimitive.Viewport
        className={cn(
          "p-1",
          position === "popper" &&
            "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]",
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
      <CustomSelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
CustomSelectContent.displayName = "CustomSelectContent";

export const CustomSelectLabel = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn("px-2 py-1.5 text-[11px] font-semibold text-[var(--dsn-text-secondary)]", className)}
    {...props}
  />
));
CustomSelectLabel.displayName = "CustomSelectLabel";

export const CustomSelectItem = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-pointer select-none items-center rounded-lg py-2 pl-8 pr-3 text-xs text-[var(--dsn-text)] outline-none",
      "focus:bg-[var(--dsn-surface-secondary)] focus:text-[var(--dsn-text)] data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className,
    )}
    {...props}
  >
    <span className="absolute left-2.5 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
CustomSelectItem.displayName = "CustomSelectItem";

export const CustomSelectSeparator = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-[var(--dsn-border)]", className)}
    {...props}
  />
));
CustomSelectSeparator.displayName = "CustomSelectSeparator";
