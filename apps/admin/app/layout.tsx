import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { authService, fetchUserActivePlatformRoles } from "@mocter/domain";
import { ThemeProvider } from "@/components/theme-provider";
import { AdminShell } from "@/components/admin-shell";
import type { CurrentUserDto } from "@/components/user-profile-modal";
import "./globals.css";

export const metadata: Metadata = {
  title: "mocter-admin · Plataforma SaaS",
  description: "Consola de administración corporativa de la SaaS Mocter",
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

async function getCurrentUser(): Promise<CurrentUserDto | undefined> {
  try {
    const cookieStore = await cookies();
    const isProduction = process.env.NODE_ENV === "production";
    const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
    const sid = cookieStore.get(sidCookieName)?.value || cookieStore.get("mocter_sid")?.value;

    if (!sid) return undefined;

    const validation = await authService.validateSession(sid);
    if (!validation.ok || !validation.data.user) {
      return undefined;
    }

    const { user, session } = validation.data;
    let role = "platform_owner";
    try {
      const roles = await fetchUserActivePlatformRoles(user.id);
      if (roles.length > 0) {
        role = roles.includes("platform_owner") ? "platform_owner" : (roles[0] || "platform_owner");
      }
    } catch {
      // Fallback seguro a platform_owner
    }

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName || null,
      role,
      status: user.status || "active",
      emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
      sessionCreatedAt: session?.createdAt ? new Date(session.createdAt).toISOString() : undefined,
      sessionExpiresAt: session?.expiresAt ? new Date(session.expiresAt).toISOString() : undefined,
    };
  } catch {
    return undefined;
  }
}

/**
 * Layout raíz de la aplicación administrativa SaaS (ADM-001, DSN-001).
 *
 * Configura:
 * 1. Proveedor de tema claro/oscuro (NextThemesProvider).
 * 2. Shell institucional persistente (AdminShell): Sidebar y Topbar que NUNCA se desmontan,
 *    emulando el comportamiento exacto de `<router-outlet>` de Angular.
 * 3. Hidratación server-side del perfil del operador en sesión sin spinners.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const currentUser = await getCurrentUser();

  return (
    <html lang="es" suppressHydrationWarning>
      <body className="min-h-dvh bg-[var(--dsn-background)] text-[var(--dsn-text)] antialiased transition-colors duration-150">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <AdminShell currentUser={currentUser}>{children}</AdminShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
