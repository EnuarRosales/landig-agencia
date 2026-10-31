import React from "react";
import { getAdminDictionary } from "@/lib/i18n";

/**
 * Vista administrativa de atención omnicanal (`ADM-001 D-32`, `CHW-001 §6.2`).
 *
 * Integra Chatwoot como bandeja embebida en un iframe same-site sobre mocter-admin,
 * evitando redirecciones de nivel superior o duplicidad de bandejas.
 */
export default function AdminConversationsPage() {
  const dict = getAdminDictionary("es").conversations;
  const chatwootBaseUrl = process.env.CHATWOOT_BASE_URL || "http://localhost:3001";
  const iframeSrc = `${chatwootBaseUrl}/app/accounts/1/inbox`;

  return (
    <main className="flex h-[calc(100dvh-65px)] flex-col space-y-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--dsn-border)] pb-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--dsn-text)]">{dict.title}</h1>
          <p className="text-xs text-[var(--dsn-muted)]">{dict.subtitle}</p>
        </div>
        <a
          href={iframeSrc}
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-[44px] inline-flex items-center rounded-md border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-2 text-xs font-medium text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)]"
        >
          {dict.openDirectly}
        </a>
      </header>

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
