"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Trash2,
  Archive,
  CheckCircle2,
  ShieldAlert,
} from "lucide-react";
import type { Plan } from "@mocter/domain";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@mocter/ui";

interface PlanDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: (Plan & { activeTenantsCount?: number }) | null;
  onSuccess?: () => void;
}

/**
 * Diálogo modal para la confirmación contextual de eliminación o retiro de planes comerciales (BILL-001).
 *
 * Implementa la política híbrida de integridad referencial acordada en arquitectura:
 * - Si activeTenantsCount > 0: Aplica SOFT DELETE pasando a estado 'retired' para no quebrar suscripciones ni históricos.
 * - Si activeTenantsCount === 0: Aplica HARD DELETE físico definitivo en PostgreSQL.
 *
 * Cumple estrictamente con la directiva AGENTS.md §4.8 (Title Case) y §4.15 (sin siglas de spec visibles).
 */
export function PlanDeleteModal({
  isOpen,
  onClose,
  plan,
  onSuccess,
}: PlanDeleteModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen || !plan) return null;

  const planName = (plan.name as { es?: string })?.es || plan.code;
  const tenantsCount = plan.activeTenantsCount ?? 0;
  const willRetire = tenantsCount > 0;

  async function handleConfirmDelete() {
    if (!plan) return;
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch(`/api/admin/plans?id=${plan.id}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Fallo al procesar la eliminación del plan");
      }

      setSuccess(true);
      router.refresh();
      if (onSuccess) onSuccess();

      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={isOpen && Boolean(plan)}
      onOpenChange={(open) => {
        if (!open && !loading) onClose();
      }}
    >
      <DialogContent
        className="max-w-lg p-6"
        disableEscapeKeyDown={loading}
        disableInteractOutside={loading}
      >
        <DialogHeader className="border-b border-[var(--dsn-border)] pb-3 mb-4 pr-8">
          <div className="flex items-center gap-2">
            {willRetire ? (
              <Archive className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            ) : (
              <Trash2 className="h-5 w-5 text-rose-600 dark:text-rose-400" />
            )}
            <DialogTitle className="text-base font-bold text-[var(--dsn-text)]">
              {willRetire ? "Retiro de Plan Comercial" : "Eliminación de Plan Comercial"}
            </DialogTitle>
          </div>
        </DialogHeader>

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert variant="success" className="mb-4">
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription className="text-xs">
              {willRetire
                ? "Plan retirado y archivado exitosamente. Suscripciones existentes preservadas."
                : "Plan eliminado definitivamente de la base de datos."}
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-4 text-xs text-[var(--dsn-text)]">
          <div className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] p-3.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[var(--dsn-text-secondary)]">Plan Seleccionado:</span>
              <span className="font-semibold text-[var(--dsn-text)]">{planName}</span>
            </div>
            <div className="flex items-center justify-between font-mono">
              <span className="text-[var(--dsn-text-secondary)]">Código Slug:</span>
              <span className="text-[var(--dsn-accent)]">{plan.code}</span>
            </div>
            <div className="flex items-center justify-between font-mono">
              <span className="text-[var(--dsn-text-secondary)]">Inquilinos Vinculados:</span>
              <span className="font-bold text-[var(--dsn-text)]">{tenantsCount}</span>
            </div>
          </div>

          {willRetire ? (
            <Alert variant="warning">
              <ShieldAlert className="h-5 w-5" />
              <AlertTitle>Salvaguarda De Integridad Comercial</AlertTitle>
              <AlertDescription className="text-[11px] leading-relaxed">
                Este plan cuenta con <strong>{tenantsCount} inquilino(s)</strong> activo(s).
                Para no invalidar suscripciones ni el histórico contable, el plan{" "}
                <strong>no se borrará físicamente</strong>, sino que pasará a estado{" "}
                <strong>Retirado (retired)</strong>, ocultándose de la landing page y nuevos registros.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert variant="destructive">
              <AlertTriangle className="h-5 w-5" />
              <AlertTitle>Eliminación Física Definitiva</AlertTitle>
              <AlertDescription className="text-[11px] leading-relaxed">
                Este plan <strong>no tiene ningún inquilino vinculado</strong>. Se eliminará físicamente
                de la base de datos de manera irreversible.
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter className="pt-4 border-t border-[var(--dsn-border)]">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={loading}
              className="min-h-[44px] text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant={willRetire ? "warning" : "destructive"}
              onClick={handleConfirmDelete}
              disabled={loading}
              loading={loading}
              className="min-h-[44px] text-xs"
            >
              {willRetire ? (
                <>
                  <Archive className="h-4 w-4" />
                  <span>Confirmar Y Retirar Plan</span>
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  <span>Eliminar Plan Definitivamente</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

