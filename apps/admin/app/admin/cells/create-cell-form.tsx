"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Server, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import type { CellHostDto } from "@mocter/domain";
import { adminFetch } from "@/lib/api-client";

interface CreateCellFormProps {
  apiUrl: string;
  hosts?: CellHostDto[];
  onSuccess?: () => void;
}

/**
 * Obtiene el token CSRF desde la API protegida de apps/web.
 * Requiere que la cookie de sesión esté presente en el origen de autenticación.
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

/**
 * Formulario interactivo para registrar una nueva célula de datos en Mocter (DAT-001 §3.3).
 * Ahora consume la API protegida de apps/web con sesión, CSRF y validación de origen admin.
 */
export function CreateCellForm({ apiUrl, hosts = [], onSuccess }: CreateCellFormProps): React.JSX.Element {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState<{
    code: string;
    hostId: string;
    tier: string;
    topologyType: "remote_vps" | "local_compose";
    pgbouncerHost: string;
    pgbouncerPort: number;
    databaseName: string;
    appUrl: string;
    privateIp: string;
    publicIp: string;
    maxClients: number;
    region: string;
  }>({
    code: "",
    hostId: "",
    tier: "standard",
    topologyType: "remote_vps",
    pgbouncerHost: "pgbouncer-cell-01",
    pgbouncerPort: 6432,
    databaseName: "",
    appUrl: "",
    privateIp: "",
    publicIp: "",
    maxClients: 100,
    region: "us-east-1",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const csrfToken = await fetchCsrfToken(apiUrl);

      const payload = {
        code: formData.code.trim().toLowerCase(),
        hostId: formData.hostId ? formData.hostId.trim() : null,
        tier: formData.tier,
        topologyType: formData.topologyType,
        pgbouncerHost: formData.pgbouncerHost.trim(),
        pgbouncerPort: Number(formData.pgbouncerPort),
        databaseName: formData.databaseName.trim(),
        appUrl: formData.appUrl.trim(),
        privateIp: formData.privateIp.trim() || undefined,
        publicIp: formData.publicIp.trim() || undefined,
        maxClients: Number(formData.maxClients),
        region: formData.region.trim(),
      };

      const res = await adminFetch(`${apiUrl}/admin/cells`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Fallo al registrar la célula de datos");
      }

      setSuccess(true);
      setFormData({
        code: "",
        hostId: "",
        tier: "standard",
        topologyType: "remote_vps",
        pgbouncerHost: "pgbouncer-cell-01",
        pgbouncerPort: 6432,
        databaseName: "",
        appUrl: "",
        privateIp: "",
        publicIp: "",
        maxClients: 100,
        region: "us-east-1",
      });
      router.refresh();
      if (onSuccess) onSuccess();
      setTimeout(() => {
        setIsOpen(false);
        setSuccess(false);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setIsOpen(true);
          setError(null);
          setSuccess(false);
        }}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[var(--dsn-accent-hover)] active:scale-95"
      >
        <Plus className="h-4 w-4" />
        <span>Registrar Nueva Célula</span>
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
        >
          <div className="relative w-full max-w-2xl rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-2xl max-h-[90vh] flex flex-col overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[var(--dsn-border)] pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Server className="h-5 w-5 text-[var(--dsn-accent)]" />
                <div>
                  <h2 className="text-base font-semibold text-[var(--dsn-text)]">
                    Aprovisionamiento De Célula De Datos
                  </h2>
                  <p className="text-xs text-[var(--dsn-text-secondary)] mt-0.5">
                    Registra un nuevo nodo celular PostgreSQL 18 para el plano de datos multi-inquilino.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-xs text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)] min-h-[44px] px-2 flex items-center"
              >
                Cancelar
              </button>
            </div>

            {error && (
              <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3 text-xs text-emerald-400">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Célula registrada exitosamente en el Router Global con estado Borrador (Draft).</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="cell-code"
                    className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
                  >
                    Código De La Célula
                  </label>
                  <input
                    id="cell-code"
                    type="text"
                    required
                    placeholder="ej. cell-01 o cell-vip"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="cell-tier"
                    className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
                  >
                    Nivel De Servicio
                  </label>
                  <select
                    id="cell-tier"
                    value={formData.tier}
                    onChange={(e) => setFormData({ ...formData, tier: e.target.value })}
                    className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                  >
                    <option value="standard">Estándar (Multi-Inquilino Compartido)</option>
                    <option value="dedicated">Dedicado (Inquilino Enterprise VIP)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="cell-topology"
                    className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
                  >
                    Topología De Despliegue
                  </label>
                  <select
                    id="cell-topology"
                    value={formData.topologyType}
                    onChange={(e) =>
                      setFormData({ ...formData, topologyType: e.target.value as "remote_vps" | "local_compose" })
                    }
                    className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                  >
                    <option value="remote_vps">VPS Remoto (Host Dedicado)</option>
                    <option value="local_compose">Docker Compose Local (Emulación)</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="cell-host-id"
                    className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
                  >
                    Host De Despliegue
                  </label>
                  <select
                    id="cell-host-id"
                    value={formData.hostId}
                    onChange={(e) => setFormData({ ...formData, hostId: e.target.value })}
                    className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                  >
                    <option value="">Sin Asignar (Borrador)</option>
                    {hosts.map((h) => (
                      <option key={h.id} value={h.id} disabled={h.status !== "ready"}>
                        {h.code} · {h.deploymentProfile} {h.status !== "ready" ? `(${h.status})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="cell-app-url"
                  className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
                >
                  URL De La Aplicación Celular
                </label>
                <input
                  id="cell-app-url"
                  type="text"
                  required
                  placeholder="ej. http://10.0.0.2:3004 o http://localhost:3004"
                  value={formData.appUrl}
                  onChange={(e) => setFormData({ ...formData, appUrl: e.target.value })}
                  className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label
                    htmlFor="cell-host"
                    className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
                  >
                    Host De PgBouncer O PostgreSQL
                  </label>
                  <input
                    id="cell-host"
                    type="text"
                    required
                    placeholder="ej. pg-cell o 10.0.0.2"
                    value={formData.pgbouncerHost}
                    onChange={(e) => setFormData({ ...formData, pgbouncerHost: e.target.value })}
                    className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="cell-port"
                    className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
                  >
                    Puerto De Conexión
                  </label>
                  <input
                    id="cell-port"
                    type="number"
                    required
                    value={formData.pgbouncerPort}
                    onChange={(e) => setFormData({ ...formData, pgbouncerPort: Number(e.target.value) })}
                    className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="cell-dbname"
                    className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
                  >
                    Nombre De La Base De Datos
                  </label>
                  <input
                    id="cell-dbname"
                    type="text"
                    required
                    placeholder="ej. mocter_cell_01"
                    value={formData.databaseName}
                    onChange={(e) => setFormData({ ...formData, databaseName: e.target.value })}
                    className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="cell-private-ip"
                    className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
                  >
                    Dirección IP Privada (Opcional)
                  </label>
                  <input
                    id="cell-private-ip"
                    type="text"
                    placeholder="ej. 10.0.0.2"
                    value={formData.privateIp}
                    onChange={(e) => setFormData({ ...formData, privateIp: e.target.value })}
                    className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="cell-public-ip"
                    className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
                  >
                    Dirección IP Pública (Opcional)
                  </label>
                  <input
                    id="cell-public-ip"
                    type="text"
                    placeholder="ej. 198.51.100.2"
                    value={formData.publicIp}
                    onChange={(e) => setFormData({ ...formData, publicIp: e.target.value })}
                    className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="cell-capacity"
                    className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
                  >
                    Capacidad Máxima De Inquilinos
                  </label>
                  <input
                    id="cell-capacity"
                    type="number"
                    min="1"
                    max="500"
                    required
                    value={formData.maxClients}
                    onChange={(e) => setFormData({ ...formData, maxClients: Number(e.target.value) })}
                    className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="cell-region"
                    className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
                  >
                    Región Geográfica De Despliegue
                  </label>
                  <input
                    id="cell-region"
                    type="text"
                    required
                    placeholder="ej. us-east-1 o co-bogota-1"
                    value={formData.region}
                    onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                    className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--dsn-border)] mt-4">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="min-h-[44px] px-4 py-2 rounded-lg border border-[var(--dsn-border)] text-xs text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface-secondary)] hover:text-[var(--dsn-text)]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[var(--dsn-accent-hover)] disabled:opacity-50"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  <span>Registrar Célula</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
