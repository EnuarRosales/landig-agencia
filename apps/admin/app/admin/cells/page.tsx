"use client";

import React, { useEffect, useState } from "react";
import { Server, Database, Activity, ShieldCheck } from "lucide-react";
import type { AdminCellDto, CellHostDto } from "@mocter/domain";
import { CreateCellForm } from "./create-cell-form";
import { CellActions } from "./cell-actions";
import { adminFetch } from "@/lib/api-client";

function getApiUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, "");
  }
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    const isProduction = process.env.NODE_ENV === "production";
    if (
      !isProduction &&
      (hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname.startsWith("192.168.") ||
        hostname.startsWith("10.") ||
        hostname.startsWith("172."))
    ) {
      return `${window.location.protocol}//${hostname}:3001/api`;
    }
  }
  return "https://mocter.co/api";
}

async function fetchCells(): Promise<{ ok: boolean; data?: AdminCellDto[]; error?: string }> {
  try {
    const res = await adminFetch(`${getApiUrl()}/admin/cells`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data.error || "Error al listar celdas" };
    }

    return await res.json();
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Error de conexión con el plano de control",
    };
  }
}

async function fetchCellHosts(): Promise<{ ok: boolean; data?: CellHostDto[]; error?: string }> {
  try {
    const res = await adminFetch(`${getApiUrl()}/admin/cell-hosts`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data.error || "Error al listar hosts" };
    }

    return await res.json();
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Error de conexión con cell-hosts",
    };
  }
}

/**
 * Vista de administración de celdas de datos multi-inquilino (DAT-001 §3.3).
 *
 * Cliente que consume la API protegida de apps/web con sesión y origen admin.
 * El listado y registro se delegan a `/api/admin/cells` en el origen de autenticación.
 */
export default function AdminCellsPage(): React.JSX.Element {
  const [cellsList, setCellsList] = useState<AdminCellDto[]>([]);
  const [hostsList, setHostsList] = useState<CellHostDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [cellsRes, hostsRes] = await Promise.all([fetchCells(), fetchCellHosts()]);
      if (!cellsRes.ok) {
        setError(cellsRes.error || "Error desconocido");
      } else {
        setCellsList(cellsRes.data || []);
      }
      if (hostsRes.ok && hostsRes.data) {
        setHostsList(hostsRes.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [cellsRes, hostsRes] = await Promise.all([fetchCells(), fetchCellHosts()]);
        if (cancelled) return;
        if (!cellsRes.ok) {
          setError(cellsRes.error || "Error desconocido");
        } else {
          setCellsList(cellsRes.data || []);
        }
        if (hostsRes.ok && hostsRes.data) {
          setHostsList(hostsRes.data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Error inesperado");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const totalCapacity = cellsList.reduce<number>(
    (acc: number, c: AdminCellDto) => acc + (c.maxClients ?? 0),
    0,
  );
  const totalOccupied = cellsList.reduce<number>(
    (acc: number, c: AdminCellDto) => acc + (c.currentClients ?? 0),
    0,
  );

  return (
    <div className="space-y-6 p-4 md:p-8 max-w-7xl mx-auto">
      {/* Encabezado */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--dsn-border)] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[var(--dsn-text)]">
              Células De Datos Multi-Inquilino
            </h1>
            <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-xs font-mono font-medium text-[var(--dsn-accent)] flex items-center gap-1 border border-cyan-500/20">
              Nodos Celulares
            </span>
          </div>
          <p className="text-xs md:text-sm text-[var(--dsn-text-secondary)] mt-1">
            Topes de capacidad, balanceo y aislamiento físico en nodos PostgreSQL 18 celulares.
          </p>
        </div>

        <CreateCellForm apiUrl={getApiUrl()} hosts={hostsList} onSuccess={refresh} />
      </header>

      {/* Métricas rápidas de infraestructura */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--dsn-text-secondary)]">Células Desplegadas</span>
            <Server className="h-4 w-4 text-[var(--dsn-accent)]" />
          </div>
          <p className="mt-2 text-2xl font-bold text-[var(--dsn-text)] font-mono">
            {cellsList.length}
          </p>
          <p className="text-[11px] text-[var(--dsn-text-secondary)] mt-0.5">
            Nodos registrados en Router
          </p>
        </div>

        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--dsn-text-secondary)]">Inquilinos En Celdas</span>
            <Database className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-[var(--dsn-text)] font-mono">
            {totalOccupied} / {totalCapacity || 100}
          </p>
          <p className="text-[11px] text-[var(--dsn-text-secondary)] mt-0.5">
            Ocupación consolidada
          </p>
        </div>

        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--dsn-text-secondary)]">Aislamiento RLS</span>
            <ShieldCheck className="h-4 w-4 text-purple-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-emerald-400 font-mono">
            100%
          </p>
          <p className="text-[11px] text-[var(--dsn-text-secondary)] mt-0.5">
            Particionado + Celda Cero
          </p>
        </div>
      </section>

      {/* Tabla de Células de Datos */}
      <section className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] overflow-hidden shadow-xs">
        <div className="px-5 py-4 border-b border-[var(--dsn-border)] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--dsn-text)]">
            Inventario De Células
          </h2>
          <span className="text-xs text-[var(--dsn-text-secondary)] font-mono">
            {cellsList.length} {cellsList.length === 1 ? "registro" : "registros"}
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <Activity className="h-10 w-10 text-[var(--dsn-text-secondary)]/50 mx-auto mb-3 animate-spin" />
            <h3 className="text-sm font-semibold text-[var(--dsn-text)]">
              Cargando células...
            </h3>
          </div>
        ) : error ? (
          <div className="p-12 text-center">
            <Server className="h-10 w-10 text-red-400/50 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-[var(--dsn-text)]">
              Error al cargar celdas
            </h3>
            <p className="text-xs text-[var(--dsn-text-secondary)] mt-1 max-w-sm mx-auto">
              {error}
            </p>
          </div>
        ) : cellsList.length === 0 ? (
          <div className="p-12 text-center">
            <Server className="h-10 w-10 text-[var(--dsn-text-secondary)]/50 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-[var(--dsn-text)]">
              No hay células de datos registradas
            </h3>
            <p className="text-xs text-[var(--dsn-text-secondary)] mt-1 max-w-sm mx-auto">
              Registra la primera célula de almacenamiento para permitir el aprovisionamiento de inquilinos durante el onboarding.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--dsn-surface-secondary)] text-[var(--dsn-text-secondary)] border-b border-[var(--dsn-border)]">
                <tr>
                  <th className="py-3 px-4 font-semibold">Código</th>
                  <th className="py-3 px-4 font-semibold">Host Anfitrión</th>
                  <th className="py-3 px-4 font-semibold">Nivel</th>
                  <th className="py-3 px-4 font-semibold">Topología</th>
                  <th className="py-3 px-4 font-semibold">Host / PgBouncer</th>
                  <th className="py-3 px-4 font-semibold">Base De Datos</th>
                  <th className="py-3 px-4 font-semibold">Capacidad</th>
                  <th className="py-3 px-4 font-semibold">Región</th>
                  <th className="py-3 px-4 font-semibold">Estado</th>
                  <th className="py-3 px-4 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--dsn-border)]">
                {cellsList.map((c: AdminCellDto) => {
                  const percent = Math.round((c.currentClients / c.maxClients) * 100);
                  
                  const getStatusBadge = (status: string) => {
                    switch (status) {
                      case "active":
                        return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
                      case "draft":
                        return "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20";
                      case "provisioning":
                        return "bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse";
                      case "verifying":
                        return "bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse";
                      case "draining":
                        return "bg-orange-500/10 text-orange-400 border border-orange-500/20";
                      case "maintenance":
                        return "bg-purple-500/10 text-purple-400 border border-purple-500/20";
                      case "error_connection":
                        return "bg-red-500/10 text-red-400 border border-red-500/20";
                      default:
                        return "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20";
                    }
                  };

                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-[var(--dsn-surface-secondary)]/50 transition-colors"
                    >
                      <td className="py-3.5 px-4 font-mono font-medium text-[var(--dsn-accent)]">
                        {c.code}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[var(--dsn-text)]">
                        {hostsList.find((h) => h.id === c.hostId)?.code || (
                          <span className="text-[var(--dsn-text-secondary)] italic">Sin Asignar</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-medium ${
                          c.tier === "dedicated"
                            ? "bg-purple-500/15 text-purple-400 border border-purple-500/20"
                            : "bg-blue-500/15 text-blue-400 border border-blue-500/20"
                        }`}>
                          {c.tier}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-[var(--dsn-text-secondary)]">
                        {c.topologyType}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[var(--dsn-text)]">
                        {c.pgbouncerHost}:{c.pgbouncerPort}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[var(--dsn-text)]">
                        {c.databaseName}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[var(--dsn-text)]">
                            {c.currentClients} / {c.maxClients}
                          </span>
                          <span className="text-[10px] text-[var(--dsn-text-secondary)] font-mono">
                            ({percent}%)
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-[var(--dsn-text-secondary)]">
                        {c.region}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-mono font-medium ${getStatusBadge(c.status)}`}>
                          <Activity className="h-3 w-3" /> {c.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <CellActions cell={c} hosts={hostsList} apiUrl={getApiUrl()} onRefresh={refresh} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
