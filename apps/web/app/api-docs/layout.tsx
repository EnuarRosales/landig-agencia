import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = {
  title: "API Reference | Mocter",
  description: "Documentación interactiva y especificación OpenAPI de las APIs de Mocter.",
};

/**
 * Root Layout dedicado para la sección de documentación de APIs (/api-docs).
 * Provee la estructura HTML raíz requerida por Next.js App Router.
 */
export default function ApiDocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="dark" suppressHydrationWarning>
      <body className="min-h-screen bg-[#0b0f19] text-white antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
