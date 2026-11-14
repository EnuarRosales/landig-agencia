import { cookies } from "next/headers";
import {
  resolveAuthenticatedPortalContext,
  tenantWorkspaceService,
  type WorkspaceBillingDto,
  type WorkspaceProductDto,
} from "@mocter/domain";
import { ProductsView } from "./products-view";

export const dynamic = "force-dynamic";

export default async function WorkspaceProductsPage() {
  const cookieStore = await cookies();
  const isProduction = process.env.NODE_ENV === "production";
  const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
  const sid = (cookieStore.get(sidCookieName)?.value || cookieStore.get("mocter_sid")?.value)?.trim();

  let initialProducts: WorkspaceProductDto[] = [];
  let initialBilling: WorkspaceBillingDto | null = null;
  if (sid) {
    const context = await resolveAuthenticatedPortalContext(sid);
    if (context?.activeClient?.id) {
      const [productsRes, billingRes] = await Promise.allSettled([
        tenantWorkspaceService.getProducts(context.activeClient.id),
        tenantWorkspaceService.getBillingDetails(context.activeClient.id),
      ]);
      if (productsRes.status === "fulfilled") {
        initialProducts = productsRes.value;
      }
      if (billingRes.status === "fulfilled") {
        initialBilling = billingRes.value;
      }
    }
  }

  return <ProductsView initialProducts={initialProducts} initialBilling={initialBilling} />;
}

