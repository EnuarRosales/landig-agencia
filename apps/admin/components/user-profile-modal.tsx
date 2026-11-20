"use client";

import React, { useState } from "react";
import { ShieldCheck, Mail, Copy, Check, Shield, Activity } from "lucide-react";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@mocter/ui";

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
 * Modal accesible de Ficha de Perfil de Usuario para `mocter-admin` sobre `<Dialog />` de `@mocter/ui`.
 */
export function UserProfileModal({
  isOpen,
  onClose,
  user,
}: UserProfileModalProps): React.JSX.Element {
  const [copied, setCopied] = useState(false);

  const copyUserId = () => {
    navigator.clipboard.writeText(user.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-lg rounded-2xl" closeAriaLabel="Cerrar modal">
        <DialogHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/30">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <DialogTitle id="user-profile-title">Ficha De Perfil Del Operador</DialogTitle>
              <DialogDescription className="mt-0.5">
                Plano de control y autoridad en el Router Global
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 text-xs text-[var(--dsn-text)]">
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
              <p className="text-xs text-[var(--dsn-text-secondary)] truncate">{user.email}</p>
              <div className="mt-1 flex items-center gap-2">
                <Badge variant="success" className="text-[10px]">
                  <Shield className="h-2.5 w-2.5" aria-hidden="true" />
                  {user.role}
                </Badge>
                <Badge variant="accent" className="font-mono text-[10px]">
                  {user.status}
                </Badge>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-4 space-y-3">
            <h4 className="text-[11px] font-semibold text-[var(--dsn-text-secondary)] tracking-wider">
              Identidad y Permisos
            </h4>

            <div className="flex items-center justify-between gap-2 border-b border-[var(--dsn-border)]/50 pb-2">
              <span className="text-[var(--dsn-text-secondary)]">ID Único de Usuario:</span>
              <div className="flex items-center gap-1.5 font-mono text-[11px]">
                <span className="text-[var(--dsn-text)]">{user.id}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={copyUserId}
                  title="Copiar ID"
                  aria-label="Copiar ID de usuario"
                  className="min-h-[32px] min-w-[32px] p-1"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between border-b border-[var(--dsn-border)]/50 pb-2">
              <span className="text-[var(--dsn-text-secondary)]">Correo Electrónico:</span>
              <div className="flex items-center gap-1 text-[var(--dsn-text)] font-semibold">
                <Mail className="h-3.5 w-3.5 text-[var(--dsn-accent)]" aria-hidden="true" />
                <span>{user.email}</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[var(--dsn-text-secondary)]">Rol de Plataforma:</span>
              <span className="font-semibold text-emerald-400 font-mono">
                {user.role} (Acceso Total)
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-4 space-y-3">
            <h4 className="text-[11px] font-semibold text-[var(--dsn-text-secondary)] tracking-wider">
              Diagnóstico de Sesión Activa
            </h4>

            <div className="flex items-center justify-between border-b border-[var(--dsn-border)]/50 pb-2">
              <span className="text-[var(--dsn-text-secondary)]">Plano Operativo:</span>
              <span className="font-mono text-[var(--dsn-text)] flex items-center gap-1.5">
                <Activity className="h-3 w-3 text-emerald-400 animate-pulse" aria-hidden="true" />
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

        <DialogFooter className="pt-5 mt-5">
          <Button type="button" variant="secondary" size="lg" onClick={onClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
