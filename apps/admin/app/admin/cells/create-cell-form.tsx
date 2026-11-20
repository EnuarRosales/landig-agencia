"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Server, CheckCircle2, AlertCircle } from "lucide-react";
import type { AdminCellDto, CellHostDto } from "@mocter/domain";
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
} from "@mocter/ui";
import { adminFetch } from "@/lib/api-client";

interface CreateCellFormProps {
  apiUrl: string;
  hosts?: CellHostDto[];
  existingCells?: AdminCellDto[];
  onSuccess?: () => void;
}

/**
 * Sugiere los siguientes puertos libres y nombre base para una celda local sin colisiones.
 */
function suggestNextLocalCellDefaults(existingCells: AdminCellDto[]): {
  pgbouncerPort: number;
  appPort: number;
} {
  const usedPgbouncer = new Set<number>();
  const usedAppPorts = new Set<number>();

  for (const cell of existingCells) {
    if (cell.topologyType === "local_compose") {
      if (Number.isInteger(cell.pgbouncerPort)) {
        usedPgbouncer.add(cell.pgbouncerPort);
      }
      try {
        const parsed = new URL(cell.appUrl);
        if (parsed.port) {
          usedAppPorts.add(Number(parsed.port));
        }
      } catch {
        // Ignorar URLs no parseables
      }
    }
  }

  let nextPgbouncerPort = 6432;
  while (usedPgbouncer.has(nextPgbouncerPort)) {
    nextPgbouncerPort++;
  }

  let nextAppPort = 3004;
  while (usedAppPorts.has(nextAppPort)) {
    nextAppPort++;
  }

  return { pgbouncerPort: nextPgbouncerPort, appPort: nextAppPort };
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
export function CreateCellForm({
  apiUrl,
  hosts = [],
  existingCells = [],
  onSuccess,
}: CreateCellFormProps): React.JSX.Element {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [workingDirCustom, setWorkingDirCustom] = useState(false);

  const initialLocalDefaults = suggestNextLocalCellDefaults(existingCells);

  const computeDefaultWorkingDir = (topology: "remote_vps" | "local_compose", rawCode: string): string => {
    const normalized = rawCode.trim().toLowerCase();
    if (!normalized) return "";
    return topology === "local_compose" ? `data-cell-dev/${normalized}` : `/opt/${normalized}`;
  };

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
    workingDir: string;
    deployUser: string;
  }>({
    code: "",
    hostId: "",
    tier: "standard",
    topologyType: "remote_vps",
    pgbouncerHost: "pgbouncer-cell-01",
    pgbouncerPort: initialLocalDefaults.pgbouncerPort,
    databaseName: "",
    appUrl: "",
    privateIp: "",
    publicIp: "",
    maxClients: 100,
    region: "us-east-1",
    workingDir: "",
    deployUser: "deploy:1000",
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
        workingDir: formData.workingDir.trim() || undefined,
        deployUser: formData.deployUser.trim() || undefined,
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
      setWorkingDirCustom(false);
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
        workingDir: "",
        deployUser: "deploy:1000",
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
      <Button
        type="button"
        variant="primary"
        onClick={() => {
          setIsOpen(true);
          setError(null);
          setSuccess(false);
        }}
        className="min-h-[44px] text-sm"
      >
        <Plus className="h-4 w-4" />
        <span>Registrar Nueva Célula</span>
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl p-6 max-h-[90vh] flex flex-col overflow-y-auto">
          <DialogHeader className="border-b border-[var(--dsn-border)] pb-3 mb-4 pr-8">
            <div className="flex items-center gap-2">
              <Server className="h-5 w-5 text-[var(--dsn-accent)]" />
              <div>
                <DialogTitle className="text-base font-semibold text-[var(--dsn-text)]">
                  Aprovisionamiento De Célula De Datos
                </DialogTitle>
                <DialogDescription className="text-xs text-[var(--dsn-text-secondary)] mt-0.5">
                  Registra un nuevo nodo celular PostgreSQL 18 para el plano de datos multi-inquilino.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert variant="success" className="mb-4">
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Célula registrada exitosamente en el Router Global con estado Borrador (Draft).
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label
                  htmlFor="cell-code"
                  className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
                >
                  Código De La Célula
                </Label>
                <Input
                  id="cell-code"
                  type="text"
                  required
                  placeholder="ej. cell-01 o cell-vip"
                  value={formData.code}
                  onChange={(e) => {
                    const nextCode = e.target.value;
                    const normalizedCode = nextCode.trim().toLowerCase();
                    setFormData((prev) => ({
                      ...prev,
                      code: nextCode,
                      pgbouncerHost:
                        prev.topologyType === "local_compose" && normalizedCode
                          ? `pgbouncer-${normalizedCode}`
                          : prev.pgbouncerHost,
                      workingDir: workingDirCustom
                        ? prev.workingDir
                        : computeDefaultWorkingDir(prev.topologyType, nextCode),
                    }));
                  }}
                  className="min-h-[44px] text-xs"
                />
              </div>

              <div>
                <Label
                  htmlFor="cell-tier"
                  className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
                >
                  Nivel De Servicio
                </Label>
                <Select
                  id="cell-tier"
                  value={formData.tier}
                  onChange={(e) => setFormData({ ...formData, tier: e.target.value })}
                  className="min-h-[44px] text-xs"
                >
                  <option value="standard">Estándar (Multi-Inquilino Compartido)</option>
                  <option value="dedicated">Dedicado (Inquilino Enterprise VIP)</option>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label
                  htmlFor="cell-topology"
                  className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
                >
                  Topología De Despliegue
                </Label>
                <Select
                  id="cell-topology"
                  value={formData.topologyType}
                  onChange={(e) => {
                    const nextTopology = e.target.value as "remote_vps" | "local_compose";
                    const nextLocalDefaults = suggestNextLocalCellDefaults(existingCells);
                    const readyLocalHosts = hosts.filter(
                      (h) => h.status === "ready" && h.deploymentProfile === "local_development",
                    );
                    setFormData((prev) => ({
                      ...prev,
                      topologyType: nextTopology,
                      hostId:
                        nextTopology === "local_compose" && readyLocalHosts.length === 1
                          ? readyLocalHosts[0].id
                          : "",
                      pgbouncerPort:
                        nextTopology === "local_compose" ? nextLocalDefaults.pgbouncerPort : 6432,
                      pgbouncerHost:
                        nextTopology === "local_compose" && prev.code.trim()
                          ? `pgbouncer-${prev.code.trim().toLowerCase()}`
                          : prev.pgbouncerHost,
                      appUrl:
                        nextTopology === "local_compose" && !prev.appUrl.trim()
                          ? `http://localhost:${nextLocalDefaults.appPort}/`
                          : prev.appUrl,
                      workingDir: workingDirCustom
                        ? prev.workingDir
                        : computeDefaultWorkingDir(nextTopology, prev.code),
                    }));
                  }}
                  className="min-h-[44px] text-xs"
                >
                  <option value="remote_vps">VPS Remoto (Host Dedicado)</option>
                  <option value="local_compose">Docker Compose Local (Emulación)</option>
                </Select>
              </div>

              <div>
                <Label
                  htmlFor="cell-host-id"
                  className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
                >
                  Host De Despliegue
                </Label>
                <Select
                  id="cell-host-id"
                  value={formData.hostId}
                  onChange={(e) => setFormData({ ...formData, hostId: e.target.value })}
                  className="min-h-[44px] text-xs"
                >
                  <option value="">Sin Asignar (Borrador)</option>
                  {hosts.map((h) => {
                    const isCompatible =
                      formData.topologyType === "local_compose"
                        ? h.deploymentProfile === "local_development"
                        : h.deploymentProfile !== "local_development";
                    const isDisabled = h.status !== "ready" || !isCompatible;
                    const compatibilitySuffix = !isCompatible ? " (Incompatible)" : "";
                    return (
                      <option key={h.id} value={h.id} disabled={isDisabled}>
                        {h.code} · {h.deploymentProfile} {h.status !== "ready" ? `(${h.status})` : ""}{compatibilitySuffix}
                      </option>
                    );
                  })}
                </Select>
              </div>
            </div>

            <div>
              <Label
                htmlFor="cell-app-url"
                className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
              >
                URL De La Aplicación Celular
              </Label>
              <Input
                id="cell-app-url"
                type="text"
                required
                placeholder="ej. http://10.0.0.2:3004 o http://localhost:3004"
                value={formData.appUrl}
                onChange={(e) => setFormData({ ...formData, appUrl: e.target.value })}
                className="min-h-[44px] text-xs"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label
                  htmlFor="cell-host"
                  className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
                >
                  Host De PgBouncer O PostgreSQL
                </Label>
                <Input
                  id="cell-host"
                  type="text"
                  required
                  placeholder="ej. pg-cell o 10.0.0.2"
                  value={formData.pgbouncerHost}
                  onChange={(e) => setFormData({ ...formData, pgbouncerHost: e.target.value })}
                  className="min-h-[44px] text-xs"
                />
              </div>

              <div>
                <Label
                  htmlFor="cell-port"
                  className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
                >
                  Puerto De Conexión
                </Label>
                <Input
                  id="cell-port"
                  type="number"
                  required
                  value={formData.pgbouncerPort}
                  onChange={(e) => setFormData({ ...formData, pgbouncerPort: Number(e.target.value) })}
                  className="min-h-[44px] text-xs"
                />
              </div>

              <div>
                <Label
                  htmlFor="cell-dbname"
                  className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
                >
                  Nombre De La Base De Datos
                </Label>
                <Input
                  id="cell-dbname"
                  type="text"
                  required
                  placeholder="ej. mocter_cell_01"
                  value={formData.databaseName}
                  onChange={(e) => setFormData({ ...formData, databaseName: e.target.value })}
                  className="min-h-[44px] text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label
                  htmlFor="cell-private-ip"
                  className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
                >
                  Dirección IP Privada (Opcional)
                </Label>
                <Input
                  id="cell-private-ip"
                  type="text"
                  placeholder="ej. 10.0.0.2"
                  value={formData.privateIp}
                  onChange={(e) => setFormData({ ...formData, privateIp: e.target.value })}
                  className="min-h-[44px] text-xs"
                />
              </div>

              <div>
                <Label
                  htmlFor="cell-public-ip"
                  className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
                >
                  Dirección IP Pública (Opcional)
                </Label>
                <Input
                  id="cell-public-ip"
                  type="text"
                  placeholder="ej. 198.51.100.2"
                  value={formData.publicIp}
                  onChange={(e) => setFormData({ ...formData, publicIp: e.target.value })}
                  className="min-h-[44px] text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label
                  htmlFor="cell-capacity"
                  className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
                >
                  Capacidad Máxima De Inquilinos
                </Label>
                <Input
                  id="cell-capacity"
                  type="number"
                  min="1"
                  max="500"
                  required
                  value={formData.maxClients}
                  onChange={(e) => setFormData({ ...formData, maxClients: Number(e.target.value) })}
                  className="min-h-[44px] text-xs"
                />
              </div>

              <div>
                <Label
                  htmlFor="cell-region"
                  className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
                >
                  Región Geográfica De Despliegue
                </Label>
                <Input
                  id="cell-region"
                  type="text"
                  required
                  placeholder="ej. us-east-1 o co-bogota-1"
                  value={formData.region}
                  onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                  className="min-h-[44px] text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label
                  htmlFor="cell-working-dir"
                  className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
                >
                  Directorio De Trabajo Canónico
                </Label>
                <Input
                  id="cell-working-dir"
                  type="text"
                  placeholder="ej. /opt/cell-01 o data-cell-dev/cell-1"
                  value={formData.workingDir}
                  onChange={(e) => {
                    setWorkingDirCustom(e.target.value.trim().length > 0);
                    setFormData({ ...formData, workingDir: e.target.value });
                  }}
                  className="min-h-[44px] text-xs font-mono"
                />
              </div>

              <div>
                <Label
                  htmlFor="cell-deploy-user"
                  className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
                >
                  Usuario De Despliegue
                </Label>
                <Input
                  id="cell-deploy-user"
                  type="text"
                  disabled
                  readOnly
                  value={formData.deployUser}
                  className="min-h-[44px] opacity-70 cursor-not-allowed text-xs font-mono"
                />
              </div>
            </div>

            <DialogFooter className="pt-3 border-t border-[var(--dsn-border)] mt-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsOpen(false)}
                className="min-h-[44px] text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={loading}
                loading={loading}
                className="min-h-[44px] text-xs"
              >
                <Plus className="h-4 w-4" />
                <span>Registrar Célula</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
