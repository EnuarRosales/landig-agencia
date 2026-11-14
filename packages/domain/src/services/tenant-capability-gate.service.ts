import { and, eq, gt, isNull, lte, or } from "drizzle-orm";
import { err, ok, type Result } from "../types/result";
import { getDb } from "../db/client";
import { clients } from "../db/schemas/admin/clients";
import { plans } from "../db/schemas/admin/plans";
import { planCapabilityValues } from "../db/schemas/admin/chatwoot-capabilities";
import {
  PLAN_DIMENSION_KEYS,
  clientFeatureOverrides,
  clientPlanOverrides,
  planLimits,
  type PlanLimitDimensionKey,
} from "../db/schemas/admin/plan-catalogs";

/**
 * Límite efectivo resuelto para una dimensión de plan considerando plan base y overrides vigentes.
 */
export interface ResolvedPlanLimit {
  mode: "LIMITED" | "UNLIMITED";
  value: number | null;
  source: "override" | "plan" | "default";
}

export interface ITenantCapabilityGateRepository {
  isCapabilityEnabled(clientId: string, capabilityCode: string): Promise<boolean>;
  getTenantCapabilities(clientId: string): Promise<Record<string, boolean>>;
  getResolvedLimits?(clientId: string): Promise<Record<PlanLimitDimensionKey, ResolvedPlanLimit>>;
}

function buildDefaultResolvedLimits(): Record<PlanLimitDimensionKey, ResolvedPlanLimit> {
  const result = {} as Record<PlanLimitDimensionKey, ResolvedPlanLimit>;
  for (const dim of PLAN_DIMENSION_KEYS) {
    result[dim] = {
      mode: "LIMITED",
      value: dim === "chat_retention_days" ? 30 : 0,
      source: "default",
    };
  }
  return result;
}

/**
 * Repositorio en memoria para pruebas unitarias sin base de datos activa.
 */
export class InMemoryTenantCapabilityGateRepository
  implements ITenantCapabilityGateRepository
{
  public capabilities = new Map<string, Record<string, boolean>>();
  public limits = new Map<string, Partial<Record<PlanLimitDimensionKey, ResolvedPlanLimit>>>();

  async isCapabilityEnabled(clientId: string, capabilityCode: string): Promise<boolean> {
    const tenantCaps = this.capabilities.get(clientId);
    return tenantCaps ? Boolean(tenantCaps[capabilityCode]) : false;
  }

  async getTenantCapabilities(clientId: string): Promise<Record<string, boolean>> {
    return this.capabilities.get(clientId) ?? {};
  }

  async getResolvedLimits(clientId: string): Promise<Record<PlanLimitDimensionKey, ResolvedPlanLimit>> {
    const defaults = buildDefaultResolvedLimits();
    const custom = this.limits.get(clientId);
    if (!custom) return defaults;
    return { ...defaults, ...custom };
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
          lte(clientFeatureOverrides.validFrom, now),
          or(
            isNull(clientFeatureOverrides.validTo),
            gt(clientFeatureOverrides.validTo, now),
          ),
        ),
      );

    for (const o of overrides) {
      map[o.featureKey] = Boolean(o.enabled);
    }

    return map;
  }

  /**
   * Resuelve todas las dimensiones canónicas del plan para un inquilino aplicando primero los
   * límites base de `admin.plan_limits` y luego `admin.client_plan_overrides` vigentes.
   */
  async getResolvedLimits(
    clientId: string,
  ): Promise<Record<PlanLimitDimensionKey, ResolvedPlanLimit>> {
    const db = this.dbProvider();
    const resolved = buildDefaultResolvedLimits();

    const [clientRow] = await db
      .select({ planId: clients.planId })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);

    if (!clientRow?.planId) {
      return resolved;
    }

    const baseRows = await db
      .select({
        dimension: planLimits.dimension,
        mode: planLimits.mode,
        value: planLimits.value,
      })
      .from(planLimits)
      .where(eq(planLimits.planId, clientRow.planId));

    for (const row of baseRows) {
      if (row.dimension in resolved) {
        const mode = row.mode === "UNLIMITED" ? "UNLIMITED" : "LIMITED";
        resolved[row.dimension as PlanLimitDimensionKey] = {
          mode,
          value: mode === "UNLIMITED" ? null : Number(row.value ?? 0),
          source: "plan",
        };
      }
    }

    const now = new Date();
    const overrideRows = await db
      .select({
        dimension: clientPlanOverrides.dimension,
        value: clientPlanOverrides.value,
      })
      .from(clientPlanOverrides)
      .where(
        and(
          eq(clientPlanOverrides.clientId, clientId),
          lte(clientPlanOverrides.validFrom, now),
          or(
            isNull(clientPlanOverrides.validTo),
            gt(clientPlanOverrides.validTo, now),
          ),
        ),
      );

    for (const row of overrideRows) {
      if (row.dimension in resolved) {
        const mode = row.value === null ? "UNLIMITED" : "LIMITED";
        resolved[row.dimension as PlanLimitDimensionKey] = {
          mode,
          value: row.value !== null ? Number(row.value) : null,
          source: "override",
        };
      }
    }

    return resolved;
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
   * Obtiene los límites resueltos del inquilino combinando plan y overrides vigentes (SPEC-03 T-04).
   */
  async getResolvedLimits(clientId: string): Promise<Record<PlanLimitDimensionKey, ResolvedPlanLimit>> {
    if (this.repository.getResolvedLimits) {
      return await this.repository.getResolvedLimits(clientId);
    }
    return buildDefaultResolvedLimits();
  }

  /**
   * Devuelve el resumen consolidado de entitlements (límites + capacidades efectivas) del inquilino.
   */
  async getTenantEntitlementsSummary(clientId: string): Promise<{
    limits: Record<PlanLimitDimensionKey, ResolvedPlanLimit>;
    capabilities: Record<string, boolean>;
  }> {
    const [limits, capabilities] = await Promise.all([
      this.getResolvedLimits(clientId),
      this.getEffectiveCapabilities(clientId),
    ]);
    return { limits, capabilities };
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
