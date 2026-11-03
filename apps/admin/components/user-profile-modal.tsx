"use client";

import React, { useEffect, useCallback, useState } from "react";
import {
  User,
  ShieldCheck,
  Mail,
  Clock,
  Copy,
  Check,
  X,
  Shield,
  Activity,
  Calendar,
} from "lucide-react";

export interface CurrentUserDto {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  status: string;
  emailVerifiedAt?: string | null;
  sessionCreatedAt?: string;
  sessionExpiresAt?: string;
}

export interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: CurrentUserDto;
}

/**
 * Modal accesible de Ficha de Perfil de Usuario para mocter-admin (DSN-001, AUTH-001).
 *
 * Despliega información detallada del operador en sesión, rol de plataforma,
 * identificador único y diagnóstico de vigencia de la sesión activa.
 */
export function UserProfileModal({
  isOpen,
  onClose,
  user,
}: UserProfileModalProps): React.JSX.Element | null {
  const [copied, setCopied] = useState(false);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, handleKeyDown]);

  const copyUserId = () => {
    navigator.clipboard.writeText(user.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-profile-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-2xl max-h-[90vh] flex flex-col overflow-y-auto">
        {/* Cabecera del Modal */}
        <div className="flex items-center justify-between border-b border-[var(--dsn-border)] pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/30">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="user-profile-title"
                className="text-base font-bold text-[var(--dsn-text)]"
              >
                Ficha De Perfil Del Operador
              </h2>
              <p className="text-xs text-[var(--dsn-text-secondary)] mt-0.5">
                Plano de control y autoridad en el Router Global
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar modal"
            className="text-xs text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)] p-2 rounded-lg hover:bg-[var(--dsn-surface-secondary)] transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Cuerpo del Perfil */}
        <div className="space-y-4 text-xs text-[var(--dsn-text)]">
          {/* Tarjeta de Resumen con Avatar */}
          <div className="flex items-center gap-3 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 p-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--dsn-accent)] text-white font-bold text-sm shadow-md">
              {(user.displayName || user.email || "PO")
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")
                .toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-sm text-[var(--dsn-text)] truncate">
                {user.displayName || "Platform Owner"}
              </h3>
              <p className="text-xs text-[var(--dsn-text-secondary)] truncate">
                {user.email}
              </p>
              <div className="mt-1 flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-500/30">
                  <Shield className="h-2.5 w-2.5" />
                  {user.role}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] font-mono text-[var(--dsn-accent)] border border-cyan-500/20">
                  {user.status}
                </span>
              </div>
            </div>
          </div>

          {/* Atributos del Operador */}
          <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-4 space-y-3">
            <h4 className="text-[11px] font-semibold text-[var(--dsn-text-secondary)] uppercase tracking-wider">
              Identidad Y Permisos
            </h4>

            {/* Identificador UUID */}
            <div className="flex items-center justify-between gap-2 border-b border-[var(--dsn-border)]/50 pb-2">
              <span className="text-[var(--dsn-text-secondary)]">ID Único De Usuario:</span>
              <div className="flex items-center gap-1.5 font-mono text-[11px]">
                <span className="text-[var(--dsn-text)]">{user.id}</span>
                <button
                  type="button"
                  onClick={copyUserId}
                  title="Copiar ID"
                  aria-label="Copiar ID de usuario"
                  className="rounded p-1 text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-accent)] hover:bg-[var(--dsn-surface)] transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>

            {/* Correo Electrónico */}
            <div className="flex items-center justify-between border-b border-[var(--dsn-border)]/50 pb-2">
              <span className="text-[var(--dsn-text-secondary)]">Correo Electrónico:</span>
              <div className="flex items-center gap-1 text-[var(--dsn-text)] font-semibold">
                <Mail className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                <span>{user.email}</span>
              </div>
            </div>

            {/* Autoridad de Rol */}
            <div className="flex items-center justify-between">
              <span className="text-[var(--dsn-text-secondary)]">Rol De Plataforma:</span>
              <span className="font-semibold text-emerald-400 font-mono">
                {user.role} (Acceso Total)
              </span>
            </div>
          </div>

          {/* Diagnóstico de Sesión Activa */}
          <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-4 space-y-3">
            <h4 className="text-[11px] font-semibold text-[var(--dsn-text-secondary)] uppercase tracking-wider">
              Diagnóstico De Sesión Activa
            </h4>

            <div className="flex items-center justify-between border-b border-[var(--dsn-border)]/50 pb-2">
              <span className="text-[var(--dsn-text-secondary)]">Plano Operativo:</span>
              <span className="font-mono text-[var(--dsn-text)] flex items-center gap-1.5">
                <Activity className="h-3 w-3 text-emerald-400 animate-pulse" />
                Router Global (Core)
              </span>
            </div>

            <div className="flex items-center justify-between border-b border-[var(--dsn-border)]/50 pb-2">
              <span className="text-[var(--dsn-text-secondary)]">Tiempo De Inactividad:</span>
              <span className="font-mono text-[var(--dsn-text)]">30 Minutos (Sliding Window)</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[var(--dsn-text-secondary)]">Tope Absoluto De Sesión:</span>
              <span className="font-mono text-[var(--dsn-text)]">12 Horas Inmutables</span>
            </div>
          </div>
        </div>

        {/* Pie de Acciones */}
        <div className="flex items-center justify-end pt-5 border-t border-[var(--dsn-border)] mt-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-[var(--dsn-surface-secondary)] px-5 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:bg-[var(--dsn-border)] transition-colors min-h-[44px]"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

