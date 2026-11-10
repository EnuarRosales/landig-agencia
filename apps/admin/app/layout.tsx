import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { PortalShellRouter } from "@/components/portal-shell-router";
import "./globals.css";

export const metadata: Metadata = {
  title: "mocter-admin · Plataforma SaaS & Workspace",
  description: "Consola de administración corporativa y backoffice operativo del comercio en Mocter",
  robots: { index: false, follow: false },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    shortcut: "/favicon.ico",
    apple: "/icon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

/**
 * Layout raíz de la aplicación administrativa unificada (ADM-001 D-35, DSN-001, Feature 9 & 11).
 *
 * Configura:
 * 1. Proveedor de tema claro/oscuro (ThemeProvider).
 * 2. Enrutador autoritativo de cascarones (PortalShellRouter): bifurca en servidor entre AdminShell,
 *    TenantWorkspaceShell o layout de onboarding sin fugas de UI ni fallbacks inseguros a platform_owner.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="min-h-dvh bg-[var(--dsn-background)] text-[var(--dsn-text)] antialiased transition-colors duration-150">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <PortalShellRouter>{children}</PortalShellRouter>
        </ThemeProvider>
      </body>
    </html>
  );
}
