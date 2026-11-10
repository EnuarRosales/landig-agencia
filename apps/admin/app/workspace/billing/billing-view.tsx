"use client";

import React, { useState } from "react";
import { CreditCard, CheckCircle2, Shield, Zap, Sparkles } from "lucide-react";
import type { WorkspaceBillingDto } from "@mocter/domain";

interface BillingViewProps {
  initialBilling: WorkspaceBillingDto | null;
}

export function BillingView({ initialBilling }: BillingViewProps) {
  const [billing] = useState<WorkspaceBillingDto | null>(initialBilling);

  const planName = billing?.plan.name || "Plan Pro";
  const planDesc = billing?.plan.description || "Plan operativo para comercios activos en Mocter.";
  const quotas = billing?.quotas || [];
  const capabilities = billing?.capabilities || {};

  const formatQuotaValue = (val: number, unit: string) => {
    if (unit === "bytes") {
      const mb = val / (1024 * 1024);
      if (mb < 1024) return `${mb.toFixed(1)} MB`;
      return `${(mb / 1024).toFixed(2)} GB`;
    }
    return val.toLocaleString("es-CO");
  };

  return (
    <div className="w-full space-y-6 p-4 md:px-8 md:py-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--dsn-border)] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[var(--dsn-text)]">
              Mi Plan Y Cuotas Operativas
            </h1>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-mono font-medium text-emerald-400 border border-emerald-500/20">
              Suscripción Activa
            </span>
          </div>
          <p className="text-xs md:text-sm text-[var(--dsn-text-secondary)] mt-1">
            Supervisión de consumo de recursos y capacidades habilitadas según tu plan contratado.
          </p>
        </div>
      </header>

      {/* Tarjeta del Plan Activo */}
      <section className="rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <CreditCard className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-[var(--dsn-text)]">{planName}</h2>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
                  Activo
                </span>
              </div>
              <p className="text-xs text-[var(--dsn-text-secondary)] mt-0.5 max-w-md">
                {planDesc}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Barras de Consumo de Cuotas */}
      <section className="rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-xs">
        <h2 className="text-sm font-bold text-[var(--dsn-text)] mb-4">
          Límites Y Consumo De Recursos
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {quotas.map((q) => {
            const percentage = q.limit ? Math.min(100, Math.round((q.used / q.limit) * 100)) : 0;
            return (
              <div
                key={q.dimension}
                className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--dsn-text)]">{q.label}</span>
                  <span className="text-xs font-mono font-semibold text-[var(--dsn-accent)]">
                    {percentage}%
                  </span>
                </div>

                <div className="mt-3 h-2 w-full rounded-full bg-[var(--dsn-border)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[var(--dsn-accent)] transition-all duration-300"
                    style={{ width: `${percentage}%` }}
                  />
                </div>

                <p className="mt-2 text-[11px] font-mono text-[var(--dsn-text-secondary)]">
                  {formatQuotaValue(q.used, q.unit)} / {q.limit ? formatQuotaValue(q.limit, q.unit) : "Ilimitado"}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Funcionalidades Incluidas */}
      <section className="rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-xs">
        <h2 className="text-sm font-bold text-[var(--dsn-text)] mb-3">
          Capacidades Habilitadas En Tu Comercio
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
          {Object.entries(capabilities).map(([key, enabled]) => (
            <div
              key={key}
              className={`flex items-center gap-2 rounded-lg p-2.5 text-xs border ${
                enabled
                  ? "border-emerald-500/20 bg-emerald-500/5 text-[var(--dsn-text)]"
                  : "border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 text-[var(--dsn-text-secondary)] opacity-60"
              }`}
            >
              <CheckCircle2
                className={`h-4 w-4 shrink-0 ${enabled ? "text-emerald-400" : "text-[var(--dsn-text-secondary)]"}`}
              />
              <span className="font-medium capitalize">{key.replace(/_/g, " ")}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

