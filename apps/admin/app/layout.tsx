import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { AdminShell } from "@/components/admin-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "mocter-admin · Plataforma SaaS",
  description: "Consola de administración corporativa de la SaaS Mocter",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

/**
 * Layout raíz de la aplicación administrativa SaaS (ADM-001, DSN-001).
 *
 * Configura:
 * 1. Proveedor de tema claro/oscuro (NextThemesProvider).
 * 2. Shell institucional persistente (AdminShell): Sidebar y Topbar que NUNCA se desmontan,
 *    emulando el comportamiento exacto de `<router-outlet>` de Angular.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="min-h-dvh bg-[var(--dsn-background)] text-[var(--dsn-text)] antialiased transition-colors duration-150">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <AdminShell>{children}</AdminShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
