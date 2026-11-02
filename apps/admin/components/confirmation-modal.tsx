"use client";

import React, { useEffect, useCallback } from "react";
import {
  AlertTriangle,
  Archive,
  Trash2,
  RefreshCw,
  ShieldAlert,
  Info,
  Loader2,
  X,
  CheckCircle2,
} from "lucide-react";

export interface ConfirmationModalDetail {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}

export interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  subtitle?: string;
  variant?: "danger" | "warning" | "neutral";
  icon?: React.ReactNode;
  details?: ConfirmationModalDetail[];
  warningTitle?: string;
  warningMessage?: string | React.ReactNode;
  confirmText?: string;
  confirmLoadingText?: string;
  cancelText?: string;
  loading?: boolean;
  error?: string | null;
  success?: string | null;
}

/**
 * Modal reutilizable para confirmaciones críticas, advertencias y flujos destructivos (Regla 4.17).
 *
 * Implementa estrictamente:
 * - Tokens del sistema de diseño Mocter (`--dsn-*`).
 * - Formato Title Case para encabezados y botones.
 * - Tarjeta de resumen de atributos del recurso.
 * - Banner contextual con niveles de riesgo (rose para destrucción, amber para drenado/retiro).
 * - Cero uso de `window.alert()` o `window.confirm()`.
 */
export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  subtitle,
  variant = "danger",
  icon,
  details = [],
  warningTitle,
  warningMessage,
  confirmText = "Confirmar",
  confirmLoadingText = "Procesando...",
  cancelText = "Cancelar",
  loading = false,
  error = null,
  success = null,
}: ConfirmationModalProps) {
  // Manejo de tecla ESC para accesibilidad
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) {
        onClose();
      }
    },
    [loading, onClose],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  // Icono por defecto según variante
  const renderIcon = () => {
    if (icon) return icon;
    switch (variant) {
      case "danger":
        return <Trash2 className="h-5 w-5 text-rose-600 dark:text-rose-400" />;
      case "warning":
        return <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400" />;
      case "neutral":
      default:
        return <RefreshCw className="h-5 w-5 text-[var(--dsn-accent)]" />;
    }
  };

  // Botón de confirmación según variante
  const confirmButtonClass = () => {
    switch (variant) {
      case "danger":
        return "bg-rose-600 hover:bg-rose-500 text-white";
      case "warning":
        return "bg-amber-600 hover:bg-amber-500 text-white";
      case "neutral":
      default:
        return "bg-[var(--dsn-accent)] hover:opacity-90 text-white";
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirmation-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-lg rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-2xl">
        {/* Encabezado */}
        <div className="flex items-center justify-between border-b border-[var(--dsn-border)] pb-3 mb-4">
          <div className="flex items-center gap-2.5">
            {renderIcon()}
            <div>
              <h2
                id="confirmation-modal-title"
                className="text-base font-bold text-[var(--dsn-text)] leading-tight"
              >
                {title}
              </h2>
              {subtitle && (
                <p className="text-xs text-[var(--dsn-text-secondary)] mt-0.5">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="Cerrar modal"
            className="text-xs text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)] p-2 rounded-lg hover:bg-[var(--dsn-surface-secondary)] transition-colors disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Banner de Error en el Modal */}
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 p-3 text-xs text-rose-800 dark:text-rose-300">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Banner de Éxito en el Modal */}
        {success && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 p-3 text-xs text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{success}</span>
          </div>
        )}

        {/* Cuerpo del Modal */}
        <div className="space-y-4 text-xs text-[var(--dsn-text)]">
          {/* Tarjeta de Metadatos del Recurso */}
          {details.length > 0 && (
            <div className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] p-3.5 space-y-1.5">
              {details.map((item: ConfirmationModalDetail, idx: number) => (
                <div
                  key={idx}
                  className={`flex items-center justify-between ${
                    item.mono ? "font-mono" : ""
                  }`}
                >
                  <span className="text-[var(--dsn-text-secondary)]">
                    {item.label}:
                  </span>
                  <span className="font-semibold text-[var(--dsn-text)]">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Banner de Advertencia / Salvaguarda Contextual */}
          {warningMessage && (
            <div
              className={`flex items-start gap-2.5 rounded-lg p-3.5 ${
                variant === "danger"
                  ? "border border-rose-300 dark:border-rose-500/30 bg-rose-50/80 dark:bg-rose-500/10 text-rose-900 dark:text-rose-300"
                  : "border border-amber-300 dark:border-amber-500/30 bg-amber-50/80 dark:bg-amber-500/10 text-amber-900 dark:text-amber-300"
              }`}
            >
              {variant === "danger" ? (
                <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
              ) : (
                <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              )}
              <div className="space-y-1">
                {warningTitle && (
                  <p
                    className={`font-semibold ${
                      variant === "danger"
                        ? "text-rose-900 dark:text-rose-200"
                        : "text-amber-900 dark:text-amber-200"
                    }`}
                  >
                    {warningTitle}
                  </p>
                )}
                <div
                  className={`text-[11px] leading-relaxed ${
                    variant === "danger"
                      ? "text-rose-800 dark:text-rose-200/90"
                      : "text-amber-800 dark:text-amber-200/90"
                  }`}
                >
                  {warningMessage}
                </div>
              </div>
            </div>
          )}

          {/* Pie de Acciones */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--dsn-border)]">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-lg border border-[var(--dsn-border)] bg-transparent px-4 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)] min-h-[44px] transition-colors disabled:opacity-50"
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={() => onConfirm()}
              disabled={loading}
              className={`inline-flex min-h-[44px] items-center gap-2 rounded-lg px-5 py-2 text-xs font-semibold shadow-sm transition-all disabled:opacity-50 ${confirmButtonClass()}`}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>{loading ? confirmLoadingText : confirmText}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

