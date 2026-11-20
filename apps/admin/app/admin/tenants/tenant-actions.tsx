"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle,
  Loader2,
  PlayCircle,
  ShieldAlert,
  Pencil,
  Trash2,
  Mail,
  Store,
  Check,
  MessageSquare,
  RotateCw,
  ExternalLink,
} from "lucide-react";
import type { AdminTenantItemDto } from "@mocter/domain";
import {
  Alert,
  AlertDescription,
  Button,
  ConfirmationModal,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
} from "@mocter/ui";
import { PhoneE164Input } from "@/components/phone-e164-input";

export interface TenantActionsProps {
  clientId?: string;
  clientName?: string;
  currentStatus?: "alta" | "activo" | "suspendido" | "baja";
  tenant?: AdminTenantItemDto;
  availablePlans?: Array<{ id: string; code: string; name: string }>;
  availableCells?: Array<{ id: string; code: string; currentClients: number; maxClients: number }>;
}

/**
 * Control interactivo integral de operaciones CRUD y ciclo de vida de inquilinos (ADM-001 §6, DAT-001).
 * Implementa edición de metadatos, reenvío de onboarding, suspensión/reactivación y baja con ConfirmationModal (Regla 4.17).
 */
export function TenantActions({
  clientId: propClientId,
  clientName: propClientName,
  currentStatus: propStatus,
  tenant,
  availablePlans = [],
  availableCells = [],
}: TenantActionsProps) {
  const router = useRouter();

  const id = tenant?.id || propClientId || "";
  const name = tenant?.displayName || propClientName || "";
  const status = tenant?.lifecycleStatus || propStatus || "activo";

  // Estados de modales y acciones
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [resendModalOpen, setResendModalOpen] = useState(false);
  const [suspendModalOpen, setSuspendModalOpen] = useState(false);
  const [reactivateModalOpen, setReactivateModalOpen] = useState(false);
  const [infoModal, setInfoModal] = useState<{
    isOpen: boolean;
    title: string;
    subtitle?: string;
    variant: "neutral" | "danger" | "warning";
    message: string;
  }>({
    isOpen: false,
    title: "",
    variant: "neutral",
    message: "",
  });

  // Estados de carga
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [chatwootLoading, setChatwootLoading] = useState(false);
  const [chatwootModalOpen, setChatwootModalOpen] = useState(false);

  // Mensajes de error en modales
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [chatwootError, setChatwootError] = useState<string | null>(null);

  // Formulario de edición
  const [editForm, setEditForm] = useState({
    displayName: tenant?.displayName || name,
    slug: tenant?.slug || "",
    contactEmail: tenant?.contactEmail || tenant?.ownerEmail || "",
    ownerDisplayName: tenant?.ownerName || "",
    phone: tenant?.phone || "",
    planId: tenant?.planId || (availablePlans[0]?.id ?? ""),
    cellId: tenant?.cellId || (availableCells[0]?.id ?? ""),
    locale: tenant?.locale || "es",
    lifecycleStatus: status,
  });

  function openEditModal() {
    setEditForm({
      displayName: tenant?.displayName || name,
      slug: tenant?.slug || "",
      contactEmail: tenant?.contactEmail || tenant?.ownerEmail || "",
      ownerDisplayName: tenant?.ownerName || "",
      phone: tenant?.phone || "",
      planId: tenant?.planId || (availablePlans[0]?.id ?? ""),
      cellId: tenant?.cellId || (availableCells[0]?.id ?? ""),
      locale: tenant?.locale || "es",
      lifecycleStatus: status,
    });
    setEditError(null);
    setEditModalOpen(true);
  }

  // 1. Manejador de cambio de ciclo de vida (Suspender / Reactivar)
  async function handleStatusChange(newStatus: "activo" | "suspendido" | "baja") {
    setLoadingStatus(true);
    setStatusError(null);

    try {
      const res = await fetch("/api/admin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_lifecycle",
          clientId: id,
          lifecycleStatus: newStatus,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Fallo al actualizar estado del inquilino");
      }

      setSuspendModalOpen(false);
      setReactivateModalOpen(false);
      setInfoModal({
        isOpen: true,
        title: "Estado Operativo Actualizado",
        subtitle: `El inquilino ahora se encuentra en estado ${newStatus}.`,
        variant: "neutral",
        message: `La transición de ciclo de vida a "${newStatus}" se aplicó correctamente en el plano de control y el enrutamiento celular.`,
      });
      router.refresh();
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : "Error inesperado al actualizar estado");
    } finally {
      setLoadingStatus(false);
    }
  }

  // 2. Manejador de Reenvío de Notificación / Onboarding
  async function handleExecuteResend() {
    setResendLoading(true);
    setResendError(null);

    try {
      const res = await fetch("/api/admin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "resend_onboarding",
          clientId: id,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "No se pudo reenviar la notificación de onboarding");
      }

      const sentTo = data.data?.emailSentTo || tenant?.contactEmail || tenant?.ownerEmail || "el propietario";
      setResendModalOpen(false);
      setInfoModal({
        isOpen: true,
        title: "Invitación de Onboarding Enviada",
        subtitle: "Notificación y credenciales de acceso despachadas por SMTP.",
        variant: "neutral",
        message: `Se enviaron exitosamente las instrucciones de bienvenida y activación a ${sentTo}. La entrega quedó registrada en la bitácora de notificaciones.`,
      });
    } catch (err) {
      setResendError(err instanceof Error ? err.message : "Error al reenviar correo de onboarding");
    } finally {
      setResendLoading(false);
    }
  }

  // Manejador de aprovisionamiento o reintento de Chatwoot (CHW-002 T-09, D-08)
  async function handleExecuteChatwootProvision() {
    setChatwootLoading(true);
    setChatwootError(null);

    try {
      const res = await fetch(`/api/admin/tenants/${id}/chatwoot/provision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "No fue posible sincronizar el comercio con Chatwoot.");
      }

      setChatwootModalOpen(false);
      setInfoModal({
        isOpen: true,
        title: "Sincronización de Chatwoot Exitosa",
        subtitle: "Configuración de atención omnicanal completada.",
        variant: "neutral",
        message: `La cuenta de Chatwoot para ${name} ha sido aprovisionada exitosamente. Se configuraron los buzones, cuotas y etiquetas canónicas.`,
      });
      router.refresh();
    } catch (err) {
      setChatwootError(err instanceof Error ? err.message : "Error al sincronizar con Chatwoot.");
    } finally {
      setChatwootLoading(false);
    }
  }

  // 3. Manejador de Edición de Inquilino
  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    setEditLoading(true);
    setEditError(null);

    try {
      const res = await fetch("/api/admin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_tenant",
          clientId: id,
          displayName: editForm.displayName,
          slug: editForm.slug,
          contactEmail: editForm.contactEmail,
          ownerDisplayName: editForm.ownerDisplayName,
          phone: editForm.phone,
          planId: editForm.planId,
          cellId: editForm.cellId,
          locale: editForm.locale,
          lifecycleStatus: editForm.lifecycleStatus,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Error al actualizar información del inquilino");
      }

      setEditModalOpen(false);
      setInfoModal({
        isOpen: true,
        title: "Inquilino Actualizado",
        subtitle: "Cambios guardados en el directorio del plano de control.",
        variant: "neutral",
        message: `La información y asignaciones del comercio "${editForm.displayName}" se actualizaron satisfactoriamente.`,
      });
      router.refresh();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Error al guardar cambios");
    } finally {
      setEditLoading(false);
    }
  }

  // 4. Manejador de Baja / Decommissioning (Confirmación con modal canónico Regla 4.17)
  async function handleExecuteDelete() {
    setDeleteLoading(true);
    setDeleteError(null);

    try {
      const res = await fetch("/api/admin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_tenant",
          clientId: id,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Error al dar de baja el inquilino");
      }

      setDeleteModalOpen(false);
      setInfoModal({
        isOpen: true,
        title: "Baja Procesada con Éxito",
        subtitle: "Comercio retirado de la plataforma.",
        variant: "neutral",
        message: `El inquilino "${name}" fue dado de baja y su enrutamiento celular quedó en modo solo lectura.`,
      });
      router.refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Error inesperado durante la baja");
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-1.5 justify-end">
      {/* Botón Reenviar Onboarding / Verificación */}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={resendLoading || status === "baja"}
        onClick={() => {
          setResendError(null);
          setResendModalOpen(true);
        }}
        title="Reenviar correo de onboarding y configuración de contraseña"
        className="h-auto min-h-0 px-2 py-1 text-xs font-medium"
      >
        {resendLoading ? <Loader2 className="h-3 w-3 animate-spin text-[var(--dsn-accent)]" /> : <Mail className="h-3 w-3 text-cyan-400" />}
        <span className="hidden sm:inline">Onboarding</span>
      </Button>

      {/* Botón Aprovisionar / Reintentar en Chatwoot (CHW-002 T-09, D-08) */}
      {status !== "baja" && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={chatwootLoading}
          onClick={() => {
            setChatwootError(null);
            setChatwootModalOpen(true);
          }}
          title={tenant?.chatwoot?.state === "failed" ? "Reintentar sincronización en Chatwoot" : "Aprovisionar en Chatwoot"}
          className="h-auto min-h-0 px-2 py-1 text-xs font-medium"
        >
          {chatwootLoading ? (
            <Loader2 className="h-3 w-3 animate-spin text-[var(--dsn-accent)]" />
          ) : tenant?.chatwoot?.state === "failed" ? (
            <RotateCw className="h-3 w-3 text-amber-400" />
          ) : (
            <MessageSquare className="h-3 w-3 text-cyan-400" />
          )}
          <span className="hidden sm:inline">
            {tenant?.chatwoot?.state === "failed" ? "Reintentar Sincronización" : "Aprovisionar en Chatwoot"}
          </span>
        </Button>
      )}

      {/* Enlace directo a la Ficha en Super Admin si ya existe chatwootAccountId (CHW-002 T-09, D-08) */}
      {Boolean(tenant?.chatwoot?.chatwootAccountId) && (
        <Button
          asChild
          variant="secondary"
          size="sm"
          className="h-auto min-h-0 px-2 py-1 text-xs font-medium"
        >
          <Link
            href={`/admin/conversations?accountId=${tenant!.chatwoot!.chatwootAccountId}`}
            title="Ver ficha de cuenta en consola Super Admin de Chatwoot"
          >
            <ExternalLink className="h-3 w-3 text-indigo-400" />
            <span className="hidden sm:inline">Ver Cuenta En Super Admin</span>
          </Link>
        </Button>
      )}

      {/* Botón Editar Inquilino */}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={status === "baja"}
        onClick={openEditModal}
        title="Editar información del comercio"
        className="h-auto min-h-0 px-2 py-1 text-xs font-medium"
      >
        <Pencil className="h-3 w-3 text-amber-400" />
        <span className="hidden sm:inline">Editar</span>
      </Button>

      {/* Suspender para Activos (Modal Canónico Regla 4.17) */}
      {status === "activo" && (
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={() => {
            setStatusError(null);
            setSuspendModalOpen(true);
          }}
          title="Suspender acceso del comercio"
          className="h-auto min-h-0 px-2 py-1 text-xs font-medium"
        >
          <ShieldAlert className="h-3 w-3" />
          <span>Suspender</span>
        </Button>
      )}

      {/* Reactivar para Suspendidos o En Alta (Modal Canónico Regla 4.17) */}
      {(status === "suspendido" || status === "alta") && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setStatusError(null);
            setReactivateModalOpen(true);
          }}
          title="Reactivar operación del comercio"
          className="h-auto min-h-0 border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20"
        >
          <PlayCircle className="h-3 w-3" />
          <span>Reactivar</span>
        </Button>
      )}

      {/* Dar de Baja (con Modal Canónico de Confirmación Regla 4.17) */}
      {status !== "baja" && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setDeleteError(null);
            setDeleteModalOpen(true);
          }}
          title="Dar de baja el inquilino de la plataforma"
          className="h-auto min-h-0 p-1 text-xs font-medium text-zinc-400 hover:text-rose-400 hover:border-rose-500/40 hover:bg-rose-500/10"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}

      {/* MODAL ACCESIBLE DE EDICIÓN DE INQUILINO */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4 text-left">
          <DialogHeader className="border-b border-[var(--dsn-border)] pb-3 pr-8">
            <div className="flex items-center gap-2">
              <Store className="h-5 w-5 text-[var(--dsn-accent)]" />
              <DialogTitle className="text-base font-semibold text-[var(--dsn-text)]">
                Editar Inquilino Y Comercio
              </DialogTitle>
            </div>
          </DialogHeader>

          {/* Error Banner */}
          {editError && (
            <Alert variant="destructive" className="text-left">
              <AlertDescription className="text-xs">{editError}</AlertDescription>
            </Alert>
          )}

          {/* Formulario */}
          <form onSubmit={handleSaveEdit} className="space-y-4 text-xs text-left">
            {/* Nombre Comercial */}
            <div>
              <Label className="block text-xs font-medium text-[var(--dsn-text)] mb-1 text-left">
                Nombre Del Comercio
              </Label>
              <Input
                type="text"
                required
                value={editForm.displayName}
                onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })}
                className="bg-[var(--dsn-surface)] text-xs text-left"
              />
            </div>

            {/* Slug */}
            <div>
              <Label className="block text-xs font-medium text-[var(--dsn-text)] mb-1 text-left">
                Slug Del Identificador
              </Label>
              <Input
                type="text"
                required
                value={editForm.slug}
                onChange={(e) => setEditForm({ ...editForm, slug: e.target.value.toLowerCase().trim() })}
                className="bg-[var(--dsn-surface)] font-mono text-xs text-left"
              />
            </div>

            {/* Propietario y Contacto en dos columnas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="block text-xs font-medium text-[var(--dsn-text)] mb-1 text-left">
                  Nombre Del Propietario
                </Label>
                <Input
                  type="text"
                  value={editForm.ownerDisplayName}
                  onChange={(e) => setEditForm({ ...editForm, ownerDisplayName: e.target.value })}
                  className="bg-[var(--dsn-surface)] text-xs text-left"
                />
              </div>
              <div>
                <Label className="block text-xs font-medium text-[var(--dsn-text)] mb-1 text-left">
                  Correo De Contacto
                </Label>
                <Input
                  type="email"
                  required
                  value={editForm.contactEmail}
                  onChange={(e) => setEditForm({ ...editForm, contactEmail: e.target.value })}
                  className="bg-[var(--dsn-surface)] text-xs text-left"
                />
              </div>
            </div>

            {/* Teléfono e Idioma */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <PhoneE164Input
                  id="admin-edit-tenant-phone"
                  label="Teléfono de Contacto"
                  value={editForm.phone}
                  locale={editForm.locale === "en" ? "en" : "es"}
                  onChange={(nextVal) => setEditForm({ ...editForm, phone: nextVal })}
                />
              </div>
              <div>
                <Label className="block text-xs font-medium text-[var(--dsn-text)] mb-1 text-left">
                  Idioma Del Comercio
                </Label>
                <Select
                  value={editForm.locale}
                  onChange={(e) => setEditForm({ ...editForm, locale: e.target.value })}
                  className="bg-[var(--dsn-surface)] text-xs text-left"
                >
                  <option value="es">Español (es)</option>
                  <option value="en">Inglés (en)</option>
                </Select>
              </div>
            </div>

            {/* Plan y Célula */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="block text-xs font-medium text-[var(--dsn-text)] mb-1 text-left">
                  Plan Suscrito
                </Label>
                <Select
                  value={editForm.planId}
                  onChange={(e) => setEditForm({ ...editForm, planId: e.target.value })}
                  className="bg-[var(--dsn-surface)] text-xs text-left"
                >
                  {availablePlans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label className="block text-xs font-medium text-[var(--dsn-text)] mb-1 text-left">
                  Célula De Datos Asignada
                </Label>
                <Select
                  value={editForm.cellId}
                  onChange={(e) => setEditForm({ ...editForm, cellId: e.target.value })}
                  className="bg-[var(--dsn-surface)] text-xs text-left"
                >
                  {availableCells.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} ({c.currentClients}/{c.maxClients})
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {/* Estado de Ciclo de Vida */}
            <div>
              <Label className="block text-xs font-medium text-[var(--dsn-text)] mb-1 text-left">
                Estado Del Ciclo De Vida
              </Label>
              <Select
                value={editForm.lifecycleStatus}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    lifecycleStatus: e.target.value as "alta" | "activo" | "suspendido" | "baja",
                  })
                }
                className="bg-[var(--dsn-surface)] text-xs text-left"
              >
                <option value="activo">Activo</option>
                <option value="alta">En Alta / Onboarding</option>
                <option value="suspendido">Suspendido</option>
                <option value="baja">Baja</option>
              </Select>
            </div>

            {/* Botones de acción */}
            <DialogFooter className="pt-4 border-t border-[var(--dsn-border)]">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEditModalOpen(false)}
                disabled={editLoading}
                className="min-h-[44px] text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={editLoading}
                loading={editLoading}
                loadingText="Guardando Cambios..."
                className="min-h-[44px] text-xs"
              >
                <Check className="h-4 w-4" />
                <span>Guardar Cambios</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL DE CONFIRMACIÓN DE BAJA CANÓNICO (Regla 4.17) */}
      <ConfirmationModal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setDeleteError(null);
        }}
        onConfirm={handleExecuteDelete}
        title="Baja de Inquilino y Comercio"
        subtitle="Retiro del plano de control y cese de acceso a la plataforma."
        variant="danger"
        icon={<Trash2 className="h-5 w-5 text-rose-600 dark:text-rose-400" />}
        details={[
          { label: "Comercio", value: tenant?.displayName || name },
          { label: "Slug", value: tenant?.slug || editForm.slug, mono: true },
          { label: "Plan", value: tenant?.planName || "Plan Asignado" },
          { label: "Célula", value: tenant?.cellCode || "Célula Activa", mono: true },
        ]}
        warningTitle="Acción Crítica de Retiro"
        warningMessage={
          <p>
            Al confirmar la baja de este comercio, se suspenderá inmediatamente el acceso al portal de administración,
            el enrutamiento celular pasará a modo de solo lectura y se liberará la capacidad asignada en la célula PostgreSQL.
            Los datos históricos se conservan para fines de auditoría y cumplimiento normativo.
          </p>
        }
        confirmText="Confirmar Baja de Inquilino"
        confirmLoadingText="Dando de Baja..."
        loading={deleteLoading}
        error={deleteError}
      />

      {/* MODAL DE CONFIRMACIÓN DE REENVÍO DE ONBOARDING CANÓNICO (Regla 4.17) */}
      <ConfirmationModal
        isOpen={resendModalOpen}
        onClose={() => {
          setResendModalOpen(false);
          setResendError(null);
        }}
        onConfirm={handleExecuteResend}
        title="Reenviar Invitación de Onboarding"
        subtitle="Generación de nuevo enlace seguro de activación y bienvenida."
        variant="neutral"
        icon={<Mail className="h-5 w-5 text-[var(--dsn-accent)]" />}
        details={[
          { label: "Comercio", value: tenant?.displayName || name },
          { label: "Destinatario", value: tenant?.contactEmail || tenant?.ownerEmail || editForm.contactEmail },
          { label: "Propietario", value: tenant?.ownerName || editForm.ownerDisplayName || "Propietario Principal" },
        ]}
        warningTitle="Notificación de Acceso Transaccional"
        warningMessage={
          <p>
            Se generará un nuevo token criptográfico de establecimiento de contraseña y verificación de correo.
            El enlace anterior quedará invalidado y se despachará un mensaje vía SMTP al correo del propietario.
          </p>
        }
        confirmText="Enviar Invitación"
        confirmLoadingText="Enviando..."
        loading={resendLoading}
        error={resendError}
      />

      {/* MODAL DE CONFIRMACIÓN DE APROVISIONAMIENTO / REINTENTO CHATWOOT (Regla 4.17) */}
      <ConfirmationModal
        isOpen={chatwootModalOpen}
        onClose={() => {
          setChatwootModalOpen(false);
          setChatwootError(null);
        }}
        onConfirm={handleExecuteChatwootProvision}
        title={tenant?.chatwoot?.state === "failed" ? "Reintentar Sincronización" : "Aprovisionar en Chatwoot"}
        subtitle="Sincronización del buzón de atención omnicanal, etiquetas canónicas y límites de agentes."
        variant="neutral"
        icon={<MessageSquare className="h-5 w-5 text-cyan-400" />}
        details={[
          { label: "Comercio", value: tenant?.displayName || name },
          { label: "Slug", value: tenant?.slug || editForm.slug, mono: true },
          { label: "Plan", value: tenant?.planName || "Plan Comercial" },
          { label: "Estado Actual", value: tenant?.chatwoot?.state || "Sin Aprovisionar" },
        ]}
        warningTitle="Sincronización de Plataforma"
        warningMessage={
          <p>
            Se conectará con la API de Chatwoot para aprovisionar o actualizar la cuenta corporativa, registrar el buzón webchat, sincronizar las 6 etiquetas comerciales canónicas y registrar el webhook de eventos.
          </p>
        }
        confirmText={tenant?.chatwoot?.state === "failed" ? "Reintentar Sincronización" : "Aprovisionar en Chatwoot"}
        confirmLoadingText="Sincronizando..."
        loading={chatwootLoading}
        error={chatwootError}
      />

      {/* MODAL DE CONFIRMACIÓN DE SUSPENSIÓN CANÓNICO (Regla 4.17) */}
      <ConfirmationModal
        isOpen={suspendModalOpen}
        onClose={() => {
          setSuspendModalOpen(false);
          setStatusError(null);
        }}
        onConfirm={() => handleStatusChange("suspendido")}
        title="Suspender Operación del Comercio"
        subtitle="Interrupción temporal de acceso al portal y servicios del inquilino."
        variant="warning"
        icon={<ShieldAlert className="h-5 w-5 text-amber-500" />}
        details={[
          { label: "Comercio", value: tenant?.displayName || name },
          { label: "Slug", value: tenant?.slug || editForm.slug, mono: true },
          { label: "Estado Actual", value: "Activo" },
        ]}
        warningTitle="Advertencia de Suspensión Temporal"
        warningMessage={
          <p>
            Los usuarios asociados a este inquilino no podrán iniciar sesión ni operar en la plataforma
            hasta que la cuenta sea reactivada por un administrador del sistema.
          </p>
        }
        confirmText="Confirmar Suspensión"
        confirmLoadingText="Suspendiendo..."
        loading={loadingStatus}
        error={statusError}
      />

      {/* MODAL DE CONFIRMACIÓN DE REACTIVACIÓN CANÓNICO (Regla 4.17) */}
      <ConfirmationModal
        isOpen={reactivateModalOpen}
        onClose={() => {
          setReactivateModalOpen(false);
          setStatusError(null);
        }}
        onConfirm={() => handleStatusChange("activo")}
        title="Reactivar Operación del Comercio"
        subtitle="Restablecimiento del acceso completo a los servicios del inquilino."
        variant="neutral"
        icon={<PlayCircle className="h-5 w-5 text-emerald-500" />}
        details={[
          { label: "Comercio", value: tenant?.displayName || name },
          { label: "Slug", value: tenant?.slug || editForm.slug, mono: true },
          { label: "Estado Actual", value: status === "alta" ? "En Alta / Onboarding" : "Suspendido" },
        ]}
        warningTitle="Restablecimiento de Acceso"
        warningMessage={
          <p>
            Al reactivar este comercio, los usuarios vinculados podrán ingresar nuevamente a su portal
            y se restablecerán las operaciones normales de su plan asignado.
          </p>
        }
        confirmText="Reactivar Comercio"
        confirmLoadingText="Reactivando..."
        loading={loadingStatus}
        error={statusError}
      />

      {/* MODAL ESTÁNDAR DE INFORMACIÓN / RESULTADO DE OPERACIÓN (Regla 4.17) */}
      <ConfirmationModal
        isOpen={infoModal.isOpen}
        onClose={() => setInfoModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={() => setInfoModal((prev) => ({ ...prev, isOpen: false }))}
        title={infoModal.title}
        subtitle={infoModal.subtitle}
        variant={infoModal.variant}
        icon={<CheckCircle className="h-5 w-5 text-emerald-500" />}
        warningTitle="Notificación del Sistema"
        warningMessage={<p>{infoModal.message}</p>}
        confirmText="Entendido"
        cancelText="Cerrar"
      />
    </div>
  );
}
