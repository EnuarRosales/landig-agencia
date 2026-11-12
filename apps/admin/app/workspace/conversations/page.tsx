import { cookies } from "next/headers";
import { resolveAuthenticatedPortalContext, getTenantChatwootAccount } from "@mocter/domain";
import { MessageSquare, Lock, Clock, AlertTriangle, RotateCw } from "lucide-react";
import Link from "next/link";
import { env } from "@/env";

export const dynamic = "force-dynamic";

export default async function WorkspaceConversationsPage() {
  const cookieStore = await cookies();
  const isProduction = env.NODE_ENV === "production";
  const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
  const sid = (cookieStore.get(sidCookieName)?.value || cookieStore.get("mocter_sid")?.value)?.trim();

  let hasCapability = false;
  let activeClient: { id: string; displayName?: string } | null = null;

  if (sid) {
    const context = await resolveAuthenticatedPortalContext(sid);
    hasCapability = !!context?.capabilities?.chatwoot_inboxes;
    activeClient = context?.activeClient ?? null;
  }

  // 1. Gating por capacidades del plan comercial
  if (!hasCapability) {
    return (
      <div className="w-full space-y-6 p-4 md:px-8 md:py-6">
        <div className="rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-12 text-center max-w-lg mx-auto shadow-xs">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 mx-auto mb-4 border border-amber-500/20">
            <Lock className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-bold text-[var(--dsn-text)]">
            Bandeja De Conversaciones No Disponible
          </h1>
          <p className="text-xs text-[var(--dsn-text-secondary)] mt-2">
            La integración de mensajería omnicanal requiere un plan comercial con buzones de atención habilitados.
          </p>
          <div className="mt-6">
            <Link
              href="/workspace/billing"
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white hover:opacity-90 transition-opacity"
            >
              <span>Ver Planes Disponibles</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 2. Consulta de estado de la cuenta en la base de datos
  const accountRecord = activeClient ? await getTenantChatwootAccount({ clientId: activeClient.id }) : null;
  const accountState = accountRecord?.state;

  if (!accountRecord || accountState === "pending" || accountState === "provisioning") {
    return (
      <div className="w-full space-y-6 p-4 md:px-8 md:py-6">
        <div className="rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-12 text-center max-w-lg mx-auto shadow-xs">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-400 mx-auto mb-4 border border-cyan-500/20 animate-pulse">
            <Clock className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-bold text-[var(--dsn-text)]">
            Bandeja De Conversaciones En Proceso De Activación
          </h1>
          <p className="text-xs text-[var(--dsn-text-secondary)] mt-2 leading-relaxed">
            El buzón de atención omnicanal se encuentra en proceso de configuración inicial. Esta operación tomará unos instantes; por favor actualiza la página en unos momentos.
          </p>
          <div className="mt-6">
            <Link
              href="/workspace/conversations"
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--dsn-surface-secondary)] border border-[var(--dsn-border)] px-4 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-hover)] transition-colors"
            >
              <RotateCw className="h-3.5 w-3.5" />
              <span>Actualizar Estado</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (accountState === "failed") {
    return (
      <div className="w-full space-y-6 p-4 md:px-8 md:py-6">
        <div className="rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-12 text-center max-w-lg mx-auto shadow-xs">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-400 mx-auto mb-4 border border-rose-500/20">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-bold text-[var(--dsn-text)]">
            Configuración De Bandeja Temporalmente No Disponible
          </h1>
          <p className="text-xs text-[var(--dsn-text-secondary)] mt-2 leading-relaxed">
            No fue posible inicializar la bandeja omnicanal en este momento. El equipo de soporte técnico ha sido notificado para resolver la sincronización a la brevedad.
          </p>
          <div className="mt-6">
            <Link
              href="/workspace/conversations"
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--dsn-surface-secondary)] border border-[var(--dsn-border)] px-4 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-hover)] transition-colors"
            >
              <RotateCw className="h-3.5 w-3.5" />
              <span>Reintentar Verificación</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 3. Cuenta activa: renderizar el iframe conectado a /api/auth/chatwoot/embed?scope=workspace
  return (
    <div className="w-full h-[calc(100vh-65px)] p-4 flex flex-col">
      <header className="flex items-center justify-between pb-3 border-b border-[var(--dsn-border)] mb-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-cyan-400" />
          <h1 className="text-base font-bold text-[var(--dsn-text)]">
            Bandeja De Conversaciones Omnicanal
          </h1>
        </div>
      </header>
      <div className="flex-1 w-full rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] overflow-hidden">
        <iframe
          src="/api/auth/chatwoot/embed?scope=workspace"
          title="Bandeja De Atención Chatwoot"
          className="w-full h-full border-0"
          allow="camera; microphone; clipboard-read; clipboard-write; autoplay; keyboard-map"
        />
      </div>
    </div>
  );
}
