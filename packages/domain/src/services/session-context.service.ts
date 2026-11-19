import { eq, and, ne, desc } from "drizzle-orm";
import { getDb } from "../db/client";
import { users, clients, clientRouting, cells, plans } from "../db/schemas/admin";
import { subscriptions, billingManualPaymentReports } from "../db/schemas/admin/billing";
import { mediaCatalog } from "../db/schemas/admin/chatwoot-media-onboarding";
import { cellTenantUsers, cellUsers } from "../db/schemas/tenant";
import * as cellClient from "../db/cell-client";
import { ok, err, type Result } from "../types/result";
import { authService } from "./auth.service";
import { fetchUserActivePlatformRoles } from "./cell-authorization.service";
import {
  TenantCapabilityGateService,
  DrizzleTenantCapabilityGateRepository,
} from "./tenant-capability-gate.service";
import { appLogger } from "../utils/logger";
import { getBillingService } from "./billing.service";
import {
  DrizzleWhiteLabelRepository,
  WhiteLabelService,
  type WhiteLabelCapabilityMode,
} from "./white-label.service";
import type { BrandingPaletteTokens } from "../db/schemas/admin/client-brandings";

/**
 * Scopes autoritativos mutuamente excluyentes para el portal Mocter (TNT-RF-02, ADM-D-35).
 */
export type PortalScope = "platform" | "tenant" | "onboarding_prospect";

/**
 * Entidad de usuario tipada en el contexto de portal.
 */
export interface PortalContextUser {
  id: string;
  email: string;
  displayName: string | null;
  status: string;
  emailVerifiedAt: Date | null;
}

/**
 * Metadatos de sesión activa resuelta.
 */
export interface PortalContextSession {
  id: string;
  createdAt?: Date;
  expiresAt?: Date;
}

/**
 * Resumen del inquilino activo asociado al usuario en sesión.
 */
export interface PortalContextClient {
  id: string;
  slug: string;
  displayName: string;
  name: string;
  lifecycleStatus: string;
  planId: string;
  locale?: string;
  logoMediaId?: string | null;
  logoUrl?: string | null;
  connectionHealthy?: boolean;
}

/**
 * Datos resueltos de marca blanca del comercio para layout, shell y cabecera (`SPEC-07`).
 */
export interface PortalContextBranding {
  brandName: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  customFont: string | null;
  removeMocterBranding: boolean;
  palette: BrandingPaletteTokens | null;
}

/**
 * Idiomas soportados en el portal Mocter (`SPEC-17`).
 */
export type SupportedPortalLocale = "es" | "en";

/**
 * Opciones opcionales de contexto HTTP para resolver la cascada oficial de idioma (`SPEC-17 §7.1`).
 */
export interface ResolvePortalContextOptions {
  /** Cabecera `Accept-Language` enviada por el navegador. */
  browserAcceptLanguage?: string | null;
  /** Preferencia rápida sincronizada en cookie `mocter_locale` (fallback sin celda o pre-onboarding). */
  cookieLocale?: string | null;
}

function normalizeSupportedLocale(raw: string | null | undefined): SupportedPortalLocale | null {
  if (!raw) return null;
  const primary = raw.trim().toLowerCase().split(",")[0]?.split("-")[0]?.trim();
  if (primary === "es" || primary === "en") {
    return primary;
  }
  return null;
}

/**
 * Resuelve el idioma efectivo siguiendo la cascada canónica `SPEC-17`:
 * `user.preferredLocale -> cookieLocale -> client.locale -> browser Accept-Language -> 'es'`.
 */
export function resolveLocaleHierarchy(params: {
  userPreferredLocale?: string | null;
  cookieLocale?: string | null;
  tenantLocale?: string | null;
  browserAcceptLanguage?: string | null;
}): SupportedPortalLocale {
  return (
    normalizeSupportedLocale(params.userPreferredLocale) ??
    normalizeSupportedLocale(params.cookieLocale) ??
    normalizeSupportedLocale(params.tenantLocale) ??
    normalizeSupportedLocale(params.browserAcceptLanguage) ??
    "es"
  );
}

/**
 * Contexto autoritativo de sesión resuelto en el servidor para layout y shells (TNT-001 R2, Feature 10).
 */
export interface PortalContext {
  user: PortalContextUser;
  session: PortalContextSession;
  scope: PortalScope;
  role: string;
  effectiveRoles: string[];
  activeClientId: string | null;
  activeClient: PortalContextClient | null;
  activeCellId: string | null;
  activeCellCode: string | null;
  planName: string | null;
  capabilities: Record<string, boolean>;
  lifecycleStatus: string | null;
  /** Idioma preferido persistido en `cell_users.preferred_locale` si existe. */
  preferredLocale?: SupportedPortalLocale | null;
  /** Idioma efectivo resuelto bajo la cascada oficial (`SPEC-17`). */
  activeLocale?: SupportedPortalLocale;
  whiteLabelMode?: WhiteLabelCapabilityMode;
  branding?: PortalContextBranding | null;
  brandingTokens?: Record<string, string> | null;
  subscriptionAlert?: {
    status: string;
    expiresAt: string;
    daysRemaining: number;
    pendingBreBReview: boolean;
    subscriptionExpiredLocked?: boolean;
  } | null;
}

/**
 * Alias de tipo para el contexto autoritativo de sesión.
 */
export type AuthenticatedPortalContext = PortalContext;

/**
 * Resuelve de manera autoritativa el contexto y alcance de un usuario a partir de su sesión HTTP (AUTH-001, TNT-001).
 *
 * Reglas de negocio:
 * 1. Valida criptográfica y temporalmente la cookie `sid` contra Redis y `admin.sessions`.
 *    Si no es válida, está expirada o revocada, retorna `null` (Fail-Closed).
 * 2. Si el usuario posee roles activos en `admin.platform_user_roles`, resuelve `scope = 'platform'`.
 *    El rol asignado corresponde al rol de plataforma de mayor jerarquía (`platform_owner` > `platform_admin` > `platform_sales`).
 * 3. Si el usuario NO posee roles de plataforma:
 *    - NUNCA asigna `platform_owner` por omisión (eliminación de vulnerabilidad Feature 9).
 *    - Si no posee inquilino asignado o su estado es `alta`, resuelve `scope = 'onboarding_prospect'`.
 *    - Si posee inquilino asignado y su estado es `activo`, resuelve `scope = 'tenant'`.
 *    - Resuelve `activeCellId` y `activeCellCode` desde `admin.client_routing` y `admin.cells`.
 *    - Resuelve `planName` y capacidades efectivas vía `TenantCapabilityGateService`.
 *    - Resuelve el rol de inquilino (`tenant_owner` si es el propietario registrado, `tenant_agent` si es miembro).
 *
 * @param sessionId - Token opaco de sesión obtenido de la cookie `mocter_sid` o `__Host-mocter_sid`.
 * @returns Contexto autoritativo de portal, o `null` si la sesión no es válida.
 */
export async function resolveAuthenticatedPortalContext(
  sessionId: string,
  options?: ResolvePortalContextOptions,
): Promise<PortalContext | null> {
  const cleanSid = sessionId?.trim();
  if (!cleanSid) {
    return null;
  }

  try {
    // 1. Validar la sesión con el servicio central de autenticación
    const validation = await authService.validateSession(cleanSid);
    if (!validation.ok || !validation.data?.user) {
      return null;
    }

    const { user, session } = validation.data;
    if (user.status === "disabled") {
      return null;
    }

    const portalUser: PortalContextUser = {
      id: user.id,
      email: user.email,
      displayName: user.displayName || null,
      status: user.status || "active",
      emailVerifiedAt: user.emailVerifiedAt ? new Date(user.emailVerifiedAt) : null,
    };

    const portalSession: PortalContextSession = {
      id: session.id,
      createdAt: session.createdAt ? new Date(session.createdAt) : undefined,
      expiresAt: session.expiresAt ? new Date(session.expiresAt) : undefined,
    };

    // 2. Consultar roles de plataforma activos (admin.platform_user_roles)
    const platformRoles = await fetchUserActivePlatformRoles(user.id);
    if (platformRoles.length > 0) {
      const preferredRole = platformRoles.includes("platform_owner")
        ? "platform_owner"
        : (platformRoles[0] || "platform_admin");

      const activeLocale = resolveLocaleHierarchy({
        cookieLocale: options?.cookieLocale,
        browserAcceptLanguage: options?.browserAcceptLanguage,
      });

      return {
        user: portalUser,
        session: portalSession,
        scope: "platform",
        role: preferredRole,
        effectiveRoles: platformRoles,
        activeClientId: null,
        activeClient: null,
        activeCellId: null,
        activeCellCode: null,
        planName: null,
        capabilities: {},
        lifecycleStatus: null,
        preferredLocale: null,
        activeLocale,
      };
    }

    // 3. Usuarios no plataforma: Resolver contexto de inquilino / prospecto
    const db = getDb();
    let targetClientId: string | null = user.activeClientId ?? null;

    // Si el usuario no tiene activeClientId en users, verificar si es owner de un cliente activo/alta
    if (!targetClientId) {
      const [ownedClient] = await db
        .select({ id: clients.id })
        .from(clients)
        .where(
          and(
            eq(clients.ownerUserId, user.id),
            ne(clients.lifecycleStatus, "baja"),
          ),
        )
        .limit(1);

      if (ownedClient) {
        targetClientId = ownedClient.id;
      }
    }

    // Si no existe ningún cliente asociado -> Prospecto sin registro de empresa
    if (!targetClientId) {
      const activeLocale = resolveLocaleHierarchy({
        cookieLocale: options?.cookieLocale,
        browserAcceptLanguage: options?.browserAcceptLanguage,
      });

      return {
        user: portalUser,
        session: portalSession,
        scope: "onboarding_prospect",
        role: "onboarding_prospect",
        effectiveRoles: ["onboarding_prospect"],
        activeClientId: null,
        activeClient: null,
        activeCellId: null,
        activeCellCode: null,
        planName: null,
        capabilities: {},
        lifecycleStatus: "alta",
        preferredLocale: null,
        activeLocale,
      };
    }

    // Consultar registro del cliente en admin.clients
    const [clientRecord] = await db
      .select({
        id: clients.id,
        slug: clients.slug,
        displayName: clients.displayName,
        ownerUserId: clients.ownerUserId,
        lifecycleStatus: clients.lifecycleStatus,
        planId: clients.planId,
        locale: clients.locale,
        logoMediaId: clients.logoMediaId,
      })
      .from(clients)
      .where(eq(clients.id, targetClientId))
      .limit(1);

    if (!clientRecord || clientRecord.lifecycleStatus === "baja") {
      return {
        user: portalUser,
        session: portalSession,
        scope: "onboarding_prospect",
        role: "onboarding_prospect",
        effectiveRoles: ["onboarding_prospect"],
        activeClientId: null,
        activeClient: null,
        activeCellId: null,
        activeCellCode: null,
        planName: null,
        capabilities: {},
        lifecycleStatus: clientRecord?.lifecycleStatus ?? "alta",
      };
    }

    // Consultar asignación celular en admin.client_routing
    const [routingRecord] = await db
      .select({
        cellId: clientRouting.cellId,
        routingStatus: clientRouting.routingStatus,
      })
      .from(clientRouting)
      .where(eq(clientRouting.clientId, clientRecord.id))
      .limit(1);

    const activeCellId = routingRecord?.cellId ?? null;
    let activeCellCode: string | null = null;

    if (activeCellId) {
      const [cellRow] = await db
        .select({ code: cells.code })
        .from(cells)
        .where(eq(cells.id, activeCellId))
        .limit(1);
      activeCellCode = cellRow?.code ?? null;
    }

    // Consultar plan canónico
    let planName: string | null = null;
    if (clientRecord.planId) {
      const [planRow] = await db
        .select({ name: plans.name, code: plans.code })
        .from(plans)
        .where(eq(plans.id, clientRecord.planId))
        .limit(1);
      if (planRow) {
        if (typeof planRow.name === "object" && planRow.name !== null) {
          const locName = planRow.name as { es?: string; en?: string };
          planName = locName.es || locName.en || planRow.code;
        } else {
          planName = planRow.code || "Plan Pro";
        }
      }
    }

    // Consultar mapa de capacidades efectivas
    let capabilities: Record<string, boolean> = {};
    try {
      const gateRepo = new DrizzleTenantCapabilityGateRepository(() => db);
      const gateService = new TenantCapabilityGateService(gateRepo);
      capabilities = await gateService.getEffectiveCapabilities(clientRecord.id);
    } catch (capErr) {
      const capMsg = capErr instanceof Error ? capErr.message : String(capErr);
      appLogger.warn(`[resolveAuthenticatedPortalContext] Falló carga de capacidades para ${clientRecord.id}: ${capMsg}`);
    }

    const isOwner = clientRecord.ownerUserId === user.id;
    let resolvedRole = isOwner ? "tenant_owner" : "tenant_agent";
    let userPreferredLocale: SupportedPortalLocale | null = null;

    try {
      const cellResult = await cellClient.withTenantCellTransaction(clientRecord.id, async (tx) => {
        const [cellUser] = await tx
          .select({ preferredLocale: cellUsers.preferredLocale })
          .from(cellUsers)
          .where(and(eq(cellUsers.clientId, clientRecord.id), eq(cellUsers.id, user.id)))
          .limit(1);

        let membership: { role: string; status: string } | undefined;
        if (!isOwner) {
          const [m] = await tx
            .select({ role: cellTenantUsers.role, status: cellTenantUsers.status })
            .from(cellTenantUsers)
            .where(and(eq(cellTenantUsers.clientId, clientRecord.id), eq(cellTenantUsers.userId, user.id)))
            .orderBy(desc(cellTenantUsers.joinedAt))
            .limit(1);
          membership = m;
        }

        return {
          preferredLocale: normalizeSupportedLocale(cellUser?.preferredLocale),
          membership,
        };
      });

      userPreferredLocale = cellResult?.preferredLocale ?? null;
      if (!isOwner && cellResult?.membership) {
        if (cellResult.membership.status === "active") {
          resolvedRole = cellResult.membership.role || "tenant_agent";
        } else {
          appLogger.warn(`[resolveAuthenticatedPortalContext] Usuario ${user.id} con membresía inactiva en cliente ${clientRecord.id}`);
          return null;
        }
      }
    } catch (err) {
      appLogger.warn(`[resolveAuthenticatedPortalContext] Consulta celular de idioma/membresía omitida por fallo transitorio`, { err });
    }

    const activeLocale = resolveLocaleHierarchy({
      userPreferredLocale,
      cookieLocale: options?.cookieLocale,
      tenantLocale: clientRecord.locale,
      browserAcceptLanguage: options?.browserAcceptLanguage,
    });

    let resolvedLogoUrl: string | null = null;
    if (clientRecord.logoMediaId) {
      try {
        const [logoMedia] = await db
          .select({ storageKey: mediaCatalog.storageKey })
          .from(mediaCatalog)
          .where(eq(mediaCatalog.id, clientRecord.logoMediaId))
          .limit(1);
        if (logoMedia?.storageKey) {
          const { buildImgproxyUrl } = await import("./tenant-workspace.service");
          resolvedLogoUrl = buildImgproxyUrl(logoMedia.storageKey, {
            width: 160,
            height: 160,
            resizingType: "fit",
          });
        }
      } catch {
        resolvedLogoUrl = null;
      }
    }

    // Resolver modo y tokens de Marca Blanca (SPEC-07) sin afectar flujos si hay fallo transitorio
    let whiteLabelMode: WhiteLabelCapabilityMode = "none";
    let resolvedBranding: PortalContextBranding | null = null;
    let brandingTokens: Record<string, string> | null = null;

    try {
      const wlRepo = new DrizzleWhiteLabelRepository(() => db);
      whiteLabelMode = await wlRepo.findClientPlanWhiteLabelMode(clientRecord.id);
      if (whiteLabelMode !== "none") {
        const wlRow = await wlRepo.findClientBranding(clientRecord.id);
        if (wlRow && "clientId" in wlRow) {
          const effectiveBrandLogo =
            whiteLabelMode === "completa" && wlRow.logoUrl
              ? wlRow.logoUrl
              : resolvedLogoUrl;
          if (whiteLabelMode === "completa" && wlRow.logoUrl) {
            resolvedLogoUrl = wlRow.logoUrl;
          }
          resolvedBranding = {
            brandName: whiteLabelMode === "completa" ? wlRow.brandName : null,
            logoUrl: effectiveBrandLogo,
            faviconUrl: whiteLabelMode === "completa" ? wlRow.faviconUrl : null,
            customFont: whiteLabelMode === "completa" ? wlRow.customFont : null,
            removeMocterBranding:
              whiteLabelMode === "completa" ? Boolean(wlRow.removeMocterBranding) : false,
            palette: wlRow.palette ?? null,
          };
          brandingTokens = WhiteLabelService.buildBackofficeCssTokens(wlRow.palette);
        }
      }
    } catch {
      whiteLabelMode = "none";
      resolvedBranding = null;
      brandingTokens = null;
    }

    const portalClient: PortalContextClient = {
      id: clientRecord.id,
      slug: clientRecord.slug,
      displayName: clientRecord.displayName,
      name: clientRecord.displayName,
      lifecycleStatus: clientRecord.lifecycleStatus,
      planId: clientRecord.planId,
      locale: clientRecord.locale,
      logoMediaId: clientRecord.logoMediaId ?? null,
      logoUrl: resolvedLogoUrl,
      connectionHealthy: Boolean(activeCellId),
    };

    // Caso A: Inquilino en estado 'alta' (onboarding pendiente)
    if (clientRecord.lifecycleStatus === "alta") {
      return {
        user: portalUser,
        session: portalSession,
        scope: "onboarding_prospect",
        role: resolvedRole,
        effectiveRoles: [resolvedRole],
        activeClientId: clientRecord.id,
        activeClient: portalClient,
        activeCellId,
        activeCellCode,
        planName,
        capabilities,
        lifecycleStatus: "alta",
        preferredLocale: userPreferredLocale,
        activeLocale,
      };
    }

    // Caso B: Inquilino en estado 'activo' (operación completa en /workspace)
    if (clientRecord.lifecycleStatus === "activo") {
      let subscriptionAlert: PortalContext["subscriptionAlert"] = null;
      try {
        let [subRow] = await db
          .select({
            status: subscriptions.status,
            trialEndsAt: subscriptions.trialEndsAt,
            currentPeriodEnd: subscriptions.currentPeriodEnd,
          })
          .from(subscriptions)
          .where(eq(subscriptions.clientId, clientRecord.id))
          .limit(1);

        // Auto-aprovisionamiento defensivo solo si el espacio activo nunca tuvo registro de suscripción (RN-SPEC-04-07).
        if (!subRow) {
          const initRes = await getBillingService().activateTrialForTenant({
            clientId: clientRecord.id,
            planId: clientRecord.planId,
            cycle: "monthly",
            executedBy: portalUser.id,
          });
          if (initRes.ok) {
            subRow = {
              status: initRes.data.status,
              trialEndsAt: initRes.data.trialEndsAt,
              currentPeriodEnd: initRes.data.currentPeriodEnd,
            };
          }
        }

        if (subRow) {
          const [pendingReport] = await db
            .select({ id: billingManualPaymentReports.id })
            .from(billingManualPaymentReports)
            .where(
              and(
                eq(billingManualPaymentReports.clientId, clientRecord.id),
                eq(billingManualPaymentReports.status, "pending_review"),
              ),
            )
            .limit(1);

          const expiresAt =
            subRow.status === "trialing" && subRow.trialEndsAt
              ? subRow.trialEndsAt
              : subRow.currentPeriodEnd;
          const diffMs = expiresAt.getTime() - Date.now();
          const daysRemaining = diffMs <= 0 ? 0 : Math.ceil(diffMs / 86_400_000);
          const pendingBreBReview = Boolean(pendingReport);
          const subscriptionExpiredLocked =
            !pendingBreBReview &&
            (subRow.status === "expired" ||
              subRow.status === "past_due" ||
              subRow.status === "cancelled" ||
              diffMs <= 0);

          if (daysRemaining <= 5 || subscriptionExpiredLocked) {
            subscriptionAlert = {
              status: subRow.status,
              expiresAt: expiresAt.toISOString(),
              daysRemaining,
              pendingBreBReview,
              subscriptionExpiredLocked,
            };
          }
        }
      } catch {
        subscriptionAlert = null;
      }

      return {
        user: portalUser,
        session: portalSession,
        scope: "tenant",
        role: resolvedRole,
        effectiveRoles: [resolvedRole],
        activeClientId: clientRecord.id,
        activeClient: portalClient,
        activeCellId,
        activeCellCode,
        planName,
        capabilities,
        lifecycleStatus: "activo",
        preferredLocale: userPreferredLocale,
        activeLocale,
        whiteLabelMode,
        branding: resolvedBranding,
        brandingTokens,
        subscriptionAlert,
      };
    }

    // Caso C: Otros estados operativos (ej. 'suspendido', 'bloqueado')
    return {
      user: portalUser,
      session: portalSession,
      scope: "tenant",
      role: resolvedRole,
      effectiveRoles: [resolvedRole],
      activeClientId: clientRecord.id,
      activeClient: portalClient,
      activeCellId,
      activeCellCode,
      planName,
      capabilities,
      lifecycleStatus: clientRecord.lifecycleStatus,
      preferredLocale: userPreferredLocale,
      activeLocale,
      whiteLabelMode,
      branding: resolvedBranding,
      brandingTokens,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[resolveAuthenticatedPortalContext Failed] ${msg}`, error);
    return null;
  }
}

/**
 * Consulta de forma ligera el estado de ciclo de vida de un inquilino por su ID en el Router Global.
 */
export async function getClientLifecycleStatus(clientId: string): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({ lifecycleStatus: clients.lifecycleStatus })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  return row?.lifecycleStatus ?? null;
}

/**
 * Persiste la preferencia individual de idioma (`preferred_locale`) del usuario en su celda de datos (`SPEC-17 §7.1`, `§9.1`).
 *
 * @param params - `clientId`, `userId`, `locale` (`'es' | 'en' | null` para heredar idioma del comercio) y `actor`.
 * @returns Resultado tipado con el idioma guardado.
 */
export async function updateTenantUserPreferredLocale(params: {
  clientId: string;
  userId: string;
  locale: SupportedPortalLocale | null;
  actor?: string;
}): Promise<Result<{ locale: SupportedPortalLocale | null }>> {
  try {
    const updatedRows = await cellClient.withTenantCellTransaction(params.clientId, async (tx) => {
      return tx
        .update(cellUsers)
        .set({
          preferredLocale: params.locale,
          updatedAt: new Date(),
          updatedBy: params.actor || params.userId,
        })
        .where(and(eq(cellUsers.clientId, params.clientId), eq(cellUsers.id, params.userId)))
        .returning({ id: cellUsers.id, preferredLocale: cellUsers.preferredLocale });
    });

    if (!updatedRows || updatedRows.length === 0) {
      appLogger.warn("[updateTenantUserPreferredLocale] Usuario sin proyección celular para guardar locale", {
        clientId: params.clientId,
        userId: params.userId,
      });
    }

    return ok({ locale: params.locale });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[updateTenantUserPreferredLocale Failed] ${msg}`, error, {
      clientId: params.clientId,
      userId: params.userId,
    });
    return err("No fue posible actualizar la preferencia de idioma.", "LOCALE_UPDATE_ERROR");
  }
}


