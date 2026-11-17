import React from "react";
import { getCommunitiesGovernanceService } from "@mocter/domain";
import { CommunitiesAdminView } from "./communities-admin-view";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Comunidades y Líderes · mocter-admin",
  description:
    "Autorización de líderes de comunidades, cupos de redes colaborativas y supervisión del ecosistema B2B.",
};

/**
 * Vista de administración global de comunidades y líderes en la consola SaaS (`SPEC-15-D03`).
 */
export default async function AdminCommunitiesPage() {
  const service = getCommunitiesGovernanceService();
  const res = await service.getAdminOverview();

  const initialOverview = res.ok
    ? res.data
    : { authorizations: [], organizations: [], tenants: [] };

  return <CommunitiesAdminView initialOverview={initialOverview} locale="es" />;
}
