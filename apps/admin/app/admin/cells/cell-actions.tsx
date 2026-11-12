"use client";

import React, { useState } from "react";
import {
  FileCode2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  X,
  Copy,
  Check,
  PowerOff,
  Pencil,
  Trash2,
  AlertCircle,
  Loader2,
  GitBranch,
} from "lucide-react";
import type { AdminCellDto, CellHostDto } from "@mocter/domain";
import { ConfirmationModal } from "@/components/confirmation-modal";
import { adminFetch } from "@/lib/api-client";

interface CellActionsProps {
  cell: AdminCellDto;
  hosts?: CellHostDto[];
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

interface HandshakeResponseData {
  ok: boolean;
  status?: string;
  diagnostic?: {
    db?: { ok: boolean; latencyMs?: number; error?: string };
    http?: { ok: boolean; latencyMs?: number; statusCode?: number; error?: string };
  };
}

/**
 * Obtiene el token CSRF desde la API protegida de apps/web.
 */
async function fetchCsrfToken(apiUrl: string): Promise<string> {
  const res = await adminFetch(`${apiUrl}/auth/csrf`, {
    method: "GET",
    headers: { Accept: "application/json" },
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

export function CellActions({ cell, hosts = [], apiUrl, onRefresh }: CellActionsProps): React.JSX.Element {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [manifestModalOpen, setManifestModalOpen] = useState(false);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [handshakeModalOpen, setHandshakeModalOpen] = useState(false);
  const [manifestData, setManifestData] = useState<ManifestData | null>(null);
  const [handshakeResult, setHandshakeResult] = useState<HandshakeResponseData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"compose" | "env" | "instructions">("compose");
  const [copied, setCopied] = useState<string | null>(null);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [drainModalOpen, setDrainModalOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [drainLoading, setDrainLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [drainError, setDrainError] = useState<string | null>(null);
  const [migrateModalOpen, setMigrateModalOpen] = useState(false);
  const [migrateLoading, setMigrateLoading] = useState(false);
  const [migrateError, setMigrateError] = useState<string | null>(null);

  const [editFormData, setEditFormData] = useState({
    hostId: cell.hostId || "",
    tier: cell.tier || "standard",
    topologyType: (cell.topologyType as "remote_vps" | "local_compose") || "remote_vps",
    pgbouncerHost: cell.pgbouncerHost || "",
    pgbouncerPort: cell.pgbouncerPort || 6432,
    databaseName: cell.databaseName || "",
    appUrl: cell.appUrl || "",
    privateIp: cell.privateIp || "",
    publicIp: cell.publicIp || "",
    workingDir: cell.workingDir || "",
    deployUser: cell.deployUser || "deploy:1000",
    maxClients: cell.maxClients || 100,
    region: cell.region || "us-east-1",
  });

  function handleOpenEditModal() {
    setEditFormData({
      hostId: cell.hostId || "",
      tier: cell.tier || "standard",
      topologyType: (cell.topologyType as "remote_vps" | "local_compose") || "remote_vps",
      pgbouncerHost: cell.pgbouncerHost || "",
      pgbouncerPort: cell.pgbouncerPort || 6432,
      databaseName: cell.databaseName || "",
      appUrl: cell.appUrl || "",
      privateIp: cell.privateIp || "",
      publicIp: cell.publicIp || "",
      workingDir: cell.workingDir || "",
      deployUser: cell.deployUser || "deploy:1000",
      maxClients: cell.maxClients || 100,
      region: cell.region || "us-east-1",
    });
    setEditError(null);
    setEditModalOpen(true);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    setEditLoading(true);
    setEditError(null);
    try {
      const csrf = await fetchCsrfToken(apiUrl);
      const res = await adminFetch(`${apiUrl}/admin/cells/${cell.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrf,
        },
        body: JSON.stringify({
          ...editFormData,
          hostId: editFormData.hostId || null,
        }),
      });

      const body = await res.json();
      if (!res.ok || !body.ok) {
        throw new Error(body.error || "No se pudo actualizar la célula.");
      }
      setEditModalOpen(false);
      onRefresh();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Error al actualizar la célula.");
    } finally {
      setEditLoading(false);
    }
  }

  async function handleConfirmDelete() {
    if (cell.currentClients > 0) {
      setDeleteError("No se puede eliminar una célula que cuenta con inquilinos activos vinculados. Debes migrarlos primero.");
      return;
    }
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const csrf = await fetchCsrfToken(apiUrl);
      const res = await adminFetch(`${apiUrl}/admin/cells/${cell.id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrf,
        },
      });

      const body = await res.json();
      if (!res.ok || !body.ok) {
        throw new Error(body.error || "No se pudo eliminar la célula.");
      }
      setDeleteModalOpen(false);
      onRefresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Error al eliminar la célula.");
    } finally {
      setDeleteLoading(false);
    }
  }

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
      const res = await adminFetch(`${apiUrl}/admin/cells/${cell.id}/handshake`, {
        method: "POST",
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
    setManifestError(null);
    setManifestModalOpen(true);
    try {
      const res = await adminFetch(`${apiUrl}/admin/cells/${cell.id}/manifest`, {
        method: "GET",
      });

      const body = await res.json();
      if (!res.ok || !body.ok) {
        throw new Error(body.error || "No se pudo obtener el manifiesto.");
      }
      setManifestData(body.data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al cargar manifiesto.";
      setManifestError(msg);
    } finally {
      setLoadingAction(null);
    }
  }

  function handleOpenDrainModal() {
    setDrainError(null);
    setDrainModalOpen(true);
  }

  async function handleConfirmMigrate() {
    setMigrateLoading(true);
    setMigrateError(null);
    try {
      const csrf = await fetchCsrfToken(apiUrl);
      const res = await adminFetch(`${apiUrl}/admin/cells/${cell.id}/action`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrf,
        },
        body: JSON.stringify({ action: "migrate" }),
      });

      const body = await res.json();
      if (!res.ok || !body.ok) {
        throw new Error(body.error || "No se pudieron ejecutar las migraciones de la célula.");
      }
      setMigrateModalOpen(false);
      onRefresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al migrar célula.";
      setMigrateError(msg);
    } finally {
      setMigrateLoading(false);
    }
  }

  async function handleExecuteDrain() {
    setDrainLoading(true);
    setDrainError(null);
    try {
      const csrf = await fetchCsrfToken(apiUrl);
      const res = await adminFetch(`${apiUrl}/admin/cells/${cell.id}/action`, {
        method: "POST",
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
      setDrainModalOpen(false);
      onRefresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al drenar célula.";
      setDrainError(msg);
    } finally {
      setDrainLoading(false);
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

        {/* Botón Verificar Conexión / Reverificar */}
        <button
          type="button"
          onClick={handleExecuteHandshake}
          disabled={loadingAction !== null}
          title={cell.status === "active" ? "Reverificar Conexión (Probes BD y HTTP)" : "Verificar Conexión (Probes BD y HTTP)"}
          className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all border ${
            cell.status === "active"
              ? "bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)] border-[var(--dsn-accent)]/30 hover:bg-[var(--dsn-accent)]/25"
              : "bg-amber-500/15 text-amber-500 border-amber-500/30 hover:bg-amber-500/25 animate-pulse"
          }`}
        >
          <RefreshCw className={`h-3 w-3 ${loadingAction === "handshake" ? "animate-spin" : ""}`} />
          <span>{cell.status === "active" ? "Reverificar" : "Verificar Conexión"}</span>
        </button>

        {/* Botón Drenar (si está activa) */}
        {cell.status === "active" && (
          <button
            type="button"
            onClick={handleOpenDrainModal}
            disabled={loadingAction !== null}
            title="Drenar Célula (no admitir más inquilinos)"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/30 transition-colors border border-transparent"
          >
            <PowerOff className="h-3 w-3" />
            <span>Drenar</span>
          </button>
        )}

        {/* Botón Migrar Esquema */}
        {["active", "maintenance", "verifying"].includes(cell.status) && (
          <button
            type="button"
            onClick={() => {
              setMigrateError(null);
              setMigrateModalOpen(true);
            }}
            disabled={loadingAction !== null}
            title="Ejecutar Migraciones Pendientes De Esquema"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-500/30 transition-colors border border-[var(--dsn-border)]"
          >
            <GitBranch className="h-3 w-3" />
            <span>Migrar</span>
          </button>
        )}

        {/* Botón Editar */}
        <button
          type="button"
          onClick={handleOpenEditModal}
          disabled={loadingAction !== null}
          title="Editar Configuración De La Célula"
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface-secondary)] hover:text-[var(--dsn-text)] transition-colors border border-[var(--dsn-border)]"
        >
          <Pencil className="h-3 w-3" />
          <span>Editar</span>
        </button>

        {/* Botón Eliminar */}
        <button
          type="button"
          onClick={() => {
            setDeleteError(null);
            setDeleteModalOpen(true);
          }}
          disabled={loadingAction !== null}
          title="Eliminar Célula De Datos"
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/30 transition-colors border border-[var(--dsn-border)]"
        >
          <Trash2 className="h-3 w-3" />
          <span>Eliminar</span>
        </button>
      </div>

      {/* Modal de Manifiesto */}
      {manifestModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in text-left"
        >
          <div className="relative w-full max-w-3xl rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] shadow-2xl p-6 max-h-[90vh] flex flex-col text-left">
            <div className="flex items-center justify-between border-b border-[var(--dsn-border)] pb-4 mb-4">
              <div>
                <h3 className="text-base font-bold text-[var(--dsn-text)] flex items-center gap-2">
                  <FileCode2 className="h-5 w-5 text-[var(--dsn-accent)]" />
                  Manifiesto De Despliegue · {cell.code}
                </h3>
                {manifestData && (
                  <p className="text-xs text-[var(--dsn-text-secondary)] mt-0.5">
                    Directorio: <code className="font-mono text-[var(--dsn-accent)]">{manifestData.workingDir}</code> · Usuario: <code className="font-mono">{manifestData.deployUser}</code>
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setManifestModalOpen(false);
                  setManifestError(null);
                }}
                className="rounded-lg p-1 text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface-secondary)] hover:text-[var(--dsn-text)] min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {manifestError ? (
              <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-4 text-xs text-rose-300">
                <p className="font-semibold mb-1">Error al cargar el manifiesto de la célula:</p>
                <p className="font-mono">{manifestError}</p>
              </div>
            ) : !manifestData ? (
              <div className="flex items-center justify-center py-12 gap-3 text-xs text-[var(--dsn-text-secondary)]">
                <Loader2 className="h-5 w-5 animate-spin text-[var(--dsn-accent)]" />
                <span>Generando manifiesto y secretos criptográficos...</span>
              </div>
            ) : (
              <>
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
                        {manifestData.instructions.map((step: string, idx: number) => (
                          <li key={idx} className="leading-relaxed">
                            <span className="text-[var(--dsn-text)]">{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              </>
            )}

            <div className="flex justify-end pt-4 border-t border-[var(--dsn-border)] mt-4">
              <button
                type="button"
                onClick={() => {
                  setManifestModalOpen(false);
                  setManifestError(null);
                }}
                className="rounded-lg bg-[var(--dsn-surface-secondary)] px-4 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:bg-[var(--dsn-border)] min-h-[44px]"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Resultado de Verificación De Conexión */}
      {handshakeModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in text-left"
        >
          <div className="relative w-full max-w-lg rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] shadow-2xl p-6 flex flex-col text-left">
            <div className="flex items-center justify-between border-b border-[var(--dsn-border)] pb-4 mb-4">
              <div className="flex items-center gap-2">
                {handshakeResult?.ok ? (
                  <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                ) : (
                  <AlertTriangle className="h-6 w-6 text-rose-400" />
                )}
                <div>
                  <h3 className="text-sm font-bold text-[var(--dsn-text)]">
                    {handshakeResult?.ok ? "Verificación De Conexión Exitosa" : "Fallo De Verificación De Conexión"}
                  </h3>
                  <p className="text-xs text-[var(--dsn-text-secondary)]">
                    Célula: {cell.code} ({cell.topologyType})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setHandshakeModalOpen(false)}
                className="rounded-lg p-1 text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface-secondary)] hover:text-[var(--dsn-text)] min-h-[44px] min-w-[44px] flex items-center justify-center"
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
                      <span className={`font-mono text-[11px] font-bold ${handshakeResult?.diagnostic?.http?.ok ? "text-emerald-400" : "text-rose-400"}`}>
                        {handshakeResult?.diagnostic?.http?.ok ? `OK (${handshakeResult.diagnostic.http.latencyMs}ms)` : "FALLÓ"}
                      </span>
                    </div>
                    {handshakeResult?.diagnostic?.http?.error && (
                      <p className="text-[11px] text-rose-300 font-mono pl-3 border-l-2 border-rose-500/40">
                        {handshakeResult.diagnostic.http.error}
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
                className="rounded-lg bg-[var(--dsn-surface-secondary)] px-4 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:bg-[var(--dsn-border)] min-h-[44px]"
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Edición de Célula */}
      {editModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in text-left"
        >
          <div className="relative w-full max-w-2xl rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-2xl max-h-[90vh] flex flex-col overflow-y-auto text-left">
            <div className="flex items-center justify-between border-b border-[var(--dsn-border)] pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Pencil className="h-5 w-5 text-[var(--dsn-accent)]" />
                <div>
                  <h2 className="text-base font-semibold text-[var(--dsn-text)]">
                    Editar Célula De Datos · {cell.code}
                  </h2>
                  <p className="text-xs text-[var(--dsn-text-secondary)] mt-0.5">
                    Modifica los parámetros de conexión, topología o límites de capacidad de la célula.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                className="text-xs text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)] min-h-[44px] px-2 flex items-center"
              >
                Cancelar
              </button>
            </div>

            {editError && (
              <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-4">
              {/* Fila 1: Código De La Célula | Nivel De Servicio */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="edit-cell-code"
                    className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
                  >
                    Código De La Célula
                  </label>
                  <input
                    id="edit-cell-code"
                    type="text"
                    disabled
                    readOnly
                    value={cell.code}
                    className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text-secondary)] opacity-70 cursor-not-allowed focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label
                    htmlFor="edit-cell-tier"
                    className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
                  >
                    Nivel De Servicio
                  </label>
                  <select
                    id="edit-cell-tier"
                    value={editFormData.tier}
                    onChange={(e) => setEditFormData({ ...editFormData, tier: e.target.value as "standard" | "dedicated" })}
                    className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                  >
                    <option value="standard">Estándar (Multi-Inquilino Compartido)</option>
                    <option value="dedicated">Dedicado (Inquilino Enterprise VIP)</option>
                  </select>
                </div>
              </div>

              {/* Fila 2: Topología De Despliegue | Host De Despliegue */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="edit-cell-topology"
                    className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
                  >
                    Topología De Despliegue
                  </label>
                  <select
                    id="edit-cell-topology"
                    value={editFormData.topologyType}
                    onChange={(e) =>
                      setEditFormData({
                        ...editFormData,
                        topologyType: e.target.value as "remote_vps" | "local_compose",
                      })
                    }
                    className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                  >
                    <option value="remote_vps">VPS Remoto (Host Dedicado)</option>
                    <option value="local_compose">Docker Compose Local (Emulación)</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="edit-cell-host-id"
                    className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
                  >
                    Host De Despliegue
                  </label>
                  <select
                    id="edit-cell-host-id"
                    value={editFormData.hostId}
                    onChange={(e) => setEditFormData({ ...editFormData, hostId: e.target.value })}
                    className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none font-mono"
                  >
                    <option value="">Sin Asignar (Borrador)</option>
                    {hosts.map((h) => {
                      const isCompatible =
                        editFormData.topologyType === "local_compose"
                          ? h.deploymentProfile === "local_development"
                          : h.deploymentProfile !== "local_development";
                      const isDisabled = (h.status !== "ready" && h.id !== cell.hostId) || !isCompatible;
                      const compatibilitySuffix = !isCompatible ? " (Incompatible)" : "";
                      return (
                        <option key={h.id} value={h.id} disabled={isDisabled}>
                          {h.code} · {h.deploymentProfile} {h.status !== "ready" ? `(${h.status})` : ""}{compatibilitySuffix}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="edit-cell-app-url"
                  className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
                >
                  URL De La Aplicación Celular
                </label>
                <input
                  id="edit-cell-app-url"
                  type="text"
                  required
                  placeholder="ej. http://10.0.0.2:3004 o http://localhost:3004"
                  value={editFormData.appUrl}
                  onChange={(e) => setEditFormData({ ...editFormData, appUrl: e.target.value })}
                  className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                />
              </div>

              {/* Fila 3: Host De PgBouncer O PostgreSQL | Puerto De Conexión | Nombre De La Base De Datos */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label
                    htmlFor="edit-cell-host"
                    className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
                  >
                    Host De PgBouncer O PostgreSQL
                  </label>
                  <input
                    id="edit-cell-host"
                    type="text"
                    required
                    placeholder="ej. pg-cell o 10.0.0.2"
                    value={editFormData.pgbouncerHost}
                    onChange={(e) => setEditFormData({ ...editFormData, pgbouncerHost: e.target.value })}
                    className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="edit-cell-port"
                    className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
                  >
                    Puerto De Conexión
                  </label>
                  <input
                    id="edit-cell-port"
                    type="number"
                    required
                    value={editFormData.pgbouncerPort}
                    onChange={(e) => setEditFormData({ ...editFormData, pgbouncerPort: Number(e.target.value) })}
                    className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="edit-cell-dbname"
                    className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
                  >
                    Nombre De La Base De Datos
                  </label>
                  <input
                    id="edit-cell-dbname"
                    type="text"
                    required
                    placeholder="ej. mocter_cell_01"
                    value={editFormData.databaseName}
                    onChange={(e) => setEditFormData({ ...editFormData, databaseName: e.target.value })}
                    className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                  />
                </div>
              </div>

              {/* Fila 4: Dirección IP Privada (Opcional) | Dirección IP Pública (Opcional) */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="edit-cell-private-ip"
                    className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
                  >
                    Dirección IP Privada (Opcional)
                  </label>
                  <input
                    id="edit-cell-private-ip"
                    type="text"
                    placeholder="ej. 10.0.0.2"
                    value={editFormData.privateIp}
                    onChange={(e) => setEditFormData({ ...editFormData, privateIp: e.target.value })}
                    className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="edit-cell-public-ip"
                    className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
                  >
                    Dirección IP Pública (Opcional)
                  </label>
                  <input
                    id="edit-cell-public-ip"
                    type="text"
                    placeholder="ej. 198.51.100.2"
                    value={editFormData.publicIp}
                    onChange={(e) => setEditFormData({ ...editFormData, publicIp: e.target.value })}
                    className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                  />
                </div>
              </div>

              {/* Fila 5: Capacidad Máxima De Inquilinos | Región Geográfica De Despliegue */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="edit-cell-capacity"
                    className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
                  >
                    Capacidad Máxima De Inquilinos
                  </label>
                  <input
                    id="edit-cell-capacity"
                    type="number"
                    min={cell.currentClients || 1}
                    max={500}
                    required
                    value={editFormData.maxClients}
                    onChange={(e) => setEditFormData({ ...editFormData, maxClients: Number(e.target.value) })}
                    className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="edit-cell-region"
                    className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
                  >
                    Región Geográfica De Despliegue
                  </label>
                  <input
                    id="edit-cell-region"
                    type="text"
                    required
                    placeholder="ej. us-east-1 o sa-east-1"
                    value={editFormData.region}
                    onChange={(e) => setEditFormData({ ...editFormData, region: e.target.value })}
                    className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                  />
                </div>
              </div>

              {/* Fila 6: Directorio De Trabajo Canónico | Usuario De Despliegue */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="edit-cell-working-dir"
                    className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
                  >
                    Directorio De Trabajo Canónico
                  </label>
                  <input
                    id="edit-cell-working-dir"
                    type="text"
                    required
                    value={editFormData.workingDir}
                    onChange={(e) => setEditFormData({ ...editFormData, workingDir: e.target.value })}
                    className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label
                    htmlFor="edit-cell-deploy-user"
                    className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
                  >
                    Usuario De Despliegue
                  </label>
                  <input
                    id="edit-cell-deploy-user"
                    type="text"
                    disabled
                    readOnly
                    value={editFormData.deployUser}
                    className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text-secondary)] opacity-70 cursor-not-allowed focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-[var(--dsn-border)] mt-4">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  disabled={editLoading}
                  className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-4 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:bg-[var(--dsn-border)] disabled:opacity-50 min-h-[44px]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="flex items-center gap-1.5 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 min-h-[44px]"
                >
                  {editLoading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Guardando Cambios...</span>
                    </>
                  ) : (
                    <span>Guardar Cambios</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmación de Drenado (Regla 4.17) */}
      <ConfirmationModal
        isOpen={drainModalOpen}
        onClose={() => {
          setDrainModalOpen(false);
          setDrainError(null);
        }}
        onConfirm={handleExecuteDrain}
        title="Drenado De Célula De Datos"
        subtitle="Congelación de altas y cese de asignación de nuevos inquilinos."
        variant="warning"
        icon={<PowerOff className="h-5 w-5 text-amber-600 dark:text-amber-400" />}
        details={[
          { label: "Código De Célula", value: cell.code, mono: true },
          { label: "Nivel De Servicio", value: cell.tier },
          { label: "Topología De Despliegue", value: cell.topologyType },
          { label: "Inquilinos Activos", value: cell.currentClients },
          { label: "Capacidad Máxima", value: cell.maxClients },
          { label: "Estado Actual", value: cell.status },
        ]}
        warningTitle="Cese De Asignación En El Router Global"
        warningMessage={
          <p>
            Al colocar la célula en estado <strong className="font-bold">Drenando (draining)</strong>,
            el Router Global no le asignará nuevas altas de inquilinos.
            Los <strong className="font-bold">{cell.currentClients} inquilino(s)</strong> activos
            mantendrán su conectividad normal sin interrupción hasta su migración.
          </p>
        }
        confirmText="Confirmar Drenado De Célula"
        confirmLoadingText="Drenando Célula..."
        loading={drainLoading}
        error={drainError}
      />

      {/* Modal de Confirmación de Eliminación (Regla 4.17) */}
      <ConfirmationModal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setDeleteError(null);
        }}
        onConfirm={handleConfirmDelete}
        title="Eliminación De Célula De Datos"
        subtitle="Retiro permanente del Router Global y base de datos."
        variant="danger"
        icon={<Trash2 className="h-5 w-5 text-rose-600 dark:text-rose-400" />}
        details={[
          { label: "Código De Célula", value: cell.code, mono: true },
          { label: "Nivel De Servicio", value: cell.tier },
          { label: "Host PgBouncer", value: cell.pgbouncerHost, mono: true },
          { label: "Inquilinos Vinculados", value: cell.currentClients },
        ]}
        warningTitle={
          cell.currentClients > 0
            ? "Eliminación Bloqueada Por Integridad Referencial"
            : "Eliminación Física Definitiva"
        }
        warningMessage={
          cell.currentClients > 0 ? (
            <p>
              Esta célula tiene <strong className="font-bold">{cell.currentClients} inquilino(s)</strong> activo(s).
              La base de datos y el Router Global <strong className="font-bold">impiden su eliminación física</strong>{" "}
              para proteger los datos de los comercios. Debes migrar todos los inquilinos antes de proceder.
            </p>
          ) : (
            <p>
              Esta célula <strong className="font-bold">no tiene ningún inquilino vinculado</strong>. Se retirarán
              definitivamente las credenciales, llaves secretas y el registro de la célula del Router Global de manera irreversible.
            </p>
          )
        }
        confirmText={
          cell.currentClients > 0
            ? "Eliminación Bloqueada"
            : "Eliminar Célula Definitivamente"
        }
        confirmLoadingText="Eliminando Célula..."
        loading={deleteLoading}
        error={deleteError}
      />

      {/* Modal Accesible de Confirmación de Migración de Célula (Regla 4.17) */}
      <ConfirmationModal
        isOpen={migrateModalOpen}
        onClose={() => {
          setMigrateModalOpen(false);
          setMigrateError(null);
        }}
        onConfirm={handleConfirmMigrate}
        title="Ejecutar Migraciones De Esquema"
        subtitle={`Aplicación de migraciones pendientes del journal Drizzle en ${cell.code}.`}
        variant="neutral"
        icon={<GitBranch className="h-5 w-5 text-cyan-400" />}
        confirmText="Ejecutar Migración"
        confirmLoadingText="Migrando..."
        cancelText="Cancelar"
        loading={migrateLoading}
        error={migrateError}
        details={[
          { label: "Célula", value: cell.code, mono: true },
          { label: "Host", value: cell.pgbouncerHost || "Local", mono: true },
          { label: "Base De Datos", value: cell.databaseName, mono: true },
          { label: "Estado Operativo", value: cell.status, mono: true },
        ]}
        warningTitle="Actualización De Modelo De Datos Celular"
        warningMessage="Esta operación aplicará las transiciones de esquema SQL pendientes sobre la base de datos de la célula. Se garantiza idempotencia mediante registro criptográfico en __drizzle_migrations."
      />
    </>
  );
}
