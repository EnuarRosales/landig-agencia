import React from "react";
import { getAdminDictionary } from "@/lib/i18n";
import { DesignSystemPlayground } from "./design-system-playground";
import { Palette } from "lucide-react";

/**
 * Catálogo interno interactivo del sistema de diseño (`DSN-001 T-04, T-05`, `/design-system`).
 *
 * Ruta protegida y no indexada (`robots: noindex, nofollow`) que exhibe:
 * 1. Tokens en 3 capas (Primitivos, Semánticos y Marca).
 * 2. Editor interactivo de tokens en caliente con persistencia de sesión.
 * 3. Validación algorítmica estricta de contraste accesible WCAG 2.2 AA (mínimo 4.5:1 texto, 3.0:1 UI).
 * 4. Sandbox reactivo de componentes vivos (Botones, AI-001, Inputs, DataTable).
 */
export default function DesignSystemCatalogPage() {
  const dict = getAdminDictionary("es").designSystem;

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-4 md:p-8">
      <header className="border-b border-[var(--dsn-border)] pb-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-[var(--dsn-accent)]/15 p-2 text-[var(--dsn-accent)]">
            <Palette className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[var(--dsn-text)]">
              {dict.title}
            </h1>
            <p className="text-xs text-[var(--dsn-text-secondary)] mt-0.5">
              {dict.subtitle}
            </p>
          </div>
        </div>
      </header>

      <DesignSystemPlayground />
    </main>
  );
}
