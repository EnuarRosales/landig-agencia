import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "mocter-admin",
  robots: { index: false, follow: false },
};

/**
 * Layout raíz de la aplicación administrativa.
 *
 * Shell mínimo: no incluye navegación, autenticación ni i18n; esas capacidades
 * llegan en fases posteriores de ADM-001 y AUTH-001.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
