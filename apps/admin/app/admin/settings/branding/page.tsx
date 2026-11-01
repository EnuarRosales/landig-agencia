import React from "react";
import { fetchAdminBrandingSettings } from "@mocter/domain";
import { AdminBrandingView } from "./branding-view";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Identidad De Marca Y Marca Blanca · mocter-admin",
  description: "Configuración de marca corporativa SaaS y gobernanza de marca blanca para comercios.",
};

/**
 * Vista administrativa de configuración de marca corporativa y marca blanca (ADM-001, DSN-001 §7).
 *
 * Permite al Platform Owner parametrizar el logotipo oficial de la SaaS, paleta de colores institucional
 * con validación accesible WCAG 2.2 AA y supervisar las marcas blancas activas de los inquilinos.
 */
export default async function AdminBrandingPage() {
  const settings = await fetchAdminBrandingSettings();

  return (
    <div className="space-y-6 p-4 md:p-8 max-w-7xl mx-auto">
      <AdminBrandingView initialData={settings} />
    </div>
  );
}
