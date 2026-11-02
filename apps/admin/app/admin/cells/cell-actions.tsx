"use client";

import React, { useState } from "react";
import {
  Activity,
  FileCode2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  X,
  Copy,
  Check,
  PowerOff,
} from "lucide-react";
import type { AdminCellDto } from "@mocter/domain";

interface CellActionsProps {
  cell: AdminCellDto;
  apiUrl: string;
  onRefresh: () => void;
}

interface ManifestData {
  cellId: string;
  code: string;
  workingDir: string;
  deployUser: string;
  envContent: string;
  dockerComposeContent: string;
  instructions: string[];
}

/**
 * Obtiene el token CSRF desde la API protegida de apps/web.
 */
async function fetchCsrfToken(apiUrl: string): Promise<string> {
  const res = await fetch(`${apiUrl}/auth/csrf`, {
    method: "GET",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "No se pudo obtener el token CSRF");
  }

  const data = await res.json();
  if (!data.ok || !data.csrfToken) {
    throw new Error("Respuesta CSRF inválida");
  }
  return data.csrfToken;
}

export function CellActions({ cell, apiUrl, onRefresh }: CellActionsProps) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [manifestModalOpen, setManifestModalOpen] = useState(false);
  const [handshakeModalOpen, setHandshakeModalOpen] = useState(false);
  const [manifestData, setManifestData] = useState<ManifestData | null>(null);
  const [handshakeResult, setHandshakeResult] = useState<any | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"compose" | "env" | "instructions">("compose");
  const [copied, setCopied] = useState<string | null>(null);

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }

  async function handleExecuteHandshake() {
    setLoadingAction("handshake");
    setErrorMsg(null);
    setHandshakeResult(null);
    try {
      const csrf = await fetchCsrfToken(apiUrl);
      const res = await fetch(`${apiUrl}/admin/cells/${cell.id}/handshake`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrf,
        },
      });

      const body = await res.json();
      setHandshakeResult(body.data || body);
      setHandshakeModalOpen(true);
      onRefresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al ejecutar handshake.";
      setErrorMsg(msg);
      setHandshakeModalOpen(true);
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleLoadManifest() {
    setLoadingAction("manifest");
    setErrorMsg(null);
    try {
      const res = await fetch(`${apiUrl}/admin/cells/${cell.id}/manifest`, {
        method: "GET",
        credentials: "include",
      });

      const body = await res.json();
      if (!res.ok || !body.ok) {
        throw new Error(body.error || "No se pudo obtener el manifiesto.");
      }
      setManifestData(body.data);
      setManifestModalOpen(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al cargar manifiesto.";
      alert(msg);
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleDrainCell() {
    if (!confirm(`¿Estás seguro de drenar la célula "${cell.code}"? No recibirá más altas de inquilinos.`)) {
      return;
    }

    setLoadingAction("drain");
    try {
      const csrf = await fetchCsrfToken(apiUrl);
      const res = await fetch(`${apiUrl}/admin/cells/${cell.id}/action`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrf,
        },
        body: JSON.stringify({ action: "drain" }),
      });

      const body = await res.json();
      if (!res.ok || !body.ok) {
        throw new Error(body.error || "No se pudo actualizar estado a drenando.");
      }
      onRefresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al drenar célula.";
      alert(msg);
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <>
      <div className="flex items-center gap-1.5 justify-end">
        {/* Botón Ver Manifiesto */}
        <button
          type="button"
          onClick={handleLoadManifest}
          disabled={loadingAction !== null}
          title="Ver Manifiesto y Archivos de Despliegue"
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface-secondary)] hover:text-[var(--dsn-text)] transition-colors border border-[var(--dsn-border)]"
        >
          <FileCode2 className="h-3.5 w-3.5" />
          <span>Manifiesto</span>
        </button>

        {/* Botón Handshake */}
        <button
          type="button"
          onClick={handleExecuteHandshake}
          disabled={loadingAction !== null}
          title="Verificar y Activar Handshake 360°"
          className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all border ${
            cell.status === "active"
              ? "bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)] border-[var(--dsn-accent)]/30 hover:bg-[var(--dsn-accent)]/25"
              : "bg-amber-500/15 text-amber-500 border-amber-500/30 hover:bg-amber-500/25 animate-pulse"
          }`}
        >
          <RefreshCw className={`h-3 w-3 ${loadingAction === "handshake" ? "animate-spin" : ""}`} />
          <span>{cell.status === "active" ? "Reverificar" : "Handshake"}</span>
        </button>

        {/* Botón Drenar (si está activa) */}
        {cell.status === "active" && (
          <button
            type="button"
            onClick={handleDrainCell}
            disabled={loadingAction !== null}
            title="Drenar Célula (no admitir más inquilinos)"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/30 transition-colors border border-transparent"
          >
            <PowerOff className="h-3 w-3" />
            <span>Drenar</span>
          </button>
        )}
      </div>

      {/* Modal de Manifiesto */}
      {manifestModalOpen && manifestData && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
        >
          <div className="relative w-full max-w-3xl rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] shadow-2xl p-6 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-[var(--dsn-border)] pb-4 mb-4">
              <div>
                <h3 className="text-base font-bold text-[var(--dsn-text)] flex items-center gap-2">
                  <FileCode2 className="h-5 w-5 text-[var(--dsn-accent)]" />
                  Manifiesto De Despliegue · {manifestData.code}
                </h3>
                <p className="text-xs text-[var(--dsn-text-secondary)] mt-0.5">
                  Directorio: <code className="font-mono text-[var(--dsn-accent)]">{manifestData.workingDir}</code> · Usuario: <code className="font-mono">{manifestData.deployUser}</code>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setManifestModalOpen(false)}
                className="rounded-lg p-1 text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface-secondary)] hover:text-[var(--dsn-text)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Selector de pestañas */}
            <div className="flex gap-2 border-b border-[var(--dsn-border)] pb-2 mb-4">
              <button
                type="button"
                onClick={() => setActiveTab("compose")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  activeTab === "compose"
                    ? "bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/30"
                    : "text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface-secondary)]"
                }`}
              >
                docker-compose.cell.yml
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("env")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  activeTab === "env"
                    ? "bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/30"
                    : "text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface-secondary)]"
                }`}
              >
                .env.cell
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("instructions")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  activeTab === "instructions"
                    ? "bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/30"
                    : "text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface-secondary)]"
                }`}
              >
                Instrucciones En Host
              </button>
            </div>

            {/* Contenido de la pestaña */}
            <div className="flex-1 overflow-y-auto space-y-4">
              {activeTab === "compose" && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => copyToClipboard(manifestData.dockerComposeContent, "compose")}
                    className="absolute top-2 right-2 inline-flex items-center gap-1 rounded bg-[var(--dsn-surface)]/90 px-2.5 py-1 text-xs font-semibold border border-[var(--dsn-border)] shadow-xs hover:text-[var(--dsn-accent)]"
                  >
                    {copied === "compose" ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copied === "compose" ? "Copiado" : "Copiar"}</span>
                  </button>
                  <pre className="p-4 rounded-lg bg-[var(--dsn-surface-secondary)] border border-[var(--dsn-border)] font-mono text-xs overflow-x-auto text-[var(--dsn-text)] leading-relaxed">
                    {manifestData.dockerComposeContent}
                  </pre>
                </div>
              )}

              {activeTab === "env" && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => copyToClipboard(manifestData.envContent, "env")}
                    className="absolute top-2 right-2 inline-flex items-center gap-1 rounded bg-[var(--dsn-surface)]/90 px-2.5 py-1 text-xs font-semibold border border-[var(--dsn-border)] shadow-xs hover:text-[var(--dsn-accent)]"
                  >
                    {copied === "env" ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copied === "env" ? "Copiado" : "Copiar"}</span>
                  </button>
                  <pre className="p-4 rounded-lg bg-[var(--dsn-surface-secondary)] border border-[var(--dsn-border)] font-mono text-xs overflow-x-auto text-[var(--dsn-text)] leading-relaxed">
                    {manifestData.envContent}
                  </pre>
                </div>
              )}

              {activeTab === "instructions" && (
                <div className="space-y-3 p-2">
                  <h4 className="text-xs font-bold text-[var(--dsn-text)]">
                    Pasos De Ejecución En Producción (Usuario deploy:1000):
                  </h4>
                  <ol className="list-decimal list-inside space-y-2 text-xs text-[var(--dsn-text-secondary)]">
                    {manifestData.instructions.map((step, idx) => (
                      <li key={idx} className="leading-relaxed">
                        <span className="text-[var(--dsn-text)]">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-4 border-t border-[var(--dsn-border)] mt-4">
              <button
                type="button"
                onClick={() => setManifestModalOpen(false)}
                className="rounded-lg bg-[var(--dsn-surface-secondary)] px-4 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:bg-[var(--dsn-border)]"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Resultado de Handshake */}
      {handshakeModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
        >
          <div className="relative w-full max-w-lg rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] shadow-2xl p-6 flex flex-col">
            <div className="flex items-center justify-between border-b border-[var(--dsn-border)] pb-4 mb-4">
              <div className="flex items-center gap-2">
                {handshakeResult?.ok ? (
                  <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                ) : (
                  <AlertTriangle className="h-6 w-6 text-rose-400" />
                )}
                <div>
                  <h3 className="text-sm font-bold text-[var(--dsn-text)]">
                    {handshakeResult?.ok ? "Handshake Exitoso" : "Fallo De Handshake 360°"}
                  </h3>
                  <p className="text-xs text-[var(--dsn-text-secondary)]">
                    Célula: {cell.code} ({cell.topologyType})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setHandshakeModalOpen(false)}
                className="rounded-lg p-1 text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface-secondary)] hover:text-[var(--dsn-text)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 py-2 text-xs">
              {errorMsg ? (
                <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-rose-300">
                  {errorMsg}
                </div>
              ) : (
                <>
                  <div className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[var(--dsn-text)]">1. Probe Base De Datos (PgBouncer):</span>
                      <span className={`font-mono text-[11px] font-bold ${handshakeResult?.diagnostic?.db?.ok ? "text-emerald-400" : "text-rose-400"}`}>
                        {handshakeResult?.diagnostic?.db?.ok ? `OK (${handshakeResult.diagnostic.db.latencyMs}ms)` : "FALLÓ"}
                      </span>
                    </div>
                    {handshakeResult?.diagnostic?.db?.error && (
                      <p className="text-[11px] text-rose-300 font-mono pl-3 border-l-2 border-rose-500/40">
                        {handshakeResult.diagnostic.db.error}
                      </p>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-[var(--dsn-border)]">
                      <span className="font-semibold text-[var(--dsn-text)]">2. Probe Aplicación HTTP (/api/health):</span>
                      <span className={`font-mono text-[11px] font-bold ${handshakeResult?.diagnostic?.app?.ok ? "text-emerald-400" : "text-rose-400"}`}>
                        {handshakeResult?.diagnostic?.app?.ok ? `OK (${handshakeResult.diagnostic.app.latencyMs}ms)` : "FALLÓ"}
                      </span>
                    </div>
                    {handshakeResult?.diagnostic?.app?.error && (
                      <p className="text-[11px] text-rose-300 font-mono pl-3 border-l-2 border-rose-500/40">
                        {handshakeResult.diagnostic.app.error}
                      </p>
                    )}
                  </div>

                  <p className="text-[11px] text-[var(--dsn-text-secondary)] leading-relaxed">
                    {handshakeResult?.ok
                      ? `La célula fue activada correctamente y se encuentra disponible para la asignación de inquilinos en el Router Global.`
                      : `La célula permanece en estado "error_connection". Corrige los problemas de red o certificados antes de reintentar.`}
                  </p>
                </>
              )}
            </div>

            <div className="flex justify-end pt-4 border-t border-[var(--dsn-border)] mt-4">
              <button
                type="button"
                onClick={() => setHandshakeModalOpen(false)}
                className="rounded-lg bg-[var(--dsn-surface-secondary)] px-4 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:bg-[var(--dsn-border)]"
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
