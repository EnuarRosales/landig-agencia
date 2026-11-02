"use client";

import React, { useState } from "react";
import {
  ShieldCheck,
  Users,
  Key,
  Shield,
  Plus,
  Edit3,
  CheckCircle2,
  AlertCircle,
  X,
  Loader2,
  Lock,
  Check,
  ChevronRight,
  Sliders,
} from "lucide-react";
import type { RbacOverviewDto } from "@mocter/domain";

interface RbacViewProps {
  initialData: RbacOverviewDto;
}

export function RbacView({ initialData }: RbacViewProps) {
  const [data, setData] = useState<RbacOverviewDto>(initialData);
  const [activeTab, setActiveTab] = useState<"users" | "roles" | "matrix">("users");
  const [selectedRoleKey, setSelectedRoleKey] = useState<string>("platform_admin");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Modales
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [roleModalOpen, setRoleModalOpen] = useState(false);

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
          ? "Usuario y rol de plataforma actualizados exitosamente."
          : "Nuevo usuario registrado y vinculado al rol de plataforma en PostgreSQL.",
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
      {/* Banner de Feedback */}
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
          <span className="text-[10px] text-emerald-400 font-mono">
            {data.kpis.activeUsers} activos
          </span>
        </div>

        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 shadow-xs">
          <span className="text-[11px] font-medium text-[var(--dsn-text-secondary)]">Roles Definidos</span>
          <p className="mt-1 text-2xl font-bold tracking-tight text-[var(--dsn-text)] font-mono">
            {data.kpis.totalRoles}
          </p>
          <span className="text-[10px] text-[var(--dsn-text-secondary)] font-mono">
            3 de plataforma
          </span>
        </div>

        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 shadow-xs">
          <span className="text-[11px] font-medium text-[var(--dsn-text-secondary)]">Permisos Del Sistema</span>
          <p className="mt-1 text-2xl font-bold tracking-tight text-[var(--dsn-text)] font-mono">
            {data.kpis.totalPermissions}
          </p>
          <span className="text-[10px] text-[var(--dsn-text-secondary)] font-mono">
            9 módulos corporativos
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

      {/* Selector de Pestañas */}
      <nav
        aria-label="Pestañas de Control de Acceso"
        className="flex flex-wrap items-center gap-2 border-b border-[var(--dsn-border)] pb-2"
      >
        <button
          type="button"
          onClick={() => setActiveTab("users")}
          className={`inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
            activeTab === "users"
              ? "bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/30"
              : "text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface)] hover:text-[var(--dsn-text)]"
          }`}
        >
          <Users className="h-4 w-4" />
          <span>Usuarios Del Sistema ({data.users.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("roles")}
          className={`inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
            activeTab === "roles"
              ? "bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/30"
              : "text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface)] hover:text-[var(--dsn-text)]"
          }`}
        >
          <Shield className="h-4 w-4" />
          <span>Catálogo De Roles ({data.roles.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("matrix")}
          className={`inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
            activeTab === "matrix"
              ? "bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/30"
              : "text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface)] hover:text-[var(--dsn-text)]"
          }`}
        >
          <Sliders className="h-4 w-4" />
          <span>Matriz De Permisos Por Rol</span>
        </button>
      </nav>

      {/* ─────────────────────────────────────────────────────────────
          PESTAÑA 1: USUARIOS DEL SISTEMA (admin.users)
         ───────────────────────────────────────────────────────────── */}
      {activeTab === "users" && (
        <section aria-labelledby="heading-users" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 id="heading-users" className="text-base font-bold text-[var(--dsn-text)]">
                Directorio De Usuarios De Plataforma
              </h2>
              <p className="text-xs text-[var(--dsn-text-secondary)]">
                Usuarios con credenciales de acceso al plano de control corporativo de Mocter.
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
                {data.users.map((u) => (
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
                        className="inline-flex min-h-[32px] items-center gap-1 rounded px-2.5 py-1 text-xs font-medium text-[var(--dsn-accent)] hover:bg-[var(--dsn-accent)]/10"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        <span>Editar Rol</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ─────────────────────────────────────────────────────────────
          PESTAÑA 2: CATÁLOGO DE ROLES (admin.system_roles)
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
          PESTAÑA 3: MATRIZ DE PERMISOS POR ROL (admin.role_permissions)
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
          </div>

          {/* Selector de Rol Horizontal */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-3">
            <span className="text-xs font-semibold text-[var(--dsn-text)] mr-2">
              Rol Activo:
            </span>
            {data.roles.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setSelectedRoleKey(r.key)}
                className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  selectedRoleKey === r.key
                    ? "bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/30"
                    : "bg-[var(--dsn-surface-secondary)] text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
                }`}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>{r.name}</span>
                <span
                  className={`ml-1 rounded px-1.5 py-0.5 text-[10px] font-mono ${
                    selectedRoleKey === r.key
                      ? "bg-[var(--dsn-accent)]/20 text-[var(--dsn-accent)] font-bold"
                      : "bg-[var(--dsn-surface)] text-[var(--dsn-text-secondary)]"
                  }`}
                >
                  {r.permissions.length}
                </span>
              </button>
            ))}
          </div>

          {/* Banner Informativo del Rol Seleccionado */}
          <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)]/80 p-5 backdrop-blur-xs flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-[var(--dsn-text)]">
                  Configuración para: {selectedRole.name} ({selectedRole.key})
                </span>
                {selectedRole.key === "platform_owner" && (
                  <span className="rounded bg-purple-500/10 px-2 py-0.5 text-[10px] font-mono text-purple-400">
                    Propietario Supremo
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--dsn-text-secondary)] mt-1">
                {selectedRole.description}
              </p>
            </div>

            <div className="text-right">
              <span className="text-xs font-medium text-[var(--dsn-text-secondary)]">
                Permisos Concedidos:
              </span>
              <p className="text-lg font-bold text-[var(--dsn-accent)] font-mono">
                {selectedRole.permissions.length} / {data.kpis.totalPermissions}
              </p>
            </div>
          </div>

          {/* Grilla de Permisos Agrupados por Módulo */}
          <div className="space-y-6">
            {data.permissionModules.map((mod) => (
              <div
                key={mod.module}
                className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 space-y-4"
              >
                <div className="border-b border-[var(--dsn-border)] pb-2 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[var(--dsn-text)] flex items-center gap-2">
                    <Key className="h-4 w-4 text-[var(--dsn-accent)]" />
                    <span>Módulo: {mod.module}</span>
                  </h3>
                  <span className="text-[11px] text-[var(--dsn-text-secondary)] font-mono">
                    {mod.permissions.filter((p) => selectedRole.permissions.includes(p.key)).length} / {mod.permissions.length} activos
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {mod.permissions.map((perm) => {
                    const isGranted = selectedRole.permissions.includes(perm.key);
                    const isOwnerProtected =
                      selectedRole.key === "platform_owner" &&
                      (perm.key === "platform.governance.manage" ||
                        perm.key === "platform.roles.manage" ||
                        perm.key === "platform.users.manage");

                    return (
                      <div
                        key={perm.key}
                        className={`flex flex-col justify-between rounded-lg border p-3.5 transition-all ${
                          isGranted
                            ? "border-[var(--dsn-accent)]/30 bg-[var(--dsn-accent)]/5"
                            : "border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 opacity-70"
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[10px] text-[var(--dsn-accent)]">
                              {perm.key}
                            </span>
                            {perm.isCritical && (
                              <span className="rounded bg-red-500/10 px-1.5 py-0.2 text-[9px] font-mono text-red-400">
                                Crítico
                              </span>
                            )}
                          </div>
                          <h4 className="mt-1.5 text-xs font-semibold text-[var(--dsn-text)]">
                            {perm.name}
                          </h4>
                          <p className="mt-1 text-[11px] text-[var(--dsn-text-secondary)] leading-relaxed">
                            {perm.description}
                          </p>
                        </div>

                        <div className="mt-3 pt-2.5 border-t border-[var(--dsn-border)]/50 flex items-center justify-between">
                          <span className="text-[10px] font-mono text-[var(--dsn-text-secondary)]">
                            {isGranted ? "Habilitado" : "Denegado"}
                          </span>

                          {isOwnerProtected ? (
                            <span className="inline-flex items-center gap-1 rounded bg-purple-500/10 px-2 py-0.5 text-[10px] font-mono text-purple-400">
                              <Lock className="h-3 w-3" /> Bloqueado
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={loading}
                              onClick={() => handleTogglePermission(perm.key, isGranted)}
                              className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
                                isGranted
                                  ? "bg-[var(--dsn-accent)] text-white hover:bg-[var(--dsn-accent-hover)]"
                                  : "bg-[var(--dsn-surface-secondary)] text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface)] hover:text-[var(--dsn-text)]"
                              }`}
                            >
                              {isGranted ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                              <span>{isGranted ? "Activo" : "Inactivo"}</span>
                            </button>
                          )}
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
          MODAL 1: REGISTRAR / EDITAR USUARIO (Title Case en Labels)
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
                  {userForm.id ? "Editar Rol y Estado Del Usuario" : "Registrar Nuevo Usuario De Plataforma"}
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
                  placeholder="ej. operador@mocter.co"
                  value={userForm.email}
                  onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                  className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-sm font-mono text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden disabled:opacity-60"
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
                    Rol De Plataforma Asignado
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
    </div>
  );
}

