"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle, Loader2, PlayCircle, ShieldAlert } from "lucide-react";

interface TenantActionsProps {
  clientId: string;
  clientName: string;
  currentStatus: "alta" | "activo" | "suspendido" | "baja";
}

/**
 * Control interactivo de acciones de ciclo de vida de inquilinos (ADM-001 T-06).
 */
export function TenantActions({ clientId, clientName, currentStatus }: TenantActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState<"suspend" | "reactivate" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleStatusChange(newStatus: "activo" | "suspendido" | "baja") {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_lifecycle",
          clientId,
          lifecycleStatus: newStatus,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Fallo al actualizar estado del inquilino");
      }

      setConfirming(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-1.5 justify-end">
      {error && (
        <span className="text-[10px] text-rose-400 mr-1" title={error}>
          Error
        </span>
      )}

      {currentStatus === "activo" && (
        <>
          {confirming === "suspend" ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={loading}
                onClick={() => handleStatusChange("suspendido")}
                className="inline-flex items-center gap-1 rounded bg-rose-500/20 px-2 py-1 text-[11px] font-medium text-rose-300 hover:bg-rose-500/30"
              >
                {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <AlertTriangle className="h-3 w-3" />}
                Confirmar
              </button>
              <button
                type="button"
                onClick={() => setConfirming(null)}
                className="rounded px-1.5 py-1 text-[11px] text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming("suspend")}
              className="inline-flex items-center gap-1 rounded border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-400 hover:bg-rose-500/20 transition-colors"
            >
              <ShieldAlert className="h-3 w-3" />
              <span>Suspender</span>
            </button>
          )}
        </>
      )}

      {(currentStatus === "suspendido" || currentStatus === "alta") && (
        <>
          {confirming === "reactivate" ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={loading}
                onClick={() => handleStatusChange("activo")}
                className="inline-flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-1 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/30"
              >
                {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                Reactivar
              </button>
              <button
                type="button"
                onClick={() => setConfirming(null)}
                className="rounded px-1.5 py-1 text-[11px] text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming("reactivate")}
              className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors"
            >
              <PlayCircle className="h-3 w-3" />
              <span>Reactivar</span>
            </button>
          )}
        </>
      )}
    </div>
  );
}
