"use client";

import React, { useState } from "react";
import {
  ShieldCheck,
  Users,
  Shield,
  Plus,
  Edit3,
  CheckCircle2,
  AlertCircle,
  X,
  Loader2,
  Lock,
  ChevronRight,
  Sliders,
  MailCheck,
  KeyRound,
  Eye,
  UserCheck,
  UserX,
  Search,
  Building2,
  Clock,
  Sparkles,
} from "lucide-react";
import type { RbacOverviewDto, UserWithRolesDto } from "@mocter/domain";
import { ConfirmationModal } from "@/components/confirmation-modal";

interface RbacViewProps {
  initialData: RbacOverviewDto;
}

export function RbacView({ initialData }: RbacViewProps) {
  const [data, setData] = useState<RbacOverviewDto>(initialData);
  const [activeTab, setActiveTab] = useState<"platform_users" | "tenant_users" | "roles" | "matrix">("tenant_users");
  const [selectedRoleKey, setSelectedRoleKey] = useState<string>("platform_admin");
  const [loading, setLoading] = useState(false);
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Modales
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [detailUser, setDetailUser] = useState<UserWithRolesDto | null>(null);

  // Modal de confirmación accesible (Regla 4.17 · Cero diálogos nativos)
  const [statusConfirm, setStatusConfirm] = useState<{
    isOpen: boolean;
    user: UserWithRolesDto | null;
    targetStatus: "active" | "disabled";
    loading: boolean;
  }>({
    isOpen: false,
    user: null,
    targetStatus: "active",
    loading: false,
  });

  // Formularios
  const [userForm, setUserForm] = useState({
    id: "",
    email: "",
    displayName: "",
    role: "platform_sales",
    status: "active" as "active" | "disabled",
  });

  const [roleForm, setRoleForm] = useState({
    id: "",
    key: "",
    name: "",
    description: "",
    scope: "platform" as "platform" | "tenant" | "community",
    status: "active" as "active" | "disabled",
  });

  const platformUsers = data.platformUsers || data.users.filter(
    (u) => u.scope === "platform" || u.roles.some((r) => r.startsWith("platform_"))
  );

  const tenantUsers = data.tenantUsers || data.users.filter(
    (u) => u.scope === "tenant" || !u.roles.some((r) => r.startsWith("platform_"))
  );

  const filteredPlatformUsers = platformUsers.filter((u) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      u.email.toLowerCase().includes(q) ||
      (u.displayName && u.displayName.toLowerCase().includes(q)) ||
      u.roles.some((r) => r.toLowerCase().includes(q))
    );
  });

  const filteredTenantUsers = tenantUsers.filter((u) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      u.email.toLowerCase().includes(q) ||
      (u.displayName && u.displayName.toLowerCase().includes(q)) ||
      (u.clientName && u.clientName.toLowerCase().includes(q)) ||
      u.roles.some((r) => r.toLowerCase().includes(q))
    );
  });

  async function reloadData() {
    try {
      const res = await fetch("/api/admin/rbac");
      const json = await res.json();
      if (json.ok && json.data) {
        setData(json.data);
      }
    } catch (_err) {
      // Ignorar fallo secundario de recarga
    }
  }

  async function handleSaveUser(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/admin/rbac", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_user",
          ...userForm,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "No se pudo guardar el usuario");
      }

      setFeedback({
        type: "success",
        message: userForm.id
          ? "Usuario y credenciales actualizadas exitosamente."
          : "Nuevo usuario registrado exitosamente en PostgreSQL.",
      });
      setUserModalOpen(false);
      setUserForm({ id: "", email: "", displayName: "", role: "platform_sales", status: "active" });
      await reloadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({ type: "error", message: msg });
    } finally {
      setLoading(false);
    }
  }

  async function handleResendVerification(user: UserWithRolesDto) {
    setActionInProgressId(user.id);
    setFeedback(null);

    try {
      const res = await fetch("/api/admin/rbac", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "resend_verification",
          userId: user.id,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "No se pudo reenviar el correo de verificación");
      }

      setFeedback({
        type: "success",
        message: `Correo de verificación reenviado exitosamente a ${user.email} con plantilla 'auth.verify_email'.`,
      });
      await reloadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({ type: "error", message: msg });
    } finally {
      setActionInProgressId(null);
    }
  }

  async function handleSendPasswordReset(user: UserWithRolesDto) {
    setActionInProgressId(user.id);
    setFeedback(null);

    try {
      const res = await fetch("/api/admin/rbac", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send_password_reset",
          userId: user.id,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "No se pudo enviar el enlace de recuperación");
      }

      setFeedback({
        type: "success",
        message: `Enlace de recuperación de contraseña enviado exitosamente a ${user.email}.`,
      });
      await reloadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({ type: "error", message: msg });
    } finally {
      setActionInProgressId(null);
    }
  }

  async function executeStatusToggle() {
    if (!statusConfirm.user) return;
    setStatusConfirm((prev) => ({ ...prev, loading: true }));
    setFeedback(null);

    try {
      const res = await fetch("/api/admin/rbac", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle_status",
          userId: statusConfirm.user.id,
          status: statusConfirm.targetStatus,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "No se pudo actualizar el estado del usuario");
      }

      setFeedback({
        type: "success",
        message: `Usuario ${statusConfirm.user.email} marcado como ${
          statusConfirm.targetStatus === "active" ? "Activo" : "Suspendido"
        } en el plano de control.`,
      });
      setStatusConfirm({ isOpen: false, user: null, targetStatus: "active", loading: false });
      await reloadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({ type: "error", message: msg });
      setStatusConfirm((prev) => ({ ...prev, loading: false }));
    }
  }

  async function handleSaveRole(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/admin/rbac", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_role",
          ...roleForm,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "No se pudo guardar el rol");
      }

      setFeedback({ type: "success", message: "Rol configurado con éxito en el catálogo de gobernanza." });
      setRoleModalOpen(false);
      setRoleForm({ id: "", key: "", name: "", description: "", scope: "platform", status: "active" });
      await reloadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({ type: "error", message: msg });
    } finally {
      setLoading(false);
    }
  }

  async function handleTogglePermission(permissionKey: string, currentGranted: boolean) {
    setLoading(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/admin/rbac", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle_permission",
          roleKey: selectedRoleKey,
          permissionKey,
          granted: !currentGranted,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "No se pudo actualizar el permiso");
      }

      setFeedback({
        type: "success",
        message: `Permiso '${permissionKey}' ${!currentGranted ? "concedido" : "revocado"} para el rol '${selectedRoleKey}'.`,
      });
      await reloadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({ type: "error", message: msg });
    } finally {
      setLoading(false);
    }
  }

  const selectedRole = data.roles.find((r) => r.key === selectedRoleKey) || data.roles[0];

  return (
    <div className="space-y-6">
      {/* Banner de Feedback Accesible */}
      {feedback && (
        <div
          role="status"
          className={`flex items-center justify-between rounded-xl p-4 text-xs font-medium border ${
            feedback.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              : "bg-red-500/10 border-red-500/20 text-red-400"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-inherit opacity-70 hover:opacity-100"
            aria-label="Cerrar aviso"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Tarjetas KPI de Gobernanza Mobile First */}
      <section aria-label="Indicadores de gobernanza RBAC" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 shadow-xs">
          <span className="text-[11px] font-medium text-[var(--dsn-text-secondary)]">Total Usuarios</span>
          <p className="mt-1 text-2xl font-bold tracking-tight text-[var(--dsn-text)] font-mono">
            {data.kpis.totalUsers}
          </p>
          <div className="mt-1 flex items-center gap-2 text-[10px] font-mono">
            <span className="text-emerald-400">{data.kpis.activeUsers} activos</span>
            <span className="text-[var(--dsn-text-secondary)]">·</span>
            <span className="text-purple-400">{tenantUsers.length} inquilinos</span>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 shadow-xs">
          <span className="text-[11px] font-medium text-[var(--dsn-text-secondary)]">Plataforma vs Inquilinos</span>
          <p className="mt-1 text-2xl font-bold tracking-tight text-[var(--dsn-text)] font-mono">
            {platformUsers.length} <span className="text-sm font-normal text-[var(--dsn-text-secondary)]">/ {tenantUsers.length}</span>
          </p>
          <span className="text-[10px] text-blue-400 font-mono">
            {platformUsers.length} staff corporativo
          </span>
        </div>

        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 shadow-xs">
          <span className="text-[11px] font-medium text-[var(--dsn-text-secondary)]">Roles Definidos</span>
          <p className="mt-1 text-2xl font-bold tracking-tight text-[var(--dsn-text)] font-mono">
            {data.kpis.totalRoles}
          </p>
          <span className="text-[10px] text-[var(--dsn-text-secondary)] font-mono">
            {data.kpis.totalPermissions} permisos en matriz
          </span>
        </div>

        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 shadow-xs">
          <span className="text-[11px] font-medium text-[var(--dsn-text-secondary)]">Control De Acceso</span>
          <p className="mt-1 text-base font-bold text-emerald-400 flex items-center gap-1.5">
            <ShieldCheck className="h-5 w-5" />
            <span>Exclusivo Owner</span>
          </p>
          <span className="text-[10px] text-[var(--dsn-text-secondary)] font-mono">
            Sin auto-bloqueo
          </span>
        </div>
      </section>

      {/* Barra de Filtro y Búsqueda */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-3">
        {/* Selector de Pestañas */}
        <nav
          aria-label="Pestañas de Control de Acceso"
          className="flex flex-wrap items-center gap-2"
        >
          <button
            type="button"
            onClick={() => setActiveTab("tenant_users")}
            className={`inline-flex min-h-[40px] items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "tenant_users"
                ? "bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/30"
                : "text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface-secondary)] hover:text-[var(--dsn-text)]"
            }`}
          >
            <Building2 className="h-4 w-4" />
            <span>Usuarios De Inquilinos ({tenantUsers.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("platform_users")}
            className={`inline-flex min-h-[40px] items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "platform_users"
                ? "bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/30"
                : "text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface-secondary)] hover:text-[var(--dsn-text)]"
            }`}
          >
            <Users className="h-4 w-4" />
            <span>Usuarios De Plataforma ({platformUsers.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("roles")}
            className={`inline-flex min-h-[40px] items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "roles"
                ? "bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/30"
                : "text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface-secondary)] hover:text-[var(--dsn-text)]"
            }`}
          >
            <Shield className="h-4 w-4" />
            <span>Catálogo De Roles ({data.roles.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("matrix")}
            className={`inline-flex min-h-[40px] items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "matrix"
                ? "bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/30"
                : "text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface-secondary)] hover:text-[var(--dsn-text)]"
            }`}
          >
            <Sliders className="h-4 w-4" />
            <span>Matriz De Permisos</span>
          </button>
        </nav>

        {(activeTab === "platform_users" || activeTab === "tenant_users") && (
          <div className="relative min-w-[260px] flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--dsn-text-secondary)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nombre o correo..."
              className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] pl-9 pr-3 py-1.5 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
            />
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          PESTAÑA 1: USUARIOS DE INQUILINOS (Dueños y Operadores)
         ───────────────────────────────────────────────────────────── */}
      {activeTab === "tenant_users" && (
        <section aria-labelledby="heading-tenant-users" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 id="heading-tenant-users" className="text-base font-bold text-[var(--dsn-text)]">
                Directorio De Usuarios De Inquilinos
              </h2>
              <p className="text-xs text-[var(--dsn-text-secondary)]">
                Propietarios de comercios, operadores y solicitudes de registro nativo de la SaaS.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)]">
            <table className="w-full text-left text-xs text-[var(--dsn-text)]">
              <thead className="border-b border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 text-[11px] font-semibold text-[var(--dsn-text-secondary)]">
                <tr>
                  <th scope="col" className="px-4 py-3">Nombre Completo</th>
                  <th scope="col" className="px-4 py-3">Correo Electrónico</th>
                  <th scope="col" className="px-4 py-3">Rol Asignado</th>
                  <th scope="col" className="px-4 py-3">Comercio Asociado</th>
                  <th scope="col" className="px-4 py-3">Ubicación</th>
                  <th scope="col" className="px-4 py-3">Verificación</th>
                  <th scope="col" className="px-4 py-3">Estado</th>
                  <th scope="col" className="px-4 py-3">Fecha De Alta</th>
                  <th scope="col" className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--dsn-border)]">
                {filteredTenantUsers.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-[var(--dsn-text-secondary)]">
                      No se encontraron usuarios de inquilinos con el criterio de búsqueda.
                    </td>
                  </tr>
                ) : (
                  filteredTenantUsers.map((u) => {
                    const isBusy = actionInProgressId === u.id;
                    return (
                      <tr key={u.id} className="transition-colors hover:bg-[var(--dsn-surface-secondary)]/30">
                        <td className="px-4 py-3 font-semibold text-[var(--dsn-text)]">
                          {u.displayName || "Sin nombre registrado"}
                        </td>
                        <td className="px-4 py-3 font-mono text-[var(--dsn-text-secondary)]">
                          {u.email}
                        </td>
                        <td className="px-4 py-3">
                          {u.roles.map((r) => (
                            <span
                              key={r}
                              className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-mono font-semibold ${
                                r === "tenant_owner"
                                  ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                                  : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                              }`}
                            >
                              <ShieldCheck className="h-3 w-3" />
                              {r === "tenant_owner" ? "Dueño De Comercio" : r === "tenant_agent" ? "Agente De Soporte" : r}
                            </span>
                          ))}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium ${
                              u.clientName && u.clientName !== "Pendiente De Onboarding"
                                ? "bg-emerald-500/10 text-emerald-400"
                                : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                            }`}
                          >
                            <Building2 className="h-3 w-3" />
                            {u.clientName || "Pendiente De Onboarding"}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-[10px] text-[var(--dsn-text-secondary)]">
                          {u.identityLocation}
                        </td>
                        <td className="px-4 py-3">
                          {u.emailVerified ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                              <CheckCircle2 className="h-3 w-3" />
                              Verificado
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                              <Clock className="h-3 w-3" />
                              Pendiente
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-mono ${
                              u.status === "active"
                                ? "bg-emerald-500/10 text-emerald-400"
                                : "bg-red-500/10 text-red-400"
                            }`}
                          >
                            {u.status === "active" ? "Activo" : "Suspendido"}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-[var(--dsn-text-secondary)]">
                          {u.createdAt}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {/* Reenviar Verificación */}
                            <button
                              type="button"
                              disabled={u.emailVerified || isBusy}
                              onClick={() => handleResendVerification(u)}
                              title={u.emailVerified ? "Correo ya verificado" : "Reenviar correo de verificación"}
                              className={`inline-flex min-h-[30px] items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                                u.emailVerified
                                  ? "text-[var(--dsn-text-secondary)] opacity-40 cursor-not-allowed"
                                  : "text-amber-400 hover:bg-amber-500/10"
                              }`}
                            >
                              {isBusy ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <MailCheck className="h-3.5 w-3.5" />
                              )}
                              <span>Reenviar Verificación</span>
                            </button>

                            {/* Restablecer Contraseña */}
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleSendPasswordReset(u)}
                              title="Enviar enlace de restablecimiento de contraseña"
                              className="inline-flex min-h-[30px] items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-[var(--dsn-accent)] hover:bg-[var(--dsn-accent)]/10 transition-colors"
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">Recuperar</span>
                            </button>

                            {/* Ficha Detalle */}
                            <button
                              type="button"
                              onClick={() => setDetailUser(u)}
                              title="Ver ficha de identidad y metadatos"
                              className="inline-flex min-h-[30px] items-center rounded px-2 py-1 text-[11px] font-medium text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)] transition-colors"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>

                            {/* Editar */}
                            <button
                              type="button"
                              onClick={() => {
                                setUserForm({
                                  id: u.id,
                                  email: u.email,
                                  displayName: u.displayName || "",
                                  role: u.roles[0] || "tenant_owner",
                                  status: u.status as "active" | "disabled",
                                });
                                setUserModalOpen(true);
                              }}
                              title="Editar usuario"
                              className="inline-flex min-h-[30px] items-center rounded px-2 py-1 text-[11px] font-medium text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)] transition-colors"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>

                            {/* Suspender / Activar */}
                            <button
                              type="button"
                              onClick={() => {
                                setStatusConfirm({
                                  isOpen: true,
                                  user: u,
                                  targetStatus: u.status === "active" ? "disabled" : "active",
                                  loading: false,
                                });
                              }}
                              title={u.status === "active" ? "Suspender acceso" : "Activar usuario"}
                              className={`inline-flex min-h-[30px] items-center rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                                u.status === "active"
                                  ? "text-red-400 hover:bg-red-500/10"
                                  : "text-emerald-400 hover:bg-emerald-500/10"
                              }`}
                            >
                              {u.status === "active" ? (
                                <UserX className="h-3.5 w-3.5" />
                              ) : (
                                <UserCheck className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ─────────────────────────────────────────────────────────────
          PESTAÑA 2: USUARIOS DE PLATAFORMA (admin.users con roles corporativos)
         ───────────────────────────────────────────────────────────── */}
      {activeTab === "platform_users" && (
        <section aria-labelledby="heading-platform-users" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 id="heading-platform-users" className="text-base font-bold text-[var(--dsn-text)]">
                Directorio De Usuarios De Plataforma
              </h2>
              <p className="text-xs text-[var(--dsn-text-secondary)]">
                Personal directivo y operativo con credenciales para gobernar el plano de control corporativo de Mocter.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setUserForm({ id: "", email: "", displayName: "", role: "platform_sales", status: "active" });
                setUserModalOpen(true);
              }}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-[var(--dsn-accent-hover)] active:scale-95 shadow-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Registrar Nuevo Usuario</span>
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)]">
            <table className="w-full text-left text-xs text-[var(--dsn-text)]">
              <thead className="border-b border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 text-[11px] font-semibold text-[var(--dsn-text-secondary)]">
                <tr>
                  <th scope="col" className="px-4 py-3">Nombre Completo</th>
                  <th scope="col" className="px-4 py-3">Correo Electrónico</th>
                  <th scope="col" className="px-4 py-3">Rol Asignado</th>
                  <th scope="col" className="px-4 py-3">Ubicación Identidad</th>
                  <th scope="col" className="px-4 py-3">Estado</th>
                  <th scope="col" className="px-4 py-3">Fecha De Alta</th>
                  <th scope="col" className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--dsn-border)]">
                {filteredPlatformUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-[var(--dsn-text-secondary)]">
                      No se encontraron usuarios de plataforma.
                    </td>
                  </tr>
                ) : (
                  filteredPlatformUsers.map((u) => {
                    const isBusy = actionInProgressId === u.id;
                    const isOwner = u.roles.includes("platform_owner");
                    return (
                      <tr key={u.id} className="transition-colors hover:bg-[var(--dsn-surface-secondary)]/30">
                        <td className="px-4 py-3 font-semibold text-[var(--dsn-text)]">
                          {u.displayName || "Sin nombre registrado"}
                        </td>
                        <td className="px-4 py-3 font-mono text-[var(--dsn-text-secondary)]">
                          {u.email}
                        </td>
                        <td className="px-4 py-3">
                          {u.roles.map((r) => (
                            <span
                              key={r}
                              className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-mono font-semibold ${
                                r === "platform_owner"
                                  ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                                  : r === "platform_admin"
                                  ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                  : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              }`}
                            >
                              <ShieldCheck className="h-3 w-3" />
                              {r}
                            </span>
                          ))}
                        </td>
                        <td className="px-4 py-3 font-mono text-[10px] text-[var(--dsn-text-secondary)]">
                          {u.identityLocation}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-mono ${
                              u.status === "active"
                                ? "bg-emerald-500/10 text-emerald-400"
                                : "bg-red-500/10 text-red-400"
                            }`}
                          >
                            {u.status === "active" ? "Activo" : "Suspendido"}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-[var(--dsn-text-secondary)]">
                          {u.createdAt}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {/* Restablecer Contraseña */}
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleSendPasswordReset(u)}
                              title="Enviar enlace de restablecimiento de contraseña"
                              className="inline-flex min-h-[30px] items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-[var(--dsn-accent)] hover:bg-[var(--dsn-accent)]/10 transition-colors"
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">Recuperar</span>
                            </button>

                            {/* Ficha Detalle */}
                            <button
                              type="button"
                              onClick={() => setDetailUser(u)}
                              title="Ver ficha de identidad"
                              className="inline-flex min-h-[30px] items-center rounded px-2 py-1 text-[11px] font-medium text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)] transition-colors"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>

                            {/* Editar Rol */}
                            <button
                              type="button"
                              onClick={() => {
                                setUserForm({
                                  id: u.id,
                                  email: u.email,
                                  displayName: u.displayName || "",
                                  role: u.roles[0] || "platform_sales",
                                  status: u.status as "active" | "disabled",
                                });
                                setUserModalOpen(true);
                              }}
                              className="inline-flex min-h-[30px] items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-[var(--dsn-accent)] hover:bg-[var(--dsn-accent)]/10"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                              <span>Editar Rol</span>
                            </button>

                            {/* Suspender / Activar */}
                            <button
                              type="button"
                              disabled={isOwner}
                              title={isOwner ? "No se puede suspender al Platform Owner" : u.status === "active" ? "Suspender acceso" : "Activar usuario"}
                              onClick={() => {
                                setStatusConfirm({
                                  isOpen: true,
                                  user: u,
                                  targetStatus: u.status === "active" ? "disabled" : "active",
                                  loading: false,
                                });
                              }}
                              className={`inline-flex min-h-[30px] items-center rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                                isOwner
                                  ? "text-[var(--dsn-text-secondary)] opacity-40 cursor-not-allowed"
                                  : u.status === "active"
                                  ? "text-red-400 hover:bg-red-500/10"
                                  : "text-emerald-400 hover:bg-emerald-500/10"
                              }`}
                            >
                              {u.status === "active" ? (
                                <UserX className="h-3.5 w-3.5" />
                              ) : (
                                <UserCheck className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ─────────────────────────────────────────────────────────────
          PESTAÑA 3: CATÁLOGO DE ROLES (admin.system_roles)
         ───────────────────────────────────────────────────────────── */}
      {activeTab === "roles" && (
        <section aria-labelledby="heading-roles" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 id="heading-roles" className="text-base font-bold text-[var(--dsn-text)]">
                Catálogo De Roles y Ámbitos De Acceso
              </h2>
              <p className="text-xs text-[var(--dsn-text-secondary)]">
                Definición formal de roles en tres ámbitos independientes (Plataforma, Inquilino, Comunidad).
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setRoleForm({ id: "", key: "", name: "", description: "", scope: "platform", status: "active" });
                setRoleModalOpen(true);
              }}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-[var(--dsn-accent-hover)] active:scale-95 shadow-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Crear Rol Personalizado</span>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.roles.map((r) => (
              <div
                key={r.key}
                className="flex flex-col justify-between rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 shadow-xs transition-all hover:border-[var(--dsn-accent)]/50"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-[var(--dsn-surface-secondary)] text-[var(--dsn-text-secondary)]">
                      Ámbito: {r.scope.toUpperCase()}
                    </span>
                    {r.isSystem ? (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-mono text-amber-400">
                        <Lock className="h-3 w-3" /> Rol Del Sistema
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded bg-blue-500/10 px-2 py-0.5 text-[10px] font-mono text-blue-400">
                        Personalizado
                      </span>
                    )}
                  </div>

                  <h3 className="mt-3 text-sm font-bold text-[var(--dsn-text)] flex items-center gap-2">
                    <Shield className="h-4 w-4 text-[var(--dsn-accent)]" />
                    <span>{r.name}</span>
                  </h3>
                  <p className="mt-0.5 font-mono text-[11px] text-[var(--dsn-accent)]">
                    {r.key}
                  </p>
                  <p className="mt-2 text-xs text-[var(--dsn-text-secondary)] leading-relaxed">
                    {r.description}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-[var(--dsn-border)]/50 flex items-center justify-between text-xs">
                  <span className="text-[var(--dsn-text-secondary)] font-mono">
                    {r.assignedUsersCount} usuarios vinculados
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRoleKey(r.key);
                      setActiveTab("matrix");
                    }}
                    className="inline-flex items-center gap-1 text-[var(--dsn-accent)] hover:underline font-semibold"
                  >
                    <span>Configurar Permisos</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ─────────────────────────────────────────────────────────────
          PESTAÑA 4: MATRIZ DE PERMISOS POR ROL (admin.role_permissions)
         ───────────────────────────────────────────────────────────── */}
      {activeTab === "matrix" && (
        <section aria-labelledby="heading-matrix" className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 id="heading-matrix" className="text-base font-bold text-[var(--dsn-text)]">
                Matriz De Permisos Por Rol (RBAC Core Del Owner)
              </h2>
              <p className="text-xs text-[var(--dsn-text-secondary)]">
                Selecciona un rol para auditar y activar o revocar capacidades específicas en tiempo real.
              </p>
            </div>

            {/* Selector de Rol Activo para la Matriz */}
            <div className="flex items-center gap-2">
              <label htmlFor="matrix-role-selector" className="text-xs font-semibold text-[var(--dsn-text-secondary)]">
                Auditar Rol:
              </label>
              <select
                id="matrix-role-selector"
                value={selectedRoleKey}
                onChange={(e) => setSelectedRoleKey(e.target.value)}
                className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-1.5 text-xs font-semibold text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
              >
                {data.roles.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.name} ({r.scope})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Tarjeta de Resumen del Rol Seleccionado */}
          <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-[var(--dsn-accent)]/15 p-2 text-[var(--dsn-accent)]">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[var(--dsn-text)]">
                  {selectedRole?.name} ({selectedRole?.key})
                </h3>
                <p className="text-xs text-[var(--dsn-text-secondary)]">
                  {selectedRole?.description}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="text-emerald-400">
                {selectedRole?.permissions.length} permisos concedidos
              </span>
              <span className="text-[var(--dsn-text-secondary)]">·</span>
              <span className="text-[var(--dsn-text-secondary)]">
                {selectedRole?.assignedUsersCount} usuarios
              </span>
            </div>
          </div>

          {/* Grilla de Permisos Agrupados por Módulo */}
          <div className="space-y-6">
            {data.permissionModules.map((m) => (
              <div
                key={m.module}
                className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] overflow-hidden"
              >
                <div className="border-b border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 px-4 py-2.5">
                  <h4 className="text-xs font-bold text-[var(--dsn-text)] uppercase tracking-wider">
                    {m.module}
                  </h4>
                </div>
                <div className="divide-y divide-[var(--dsn-border)]">
                  {m.permissions.map((p) => {
                    const isGranted = selectedRole?.permissions.includes(p.key) || false;
                    const isOwnerRole = selectedRoleKey === "platform_owner";
                    return (
                      <div
                        key={p.key}
                        className="flex items-center justify-between p-4 transition-colors hover:bg-[var(--dsn-surface-secondary)]/20"
                      >
                        <div className="pr-4">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-[var(--dsn-text)]">{p.name}</span>
                            <span className="font-mono text-[10px] text-[var(--dsn-text-secondary)]">
                              {p.key}
                            </span>
                            {p.isCritical && (
                              <span className="rounded bg-rose-500/10 px-1.5 py-0.5 text-[9px] font-mono text-rose-400">
                                Crítico
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-[var(--dsn-text-secondary)]">
                            {p.description}
                          </p>
                        </div>

                        <div>
                          <button
                            type="button"
                            disabled={isOwnerRole || loading}
                            onClick={() => handleTogglePermission(p.key, isGranted)}
                            title={
                              isOwnerRole
                                ? "Platform Owner posee todos los permisos irrevocablemente"
                                : isGranted
                                ? "Revocar permiso"
                                : "Conceder permiso"
                            }
                            className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
                              isGranted
                                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25"
                                : "bg-[var(--dsn-surface-secondary)] text-[var(--dsn-text-secondary)] border border-[var(--dsn-border)] hover:bg-[var(--dsn-surface-secondary)]/80"
                            } ${isOwnerRole ? "opacity-70 cursor-not-allowed" : ""}`}
                          >
                            {isGranted ? (
                              <>
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                <span>Concedido</span>
                              </>
                            ) : (
                              <>
                                <X className="h-3.5 w-3.5" />
                                <span>Revocado</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL 1: REGISTRAR O EDITAR USUARIO (Title Case en Labels)
         ───────────────────────────────────────────────────────────── */}
      {userModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-user-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
        >
          <div className="w-full max-w-lg rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--dsn-border)] pb-3">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-[var(--dsn-accent)]" />
                <h3 id="modal-user-title" className="text-base font-bold text-[var(--dsn-text)]">
                  {userForm.id ? "Editar Usuario" : "Registrar Nuevo Usuario"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setUserModalOpen(false)}
                className="text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
                aria-label="Cerrar modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="mt-4 space-y-4">
              <div>
                <label
                  htmlFor="user-email"
                  className="block text-xs font-semibold text-[var(--dsn-text)] mb-1"
                >
                  Correo Electrónico Corporativo
                </label>
                <input
                  id="user-email"
                  type="email"
                  required
                  disabled={Boolean(userForm.id)}
                  placeholder="ej. usuario@empresa.com"
                  value={userForm.email}
                  onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                  className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden disabled:opacity-60"
                />
              </div>

              <div>
                <label
                  htmlFor="user-name"
                  className="block text-xs font-semibold text-[var(--dsn-text)] mb-1"
                >
                  Nombre Completo Del Usuario
                </label>
                <input
                  id="user-name"
                  type="text"
                  required
                  placeholder="ej. Carlos Mendoza"
                  value={userForm.displayName}
                  onChange={(e) => setUserForm({ ...userForm, displayName: e.target.value })}
                  className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="user-role"
                    className="block text-xs font-semibold text-[var(--dsn-text)] mb-1"
                  >
                    Rol Asignado
                  </label>
                  <select
                    id="user-role"
                    required
                    value={userForm.role}
                    onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
                  >
                    {data.roles.map((r) => (
                      <option key={r.key} value={r.key}>
                        {r.name} ({r.scope})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="user-status"
                    className="block text-xs font-semibold text-[var(--dsn-text)] mb-1"
                  >
                    Estado Operativo Del Usuario
                  </label>
                  <select
                    id="user-status"
                    value={userForm.status}
                    onChange={(e) =>
                      setUserForm({ ...userForm, status: e.target.value as "active" | "disabled" })
                    }
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
                  >
                    <option value="active">Activo</option>
                    <option value="disabled">Suspendido</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-[var(--dsn-border)] pt-4">
                <button
                  type="button"
                  onClick={() => setUserModalOpen(false)}
                  className="inline-flex min-h-[44px] items-center rounded-lg border border-[var(--dsn-border)] px-4 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--dsn-accent-hover)] active:scale-95 disabled:opacity-50"
                >
                  {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Guardar Usuario</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL 2: CREAR / EDITAR ROL (Title Case en Labels)
         ───────────────────────────────────────────────────────────── */}
      {roleModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-role-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
        >
          <div className="w-full max-w-lg rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--dsn-border)] pb-3">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-[var(--dsn-accent)]" />
                <h3 id="modal-role-title" className="text-base font-bold text-[var(--dsn-text)]">
                  {roleForm.id ? "Editar Rol" : "Crear Rol Personalizado"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRoleModalOpen(false)}
                className="text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
                aria-label="Cerrar modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRole} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="role-key"
                    className="block text-xs font-semibold text-[var(--dsn-text)] mb-1"
                  >
                    Clave Identificadora Del Rol
                  </label>
                  <input
                    id="role-key"
                    type="text"
                    required
                    disabled={Boolean(roleForm.id)}
                    placeholder="ej. platform_auditor"
                    value={roleForm.key}
                    onChange={(e) => setRoleForm({ ...roleForm, key: e.target.value })}
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-sm font-mono text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden disabled:opacity-60"
                  />
                </div>

                <div>
                  <label
                    htmlFor="role-name"
                    className="block text-xs font-semibold text-[var(--dsn-text)] mb-1"
                  >
                    Nombre Descriptivo Del Rol
                  </label>
                  <input
                    id="role-name"
                    type="text"
                    required
                    placeholder="ej. Auditor De Cumplimiento"
                    value={roleForm.name}
                    onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="role-scope"
                  className="block text-xs font-semibold text-[var(--dsn-text)] mb-1"
                >
                  Ámbito De Aplicación Del Rol
                </label>
                <select
                  id="role-scope"
                  value={roleForm.scope}
                  onChange={(e) =>
                    setRoleForm({
                      ...roleForm,
                      scope: e.target.value as "platform" | "tenant" | "community",
                    })
                  }
                  className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
                >
                  <option value="platform">Plataforma (Plano De Control)</option>
                  <option value="tenant">Inquilino (Espacio De Trabajo)</option>
                  <option value="community">Comunidad</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="role-description"
                  className="block text-xs font-semibold text-[var(--dsn-text)] mb-1"
                >
                  Descripción Operativa Del Rol
                </label>
                <textarea
                  id="role-description"
                  rows={3}
                  required
                  placeholder="Detalla las responsabilidades y alcance de este rol..."
                  value={roleForm.description}
                  onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                  className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] p-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-[var(--dsn-border)] pt-4">
                <button
                  type="button"
                  onClick={() => setRoleModalOpen(false)}
                  className="inline-flex min-h-[44px] items-center rounded-lg border border-[var(--dsn-border)] px-4 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--dsn-accent-hover)] active:scale-95 disabled:opacity-50"
                >
                  {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Guardar Rol</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL 3: FICHA DETALLADA DE IDENTIDAD DE USUARIO
         ───────────────────────────────────────────────────────────── */}
      {detailUser && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-detail-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
        >
          <div className="w-full max-w-lg rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--dsn-border)] pb-3">
              <div className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-[var(--dsn-accent)]" />
                <h3 id="modal-detail-title" className="text-base font-bold text-[var(--dsn-text)]">
                  Ficha De Identidad Del Usuario
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDetailUser(null)}
                className="text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
                aria-label="Cerrar ficha"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 p-4">
                <div>
                  <span className="text-[10px] text-[var(--dsn-text-secondary)] font-medium">Nombre Completo</span>
                  <p className="font-semibold text-[var(--dsn-text)] mt-0.5">{detailUser.displayName || "Sin nombre registrado"}</p>
                </div>
                <div>
                  <span className="text-[10px] text-[var(--dsn-text-secondary)] font-medium">Correo Electrónico</span>
                  <p className="font-mono text-[var(--dsn-text)] mt-0.5 truncate">{detailUser.email}</p>
                </div>
                <div>
                  <span className="text-[10px] text-[var(--dsn-text-secondary)] font-medium">Estado De Cuenta</span>
                  <p className="mt-0.5">
                    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-mono ${
                      detailUser.status === "active" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                    }`}>
                      {detailUser.status === "active" ? "Activo" : "Suspendido"}
                    </span>
                  </p>
                </div>
                <div>
                  <span className="text-[10px] text-[var(--dsn-text-secondary)] font-medium">Verificación De Correo</span>
                  <p className="mt-0.5">
                    {detailUser.emailVerified ? (
                      <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                        <CheckCircle2 className="h-3 w-3" /> Verificado {detailUser.emailVerifiedAt ? `(${detailUser.emailVerifiedAt.split("T")[0]})` : ""}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-400 font-medium">
                        <Clock className="h-3 w-3" /> Pendiente de confirmación
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="space-y-2 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/20 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[var(--dsn-text-secondary)] font-medium">Identificador Único (UUID)</span>
                  <span className="font-mono text-[11px] text-[var(--dsn-text)]">{detailUser.id}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[var(--dsn-text-secondary)] font-medium">Ámbito De Identidad</span>
                  <span className="font-mono text-[11px] uppercase text-[var(--dsn-accent)]">{detailUser.scope}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[var(--dsn-text-secondary)] font-medium">Comercio / Inquilino</span>
                  <span className="font-medium text-[var(--dsn-text)]">{detailUser.clientName || "Sin cliente vinculado"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[var(--dsn-text-secondary)] font-medium">Ubicación De Célula</span>
                  <span className="font-mono text-[11px] text-[var(--dsn-text)]">{detailUser.identityLocation}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[var(--dsn-text-secondary)] font-medium">Fecha De Registro</span>
                  <span className="font-mono text-[11px] text-[var(--dsn-text)]">{detailUser.createdAt}</span>
                </div>
              </div>

              <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/20 p-4">
                <span className="text-[10px] text-[var(--dsn-text-secondary)] font-medium">Roles Asignados</span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {detailUser.roles.map((r) => (
                    <span
                      key={r}
                      className="rounded bg-purple-500/10 px-2 py-0.5 text-[10px] font-mono text-purple-400 border border-purple-500/20"
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-[var(--dsn-border)] pt-4">
                <button
                  type="button"
                  onClick={() => setDetailUser(null)}
                  className="inline-flex min-h-[44px] items-center rounded-lg border border-[var(--dsn-border)] px-4 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)]"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL 4: CONFIRMACIÓN ACCESIBLE (Regla 4.17 · Cero diálogos nativos)
         ───────────────────────────────────────────────────────────── */}
      <ConfirmationModal
        isOpen={statusConfirm.isOpen}
        onClose={() => setStatusConfirm({ isOpen: false, user: null, targetStatus: "active", loading: false })}
        onConfirm={executeStatusToggle}
        title={statusConfirm.targetStatus === "disabled" ? "Suspender Usuario" : "Reactivar Usuario"}
        subtitle={`Confirmación requerida para cambiar el estado operativo en el plano de control.`}
        variant={statusConfirm.targetStatus === "disabled" ? "danger" : "neutral"}
        confirmText={statusConfirm.targetStatus === "disabled" ? "Suspender Usuario" : "Reactivar Usuario"}
        confirmLoadingText="Actualizando Estado..."
        loading={statusConfirm.loading}
        warningTitle={statusConfirm.targetStatus === "disabled" ? "Acceso Restringido" : "Reactivación De Credenciales"}
        warningMessage={
          statusConfirm.targetStatus === "disabled"
            ? "Al suspender este usuario, se revocarán todas sus sesiones activas y se impedirá el inicio de sesión hasta que un Platform Owner lo reactive."
            : "Al reactivar este usuario, se restituirá de inmediato su capacidad de autenticarse en la plataforma."
        }
        details={
          statusConfirm.user
            ? [
                { label: "Nombre Completo", value: statusConfirm.user.displayName || "Sin nombre registrado" },
                { label: "Correo Electrónico", value: statusConfirm.user.email, mono: true },
                { label: "Rol Principal", value: statusConfirm.user.roles[0] || "Sin Rol" },
                { label: "Ámbito", value: statusConfirm.user.scope.toUpperCase() },
              ]
            : []
        }
      />
    </div>
  );
}
