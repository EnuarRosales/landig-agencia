"use client";

import { useCallback, useEffect, useState } from "react";

type NavigationGuardListener = (targetHref: string, proceed: () => void) => boolean;

const activeNavigationGuards = new Set<NavigationGuardListener>();

/**
 * Solicita autorización a los formularios activos con cambios pendientes antes de navegar.
 * Retorna `true` si puede continuar la navegación de inmediato, o `false` si un formulario
 * interceptó la transición para mostrar su modal accesible `--dsn-*`.
 */
export function requestGuardedNavigation(targetHref: string, proceed: () => void): boolean {
  for (const guard of activeNavigationGuards) {
    const handled = guard(targetHref, proceed);
    if (handled) {
      return false;
    }
  }
  return true;
}

export interface UseUnsavedChangesGuardOptions {
  /** Indica si el formulario actual tiene cambios pendientes sin guardar. */
  isDirty: boolean;
  /** Callback ejecutado cuando el usuario confirma descartar los cambios pendientes. */
  onDiscard: () => void;
  /** Callback opcional para ejecutar la navegación confirmada (ej. `router.push(href)`). */
  onNavigate?: (href: string) => void;
}

export interface UseUnsavedChangesGuardResult {
  /** Controla la visibilidad del modal accesible `--dsn-*` de confirmación. */
  discardModalOpen: boolean;
  /** Destino pendiente si la confirmación proviene de un intento de navegación. */
  pendingNavigationHref: string | null;
  /** Abre el modal de confirmación de descarte (o ejecuta `onDiscard` si no está dirty). */
  requestDiscard: () => void;
  /** Cierra el modal y conserva los cambios en edición. */
  cancelDiscard: () => void;
  /** Confirma el descarte, limpia estado y continúa la navegación si existía destino pendiente. */
  confirmDiscard: () => void;
}

/**
 * Hook transversal para proteger formularios extensos contra pérdida accidental de cambios (`SPEC-17 AIB-04`).
 *
 * - Registra el interceptor `beforeunload` cuando `isDirty` es `true`.
 * - Intercepta clics de navegación del shell vía {@link requestGuardedNavigation} abriendo un modal `--dsn-*`.
 * - Nunca invoca `window.confirm()`, `window.alert()` ni `window.prompt()`.
 */
export function useUnsavedChangesGuard({
  isDirty,
  onDiscard,
  onNavigate,
}: UseUnsavedChangesGuardOptions): UseUnsavedChangesGuardResult {
  const [discardModalOpen, setDiscardModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    href: string;
    proceed: () => void;
  } | null>(null);

  useEffect(() => {
    if (!isDirty || typeof window === "undefined") {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (!isDirty) return;

    const listener: NavigationGuardListener = (targetHref, proceed) => {
      setPendingAction({ href: targetHref, proceed });
      setDiscardModalOpen(true);
      return true;
    };

    activeNavigationGuards.add(listener);
    return () => {
      activeNavigationGuards.delete(listener);
    };
  }, [isDirty]);

  const requestDiscard = useCallback(() => {
    if (!isDirty) return;
    setPendingAction(null);
    setDiscardModalOpen(true);
  }, [isDirty]);

  const cancelDiscard = useCallback(() => {
    setDiscardModalOpen(false);
    setPendingAction(null);
  }, []);

  const confirmDiscard = useCallback(() => {
    const nextAction = pendingAction;
    setDiscardModalOpen(false);
    setPendingAction(null);
    onDiscard();
    if (nextAction) {
      if (onNavigate) {
        onNavigate(nextAction.href);
      } else {
        nextAction.proceed();
      }
    }
  }, [onDiscard, onNavigate, pendingAction]);

  return {
    discardModalOpen,
    pendingNavigationHref: pendingAction?.href ?? null,
    requestDiscard,
    cancelDiscard,
    confirmDiscard,
  };
}
