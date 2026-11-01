import React from "react";
import Link from "next/link";
import { getAdminDictionary } from "@/lib/i18n";
import { env } from "@/env";
import { MessageSquare, ExternalLink, Settings, ShieldCheck, Inbox } from "lucide-react";

interface AdminConversationsPageProps {
  searchParams?: Promise<{ view?: string }> | { view?: string };
}

/**
 * Vista administrativa de atención omnicanal (`ADM-001 D-32`, `CHW-001 §6.2`).
 *
 * Integra Chatwoot como bandeja embebida en un iframe same-site sobre mocter-admin.
 * Para el Platform Owner corporativo, el acceso prioritario y por defecto se dirige
 * a la **Zona Admin del propio Chatwoot** (`/app/accounts/1/settings` y `/super_admin`).
 */
export default async function AdminConversationsPage({
  searchParams,
}: AdminConversationsPageProps = {}) {
  const dict = getAdminDictionary("es").conversations;
  const resolvedParams = searchParams ? await searchParams : {};
  const currentView = resolvedParams?.view || "admin";

  const chatwootBaseUrl = env.CHATWOOT_BASE_URL || "http://localhost:3000";

  const views = {
    admin: {
      path: "/app/accounts/1/settings",
      label: "Zona Admin (Canales y Ajustes)",
      badge: "Configuración",
      icon: Settings,
    },
    inbox: {
      path: "/app/accounts/1/inbox",
      label: "Bandeja Operativa",
      badge: "Chats",
      icon: Inbox,
    },
    super_admin: {
      path: "/super_admin",
      label: "Super Admin Global",
      badge: "Instancia",
      icon: ShieldCheck,
    },
  };

  const activeConfig = views[currentView as keyof typeof views] || views.admin;
  const iframeSrc = `${chatwootBaseUrl}${activeConfig.path}`;

  return (
    <main className="flex h-[calc(100dvh-65px)] flex-col space-y-4 p-4 md:p-6">
      {/* Encabezado con selector de zona administrativa para el Owner */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--dsn-border)] pb-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-[var(--dsn-accent)]/15 p-2 text-[var(--dsn-accent)]">
            <MessageSquare className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-[var(--dsn-text)]">
                {dict.title || "Administración Y Atención Omnicanal (Chatwoot)"}
              </h1>
              <span className="rounded bg-amber-500/15 text-amber-400 px-2 py-0.5 text-[10px] font-mono font-semibold border border-amber-500/20">
                Owner Admin Zone
              </span>
            </div>
            <p className="text-xs text-[var(--dsn-text-secondary)] mt-0.5">
              Acceso administrativo directo del Platform Owner a la configuración, canales, inboxes y mensajería de Chatwoot.
            </p>
          </div>
        </div>

        {/* Pestañas de Navegación de la Zona Admin del Owner */}
        <div className="flex flex-wrap items-center gap-2.5">
          <nav
            aria-label="Vistas de administración Chatwoot"
            className="inline-flex rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] p-1"
          >
            <Link
              href="/admin/conversations?view=admin"
              className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-all ${
                currentView === "admin"
                  ? "bg-[var(--dsn-accent)] text-white shadow-xs"
                  : "text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
              }`}
            >
              <Settings className="h-3.5 w-3.5" />
              <span>Zona Admin</span>
            </Link>

            <Link
              href="/admin/conversations?view=inbox"
              className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-all ${
                currentView === "inbox"
                  ? "bg-[var(--dsn-accent)] text-white shadow-xs"
                  : "text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
              }`}
            >
              <Inbox className="h-3.5 w-3.5" />
              <span>Bandeja Chats</span>
            </Link>

            <Link
              href="/admin/conversations?view=super_admin"
              className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-all ${
                currentView === "super_admin"
                  ? "bg-[var(--dsn-accent)] text-white shadow-xs"
                  : "text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Super Admin</span>
            </Link>
          </nav>

          <a
            href={iframeSrc}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)]"
          >
            <span>{dict.openDirectly}</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </header>

      {/* Contenedor del Iframe con restricciones de seguridad sandbox */}
      <div className="relative flex-1 overflow-hidden rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] shadow-inner">
        <iframe
          title="Chatwoot Omnichannel Inbox"
          src={iframeSrc}
          className="h-full w-full border-0"
          allow="camera; microphone; clipboard-write; autoplay"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
        />
      </div>
    </main>
  );
}
