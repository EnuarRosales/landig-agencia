"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Package,
  Users,
  ShoppingCart,
  HardDrive,
  Bot,
  Store,
  ArrowRight,
  PlusCircle,
  Settings,
  Sparkles,
} from "lucide-react";
import type { WorkspaceDashboardDto } from "@mocter/domain";

interface WorkspaceDashboardViewProps {
  initialData: WorkspaceDashboardDto | null;
}

export function WorkspaceDashboardView({ initialData }: WorkspaceDashboardViewProps) {
  const [data] = useState<WorkspaceDashboardDto | null>(initialData);

  const tenantName = data?.tenant.name || "Mi Comercio";
  const planName = data?.tenant.planName || "Plan Pro";
  const currency = data?.tenant.currency || "COP";
  const cellCode = data?.tenant.cellCode || "pg-cell-01";

  const metrics = data?.metrics || {
    productsCount: 0,
    contactsCount: 0,
    ordersCount: 0,
    storageBytesUsed: 0,
    storageQuotaBytes: 1073741824,
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 KB";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  return (
    <div className="w-full space-y-6 p-4 md:px-8 md:py-6">
      {/* Banner de Bienvenida y HUD del Comercio */}
      <header className="rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/30">
              <Store className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[var(--dsn-text)]">
                  {tenantName}
                </h1>
                <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400 border border-emerald-500/20">
                  {planName}
                </span>
              </div>
              <p className="text-xs md:text-sm text-[var(--dsn-text-secondary)] mt-0.5 font-mono">
                Nodo Celular: {cellCode} · Moneda Operativa: {currency}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/workspace/products"
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:opacity-90 transition-opacity"
            >
              <PlusCircle className="h-4 w-4" />
              <span>Nuevo Producto</span>
            </Link>
            <Link
              href="/workspace/bot"
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3.5 py-2 text-xs font-medium text-[var(--dsn-text)] hover:bg-[var(--dsn-border)]/40 transition-colors"
            >
              <Settings className="h-4 w-4" />
              <span>Ajustes Bot</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Tarjetas HUD de Métricas Operativas */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--dsn-text-secondary)]">Productos Activos</span>
            <div className="rounded-lg bg-cyan-500/10 p-2 text-cyan-400">
              <Package className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold font-mono text-[var(--dsn-text)]">
            {metrics.productsCount}
          </p>
          <div className="mt-2 flex items-center justify-between text-xs text-[var(--dsn-text-secondary)]">
            <Link href="/workspace/products" className="inline-flex items-center gap-1 text-[var(--dsn-accent)] hover:underline">
              <span>Gestionar catálogo</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--dsn-text-secondary)]">Contactos CRM</span>
            <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold font-mono text-[var(--dsn-text)]">
            {metrics.contactsCount}
          </p>
          <div className="mt-2 flex items-center justify-between text-xs text-[var(--dsn-text-secondary)]">
            <Link href="/workspace/contacts" className="inline-flex items-center gap-1 text-[var(--dsn-accent)] hover:underline">
              <span>Ver prospectos</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--dsn-text-secondary)]">Pedidos Registrados</span>
            <div className="rounded-lg bg-amber-500/10 p-2 text-amber-400">
              <ShoppingCart className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold font-mono text-[var(--dsn-text)]">
            {metrics.ordersCount}
          </p>
          <div className="mt-2 flex items-center justify-between text-xs text-[var(--dsn-text-secondary)]">
            <Link href="/workspace/orders" className="inline-flex items-center gap-1 text-[var(--dsn-accent)] hover:underline">
              <span>Historial ventas</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--dsn-text-secondary)]">Almacenamiento Usado</span>
            <div className="rounded-lg bg-purple-500/10 p-2 text-purple-400">
              <HardDrive className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold font-mono text-[var(--dsn-text)]">
            {formatBytes(metrics.storageBytesUsed)}
          </p>
          <div className="mt-2 flex items-center justify-between text-xs text-[var(--dsn-text-secondary)]">
            <span className="truncate">
              Tope: {metrics.storageQuotaBytes ? formatBytes(metrics.storageQuotaBytes) : "Ilimitado"}
            </span>
            <Link href="/workspace/billing" className="text-[var(--dsn-accent)] hover:underline shrink-0">
              Cuota
            </Link>
          </div>
        </div>
      </section>

      {/* Módulo de Asistente AI y Canales de Venta */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-xs">
          <div className="flex items-center justify-between pb-4 border-b border-[var(--dsn-border)]">
            <div className="flex items-center gap-2.5">
              <div className="rounded-lg bg-[var(--dsn-accent)]/15 p-2 text-[var(--dsn-accent)]">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-[var(--dsn-text)]">
                  Asistente Comercial Inteligente
                </h2>
                <p className="text-xs text-[var(--dsn-text-secondary)]">
                  Respuestas autónomas a clientes y captura de pedidos.
                </p>
              </div>
            </div>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400 border border-emerald-500/20">
              Activo
            </span>
          </div>

          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-[var(--dsn-surface-secondary)]/50 p-3 text-xs">
              <span className="text-[var(--dsn-text-secondary)]">Preset De Personalidad</span>
              <span className="font-semibold text-[var(--dsn-text)] capitalize">
                {(data?.bot.preset || "natural_rhythm").replace("_", " ")}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-[var(--dsn-surface-secondary)]/50 p-3 text-xs">
              <span className="text-[var(--dsn-text-secondary)]">Preguntas Frecuentes Configuradas</span>
              <span className="font-semibold text-[var(--dsn-text)]">
                {data?.bot.faqsCount ?? 0} preguntas
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-[var(--dsn-surface-secondary)]/50 p-3 text-xs">
              <span className="text-[var(--dsn-text-secondary)]">Recordatorios Automáticos</span>
              <span className="font-semibold text-[var(--dsn-text)]">
                {data?.bot.remindersEnabled ? "Habilitados" : "Deshabilitados"}
              </span>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-[var(--dsn-border)]">
            <Link
              href="/workspace/bot"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] py-2 text-xs font-semibold text-[var(--dsn-text)] hover:bg-[var(--dsn-border)]/40 transition-colors"
            >
              <span>Configurar Personalidad Y Políticas</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {/* Acciones Rápidas */}
        <div className="rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2.5 pb-4 border-b border-[var(--dsn-border)]">
              <div className="rounded-lg bg-amber-500/10 p-2 text-amber-400">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-[var(--dsn-text)]">
                  Acciones Rápidas Del Comercio
                </h2>
                <p className="text-xs text-[var(--dsn-text-secondary)]">
                  Operaciones cotidianas para impulsar tus ventas.
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Link
                href="/workspace/products"
                className="group flex flex-col justify-between rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-4 transition-all hover:border-[var(--dsn-accent)] hover:bg-[var(--dsn-accent)]/5"
              >
                <div>
                  <Package className="h-5 w-5 text-cyan-400 mb-2" />
                  <p className="text-xs font-bold text-[var(--dsn-text)] group-hover:text-[var(--dsn-accent)]">
                    Publicar Producto
                  </p>
                  <p className="text-[11px] text-[var(--dsn-text-secondary)] mt-0.5">
                    Sube fotos a SeaweedFS con firma automática.
                  </p>
                </div>
                <span className="text-[10px] text-[var(--dsn-accent)] mt-3 inline-flex items-center gap-1 font-semibold">
                  Ir al catálogo →
                </span>
              </Link>

              <Link
                href="/workspace/contacts"
                className="group flex flex-col justify-between rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-4 transition-all hover:border-[var(--dsn-accent)] hover:bg-[var(--dsn-accent)]/5"
              >
                <div>
                  <Users className="h-5 w-5 text-emerald-400 mb-2" />
                  <p className="text-xs font-bold text-[var(--dsn-text)] group-hover:text-[var(--dsn-accent)]">
                    Registrar Contacto
                  </p>
                  <p className="text-[11px] text-[var(--dsn-text-secondary)] mt-0.5">
                    Guarda clientes y prospectos comerciales.
                  </p>
                </div>
                <span className="text-[10px] text-[var(--dsn-accent)] mt-3 inline-flex items-center gap-1 font-semibold">
                  Ir a contactos →
                </span>
              </Link>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-[var(--dsn-border)] flex items-center justify-between text-xs text-[var(--dsn-text-secondary)]">
            <span>¿Necesitas ayuda con tu tienda?</span>
            <Link href="/workspace/team" className="text-[var(--dsn-accent)] font-semibold hover:underline">
              Gestionar equipo
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

