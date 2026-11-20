"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "./alert";
import { Button } from "./button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog";

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
 * Modal reutilizable sobre `<Dialog />` y `<Button />` para confirmaciones críticas, advertencias y flujos destructivos (`AGENTS.md §4.17`).
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
  const renderIcon = () => {
    if (icon) return icon;
    switch (variant) {
      case "danger":
        return <Trash2 className="h-5 w-5 text-rose-600 dark:text-rose-400" aria-hidden="true" />;
      case "warning":
        return (
          <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        );
      case "neutral":
      default:
        return <RefreshCw className="h-5 w-5 text-[var(--dsn-accent)]" aria-hidden="true" />;
    }
  };

  const confirmVariant =
    variant === "danger" ? "destructive" : variant === "warning" ? "warning" : "primary";

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !loading) {
          onClose();
        }
      }}
    >
      <DialogContent
        disableEscapeKeyDown={loading}
        disableInteractOutside={loading}
        closeAriaLabel="Cerrar modal"
        aria-describedby={subtitle ? undefined : undefined}
        className="max-w-lg"
      >
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            {renderIcon()}
            <div>
              <DialogTitle id="confirmation-modal-title">{title}</DialogTitle>
              {subtitle && <DialogDescription className="mt-0.5">{subtitle}</DialogDescription>}
            </div>
          </div>
        </DialogHeader>

        {error && (
          <Alert variant="error" role="alert" className="mb-4">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert variant="success" className="mb-4">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4 text-xs text-[var(--dsn-text)]">
          {details.length > 0 && (
            <div className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] p-3.5 space-y-1.5">
              {details.map((item, idx) => (
                <div
                  key={idx}
                  className={`flex items-center justify-between ${item.mono ? "font-mono" : ""}`}
                >
                  <span className="text-[var(--dsn-text-secondary)]">{item.label}:</span>
                  <span className="font-semibold text-[var(--dsn-text)]">{item.value}</span>
                </div>
              ))}
            </div>
          )}

          {warningMessage && (
            <div
              className={`flex items-start gap-2.5 rounded-lg p-3.5 ${
                variant === "danger"
                  ? "border border-rose-300 dark:border-rose-500/30 bg-rose-50/80 dark:bg-rose-500/10 text-rose-900 dark:text-rose-300"
                  : "border border-amber-300 dark:border-amber-500/30 bg-amber-50/80 dark:bg-amber-500/10 text-amber-900 dark:text-amber-300"
              }`}
            >
              {variant === "danger" ? (
                <AlertTriangle
                  className="h-5 w-5 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400"
                  aria-hidden="true"
                />
              ) : (
                <ShieldAlert
                  className="h-5 w-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400"
                  aria-hidden="true"
                />
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
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={onClose}
            disabled={loading}
          >
            {cancelText}
          </Button>
          <Button
            type="button"
            variant={confirmVariant}
            size="lg"
            onClick={() => void onConfirm()}
            loading={loading}
            loadingText={confirmLoadingText}
          >
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
