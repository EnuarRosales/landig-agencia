import { eq, and, sql } from "drizzle-orm";
import { err, ok, type Result } from "../types/result";
import { getDb } from "../db/client";
import { clients } from "../db/schemas/admin/clients";
import { plans } from "../db/schemas/admin/plans";
import { planCapabilityValues } from "../db/schemas/admin/chatwoot-capabilities";
import { clientFeatureOverrides, planLimits } from "../db/schemas/admin/plan-catalogs";

export interface ITenantCapabilityGateRepository {
  isCapabilityEnabled(clientId: string, capabilityCode: string): Promise<boolean>;
  getTenantCapabilities(clientId: string): Promise<Record<string, boolean>>;
}

/**
 * Repositorio en memoria para pruebas unitarias sin base de datos activa.
 */
export class InMemoryTenantCapabilityGateRepository
  implements ITenantCapabilityGateRepository
{
  public capabilities = new Map<string, Record<string, boolean>>();

  async isCapabilityEnabled(clientId: string, capabilityCode: string): Promise<boolean> {
    const tenantCaps = this.capabilities.get(clientId);
    return tenantCaps ? Boolean(tenantCaps[capabilityCode]) : false;
  }

  async getTenantCapabilities(clientId: string): Promise<Record<string, boolean>> {
    return this.capabilities.get(clientId) ?? {};
  }
}

/**
 * Implementación Drizzle ORM sobre PostgreSQL consultando planes y capacidades efectivas.
 */
export class DrizzleTenantCapabilityGateRepository
  implements ITenantCapabilityGateRepository
{
  constructor(private readonly dbProvider: () => any = () => getDb()) {}

  async isCapabilityEnabled(clientId: string, capabilityCode: string): Promise<boolean> {
    const caps = await this.getTenantCapabilities(clientId);
    return Boolean(caps[capabilityCode]);
  }

  async getTenantCapabilities(clientId: string): Promise<Record<string, boolean>> {
    const db = this.dbProvider();

    // 1. Obtener plan asignado al cliente
    const [clientRow] = await db
      .select({ planId: clients.planId })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);

    if (!clientRow?.planId) {
      return {};
    }

    // 2. Obtener valores del plan
    const planCaps = await db
      .select({
        capabilityCode: planCapabilityValues.capabilityCode,
        enabled: planCapabilityValues.enabled,
      })
      .from(planCapabilityValues)
      .where(eq(planCapabilityValues.planId, clientRow.planId));

    const map: Record<string, boolean> = {};
    for (const c of planCaps) {
      map[c.capabilityCode] = Boolean(c.enabled);
    }

    // 2b. Derivar chatwoot_inboxes desde admin.plan_limits (CHW-002 T-03, D-05)
    const [inboxLimitRow] = await db
      .select({
        mode: planLimits.mode,
        value: planLimits.value,
      })
      .from(planLimits)
      .where(
        and(
          eq(planLimits.planId, clientRow.planId),
          eq(planLimits.dimension, "chatwoot_inboxes"),
        ),
      )
      .limit(1);

    if (inboxLimitRow) {
      const mode = inboxLimitRow.mode;
      const val = inboxLimitRow.value ?? 0;
      map["chatwoot_inboxes"] = mode === "UNLIMITED" || (mode !== "DISABLED" && val > 0);
    }

    // 3. Aplicar overrides vigentes del inquilino si existen
    const now = new Date();
    const overrides = await db
      .select({
        featureKey: clientFeatureOverrides.featureKey,
        enabled: clientFeatureOverrides.enabled,
      })
      .from(clientFeatureOverrides)
      .where(
        and(
          eq(clientFeatureOverrides.clientId, clientId),
          sql`${clientFeatureOverrides.validFrom} <= ${now}`,
          sql`(${clientFeatureOverrides.validTo} IS NULL OR ${clientFeatureOverrides.validTo} >= ${now})`,
        ),
      );

    for (const o of overrides) {
      map[o.featureKey] = Boolean(o.enabled);
    }

    return map;
  }
}

/**
 * Servicio de control de acceso funcional y restricción de navegación/APIs por capacidades del plan (T9, S5-S7, S10-S11).
 */
export class TenantCapabilityGateService {
  constructor(private readonly repository: ITenantCapabilityGateRepository) {}

  /**
   * Valida en el servidor si una capacidad está contratada en el plan del inquilino (RN-007, S10).
   *
   * Si no está contratada, retorna el mensaje de validación canónico S10:
   * "Tu plan no incluye esta funcionalidad."
   */
  async assertCapability(
    clientId: string,
    capabilityCode: string,
  ): Promise<Result<true>> {
    const isEnabled = await this.repository.isCapabilityEnabled(clientId, capabilityCode);
    if (!isEnabled) {
      return err("Tu plan no incluye esta funcionalidad.", "CAPABILITY_NOT_INCLUDED");
    }
    return ok(true);
  }

  /**
   * Obtiene el mapa completo de capacidades efectivas del inquilino.
   */
  async getEffectiveCapabilities(clientId: string): Promise<Record<string, boolean>> {
    return await this.repository.getTenantCapabilities(clientId);
  }

  /**
   * Filtra elementos de navegación u opciones de interfaz ocultando las que no estén contratadas (CA-008).
   */
  async filterNavItems<T extends { capabilityCode?: string }>(
    clientId: string,
    items: T[],
  ): Promise<T[]> {
    const caps = await this.repository.getTenantCapabilities(clientId);
    return items.filter((item) => {
      if (!item.capabilityCode) return true;
      return Boolean(caps[item.capabilityCode]);
    });
  }
}
