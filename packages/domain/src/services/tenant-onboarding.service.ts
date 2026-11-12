import { randomUUID } from "node:crypto";
import { eq, sql, and, asc, lt } from "drizzle-orm";
import { getDb } from "../db/index";
import {
  users,
  clients,
  clientRouting,
  clientPlans,
  plans,
  cells,
  onboardingSessions,
  chatwootAccounts,
} from "../db/schemas/admin";
import {
  cellProducts,
  cellClientBusinessInfo,
  cellClientUsage,
  cellTenantLabels,
} from "../db/schemas/tenant";
import { withTenantCellTransaction } from "../db/cell-client";
import { provisionTenantInCellDataPlane } from "./admin-dashboard.service";
import { RESERVED_MOCTER_LEAD_LABELS } from "./onboarding-and-limits.service";
import {
  ChatwootProvisioningService,
  ChatwootHttpPlatformGateway,
  buildChatwootFeaturesAndLimitsForPlan,
  isChatwootEnabledForPlan,
} from "./chatwoot-provisioning.service";
import { ok, err, type Result } from "../types/result";
import { appLogger } from "../utils/logger";

/**
 * Estado DTO estructurado del asistente de onboarding devuelto a la UI (ADM-001 RF-14, TNT-001 RF-03).
 */
export interface TenantOnboardingStateDto {
  step: 1 | 2 | 3 | "completed";
  client: {
    id: string;
    displayName: string;
    slug: string;
    locale: "es" | "en";
    currency: string;
    timezone: string;
    lifecycleStatus: string;
    planId?: string | null;
    planCode?: string | null;
    cellCode?: string | null;
  } | null;
  draft: {
    business?: {
      displayName?: string;
      slug?: string;
      locale?: "es" | "en";
      currency?: string;
      timezone?: string;
      planCode?: string;
    };
    firstProduct?: {
      name?: string;
      description?: string;
      priceCents?: number;
      currency?: string;
      kind?: "physical" | "digital" | "service";
    };
    botConfig?: {
      botPreset?: string;
      paymentMethods?: string[];
    };
  };
  availablePlans: Array<{
    id: string;
    code: string;
    name: string;
    description: string;
    priceMonthlyCents: number;
  }>;
}

/**
 * Entrada para el Paso 1: Configuración de Negocio y Plan (TNT-RF-03.2, TNT-RF-03.3).
 */
export interface CompleteStep1BusinessInput {
  displayName: string;
  slug: string;
  locale?: "es" | "en";
  currency?: string;
  timezone?: string;
  planCode?: string;
}

export interface CompleteStep1BusinessOutcome {
  clientId: string;
  slug: string;
  displayName: string;
  nextStep: 2;
}

/**
 * Entrada para el Paso 2: Creación del Primer Producto (TNT-RF-03.4).
 */
export interface CompleteStep2FirstProductInput {
  name: string;
  description: string;
  priceCents: number;
  currency?: string;
  kind?: "physical" | "digital" | "service";
}

export interface CompleteStep2FirstProductOutcome {
  productId: string;
  name: string;
  nextStep: 3;
}

/**
 * Entrada para el Paso 3: Asistente Virtual y Activación (TNT-RF-03.5).
 */
export interface CompleteStep3BotAndActivateInput {
  botPreset?: string;
  paymentMethods?: string[];
  shippingPolicy?: Record<string, unknown>;
  returnsPolicy?: string;
  warrantyPolicy?: string;
  orderMessage?: string;
}

export interface CompleteStep3BotAndActivateOutcome {
  clientId: string;
  lifecycleStatus: "activo";
  redirectTo: "/workspace";
}

/**
 * Servicio unificado de onboarding en 3 pasos para inquilinos de Mocter (ADM-001 D-36, TNT-001 §2.4).
 *
 * Soporta de manera simétrica:
 * 1. Alta Manual: Inquilino pre-creado en estado 'alta' con datos cargados; se verifica o ajusta el Paso 1.
 * 2. Alta Autónoma: Prospecto que se registra con activeClientId = NULL; se aprovisiona al confirmar Paso 1.
 */
export class TenantOnboardingService {
  constructor(private readonly chatwootProvisioningService?: ChatwootProvisioningService) {}

  /**
   * Resuelve el estado actual de onboarding para el usuario autenticado.
   */
  async getOnboardingState(userId: string): Promise<Result<TenantOnboardingStateDto>> {
    const db = getDb();

    try {
      // 1. Obtener usuario
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user) {
        return err("Usuario no encontrado en el sistema.", "USER_NOT_FOUND");
      }

      // 2. Buscar comercio activo o en alta (dueño o membership)
      let client = null;
      if (user.activeClientId) {
        const [found] = await db
          .select()
          .from(clients)
          .where(and(eq(clients.id, user.activeClientId), sql`${clients.lifecycleStatus} <> 'baja'`))
          .limit(1);
        client = found || null;
      }

      if (!client) {
        const [foundByOwner] = await db
          .select()
          .from(clients)
          .where(and(eq(clients.ownerUserId, userId), sql`${clients.lifecycleStatus} <> 'baja'`))
          .limit(1);
        client = foundByOwner || null;
      }

      // 3. Obtener sesión de onboarding persistida
      const [session] = await db
        .select()
        .from(onboardingSessions)
        .where(eq(onboardingSessions.userId, userId))
        .limit(1);

      // 4. Planes disponibles activos
      const activePlansRaw = await db
        .select({
          id: plans.id,
          code: plans.code,
          name: plans.name,
          description: plans.description,
          priceMonthlyCents: plans.priceMonthlyCents,
        })
        .from(plans)
        .where(eq(plans.status, "active"))
        .orderBy(asc(plans.sortOrder));

      const availablePlans = activePlansRaw.map((p) => {
        const nameStr =
          typeof p.name === "string"
            ? p.name
            : (p.name as { es?: string; en?: string })?.es || p.code;
        const descStr =
          typeof p.description === "string"
            ? p.description
            : (p.description as { es?: string; en?: string } | null)?.es || "";
        return {
          id: p.id,
          code: p.code,
          name: nameStr,
          description: descStr,
          priceMonthlyCents: p.priceMonthlyCents,
        };
      });

      // 5. Evaluar celda y productos si el cliente ya existe
      let cellCode: string | null = null;
      let productCount = 0;
      let hasBotConfig = false;

      if (client) {
        const [routing] = await db
          .select({
            cellId: clientRouting.cellId,
            cellCode: cells.code,
          })
          .from(clientRouting)
          .leftJoin(cells, eq(cells.id, clientRouting.cellId))
          .where(eq(clientRouting.clientId, client.id))
          .limit(1);

        cellCode = routing?.cellCode || null;

        // Inspeccionar estado celular en pg-cell-XX bajo RLS
        try {
          await withTenantCellTransaction(client.id, async (tx) => {
            const pRows = await tx
              .select({ id: cellProducts.id })
              .from(cellProducts)
              .where(eq(cellProducts.clientId, client.id));
            productCount = pRows.length;

            const bRows = await tx
              .select({ clientId: cellClientBusinessInfo.clientId, botPreset: cellClientBusinessInfo.botPreset })
              .from(cellClientBusinessInfo)
              .where(eq(cellClientBusinessInfo.clientId, client.id));
            hasBotConfig = bRows.length > 0 && !!bRows[0].botPreset;
          });
        } catch (cellErr) {
          appLogger.warn("[getOnboardingState] No se pudo consultar el data plane celular aún.", {
            clientId: client.id,
            error: cellErr instanceof Error ? cellErr.message : String(cellErr),
          });
        }
      }

      // 6. Determinar el paso actual
      let step: 1 | 2 | 3 | "completed" = 1;

      if (client?.lifecycleStatus === "activo" && hasBotConfig && productCount > 0) {
        step = "completed";
      } else if (!client) {
        // Prospecto de alta autónoma
        step = 1;
      } else if (productCount === 0) {
        // Cliente existe (alta manual o paso 1 completado) pero no tiene productos
        step = session?.currentStep === "product" ? 2 : (client ? 2 : 1);
      } else if (!hasBotConfig) {
        // Tiene producto pero le falta configurar el bot
        step = 3;
      } else {
        step = client.lifecycleStatus === "activo" ? "completed" : 3;
      }

      // 7. Resolver código de plan actual
      let currentPlanCode = session?.planCode || "free";
      if (client?.planId) {
        const matched = availablePlans.find((p) => p.id === client.planId);
        if (matched) currentPlanCode = matched.code;
      }

      const clientDto = client
        ? {
            id: client.id,
            displayName: client.displayName,
            slug: client.slug,
            locale: (client.locale as "es" | "en") || "es",
            currency: client.currency || "COP",
            timezone: client.timezone || "America/Bogota",
            lifecycleStatus: client.lifecycleStatus,
            planId: client.planId,
            planCode: currentPlanCode,
            cellCode: cellCode || "cell-01",
          }
        : null;

      const draftPayload = (session?.draftPayload as TenantOnboardingStateDto["draft"]) || {};

      return ok({
        step,
        client: clientDto,
        draft: draftPayload,
        availablePlans,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[getOnboardingState Failed] ${msg}`, error, { userId });
      return err("Error al consultar el estado de onboarding.", "ONBOARDING_STATE_ERROR");
    }
  }

  /**
   * Completa el Paso 1: Información comercial, slug y asignación de celda/plan.
   */
  async completeStep1Business(
    userId: string,
    input: CompleteStep1BusinessInput,
  ): Promise<Result<CompleteStep1BusinessOutcome>> {
    const db = getDb();

    // 1. Validaciones de entrada
    const displayName = input.displayName?.trim();
    if (!displayName || displayName.length < 2) {
      return err("El nombre del comercio debe tener al menos 2 caracteres.", "INVALID_DISPLAY_NAME");
    }

    const cleanSlug = input.slug?.trim().toLowerCase();
    const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    if (!cleanSlug || cleanSlug.length < 3 || cleanSlug.length > 50 || !slugRegex.test(cleanSlug)) {
      return err(
        "El identificador (slug) debe contener entre 3 y 50 caracteres (solo minúsculas, números y guiones).",
        "INVALID_SLUG_FORMAT",
      );
    }

    try {
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user) {
        return err("Usuario no encontrado.", "USER_NOT_FOUND");
      }

      // 2. Verificar si el usuario ya posee un comercio en 'alta' (Alta Manual)
      let existingClient = null;
      if (user.activeClientId) {
        const [c] = await db.select().from(clients).where(eq(clients.id, user.activeClientId)).limit(1);
        existingClient = c || null;
      }
      if (!existingClient) {
        const [c] = await db
          .select()
          .from(clients)
          .where(and(eq(clients.ownerUserId, userId), sql`${clients.lifecycleStatus} <> 'baja'`))
          .limit(1);
        existingClient = c || null;
      }

      // 3. Validar unicidad del slug
      const [slugCollision] = await db
        .select({ id: clients.id })
        .from(clients)
        .where(
          existingClient
            ? and(eq(clients.slug, cleanSlug), sql`${clients.id} <> ${existingClient.id}`)
            : eq(clients.slug, cleanSlug),
        )
        .limit(1);

      if (slugCollision) {
        return err(`El identificador de tienda '${cleanSlug}' ya se encuentra en uso.`, "SLUG_ALREADY_EXISTS");
      }

      const locale = input.locale || "es";
      const currency = input.currency || "COP";
      const timezone = input.timezone || "America/Bogota";
      const planCode = input.planCode || "free";

      let clientId = existingClient?.id;
      let effectivePlanId: string | null = null;

      if (existingClient) {
        // CASO A: Actualización de inquilino existente (Alta Manual)
        clientId = existingClient.id;
        effectivePlanId = existingClient.planId || null;
        await db
          .update(clients)
          .set({
            displayName,
            slug: cleanSlug,
            locale,
            currency,
            timezone,
            updatedAt: new Date(),
            updatedBy: user.email,
          })
          .where(eq(clients.id, existingClient.id));
      } else {
        // CASO B: Aprovisionamiento nuevo (Alta Autónoma)
        const [assignedCell] = await db
          .select()
          .from(cells)
          .where(and(eq(cells.status, "active"), lt(cells.currentClients, cells.maxClients)))
          .orderBy(asc(cells.currentClients))
          .limit(1);

        if (!assignedCell) {
          return err("No hay celdas de almacenamiento activas disponibles con capacidad en el clúster.", "NO_ACTIVE_CELL_AVAILABLE");
        }

        let [selectedPlan] = await db
          .select()
          .from(plans)
          .where(eq(plans.code, planCode))
          .limit(1);

        if (!selectedPlan) {
          const [freePlan] = await db
            .select()
            .from(plans)
            .where(eq(plans.code, "free"))
            .limit(1);
          selectedPlan = freePlan;
        }

        if (!selectedPlan) {
          const [anyPlan] = await db
            .select()
            .from(plans)
            .where(eq(plans.status, "active"))
            .limit(1);
          selectedPlan = anyPlan;
        }

        if (!selectedPlan) {
          return err("No hay planes comerciales disponibles para asignación.", "NO_ACTIVE_PLAN_FOUND");
        }

        effectivePlanId = selectedPlan.id;
        clientId = randomUUID();

        // 1. Insertar cliente en Router Global
        await db.insert(clients).values({
          id: clientId,
          ownerUserId: user.id,
          slug: cleanSlug,
          displayName,
          contactEmail: user.email,
          locale,
          currency,
          timezone,
          planId: selectedPlan.id,
          lifecycleStatus: "alta",
          quotaVersion: 1,
          createdBy: user.email,
          updatedBy: user.email,
        });

        // 2. Routing hacia la celda
        await db.insert(clientRouting).values({
          clientId,
          cellId: assignedCell.id,
          routingStatus: "active",
          createdBy: user.email,
          updatedBy: user.email,
        });

        // 3. Plan del cliente
        await db.insert(clientPlans).values({
          clientId,
          planId: selectedPlan.id,
          source: "self_service",
          createdBy: user.email,
          updatedBy: user.email,
        });

        // 4. Aprovisionar data plane celular en pg-cell-XX con credenciales (TNT-RF-03.2, AUTH-D-01)
        const provRes = await provisionTenantInCellDataPlane(clientId, assignedCell.id, user.id, {
          displayName,
          contactEmail: user.email,
          actor: "onboarding_step1",
          ownerUser: {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            passwordHash: user.passwordHash,
            passwordUpdatedAt: user.passwordUpdatedAt,
            emailVerifiedAt: user.emailVerifiedAt,
          },
        });

        if (!provRes.ok) {
          appLogger.error("[completeStep1Business] Error en provisión celular inicial.", {
            error: provRes.error,
          });
          return err(provRes.error, "CELL_PROVISION_ERROR");
        }

        // 5. Promover credenciales y vincular activeClientId en Router Global
        await db
          .update(users)
          .set({
            activeClientId: clientId,
            identityLocation: assignedCell.id,
            passwordHash: null,
            passwordUpdatedAt: null,
            updatedAt: new Date(),
            updatedBy: user.email,
          })
          .where(eq(users.id, user.id));

        // 6. Incrementar current_clients en la celda
        await db
          .update(cells)
          .set({
            currentClients: sql`${cells.currentClients} + 1`,
            updatedBy: user.email,
            updatedAt: new Date(),
          })
          .where(eq(cells.id, assignedCell.id));
      }

      // 4. Actualizar o crear sesión de onboarding
      await db
        .insert(onboardingSessions)
        .values({
          userId: user.id,
          clientId,
          planCode,
          currentStep: "product",
          status: "in_progress",
          draftPayload: { business: { displayName, slug: cleanSlug, locale, currency, timezone, planCode } },
          createdBy: user.email,
          updatedBy: user.email,
        })
        .onConflictDoUpdate({
          target: onboardingSessions.userId,
          set: {
            clientId,
            planCode,
            currentStep: "product",
            draftPayload: sql`jsonb_set(COALESCE(${onboardingSessions.draftPayload}, '{}'::jsonb), '{business}', ${JSON.stringify(
              { displayName, slug: cleanSlug, locale, currency, timezone, planCode },
            )}::jsonb)`,
            updatedAt: new Date(),
            updatedBy: user.email,
          },
        });

      // 5. Aprovisionamiento idempotente y fail-soft en Chatwoot (CHW-002 T-05, RF-01.4, D-02)
      try {
        let shouldProvision = true;
        if (clientId) {
          const [existingCw] = await db
            .select({
              state: chatwootAccounts.state,
              chatwootAccountId: chatwootAccounts.chatwootAccountId,
            })
            .from(chatwootAccounts)
            .where(eq(chatwootAccounts.clientId, clientId))
            .limit(1);

          if (existingCw && existingCw.state === "active" && existingCw.chatwootAccountId !== null) {
            shouldProvision = false;
          }

          if (shouldProvision && effectivePlanId) {
            const isPlanEnabled = await isChatwootEnabledForPlan(effectivePlanId, db);
            if (isPlanEnabled) {
              const { features, limits } = await buildChatwootFeaturesAndLimitsForPlan(effectivePlanId, db);
              const cwService =
                this.chatwootProvisioningService ||
                new ChatwootProvisioningService(new ChatwootHttpPlatformGateway(), undefined, "k1", db);

              await cwService.provisionOrRetryAccount({
                clientId,
                tenantName: displayName,
                locale: locale === "en" ? "en" : "es",
                idempotencyKey: `cw_prov_${clientId}`,
                features,
                limits,
                actor: user.email,
              });
            }
          }
        }
      } catch (cwErr) {
        appLogger.warn("[completeStep1Business] Fallo en aprovisionamiento automático de Chatwoot (Fail-Soft)", {
          clientId,
          error: cwErr instanceof Error ? cwErr.message : String(cwErr),
        });
      }

      return ok({
        clientId: clientId!,
        slug: cleanSlug,
        displayName,
        nextStep: 2,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[completeStep1Business Failed] ${msg}`, error, { userId, input });
      return err("Error al procesar el Paso 1 de negocio.", "STEP_1_FAILED");
    }
  }

  /**
   * Completa el Paso 2: Creación del primer producto en pg-cell-XX bajo RLS.
   */
  async completeStep2FirstProduct(
    userId: string,
    input: CompleteStep2FirstProductInput,
  ): Promise<Result<CompleteStep2FirstProductOutcome>> {
    const db = getDb();

    // 1. Validaciones
    const name = input.name?.trim();
    if (!name || name.length < 2) {
      return err("El nombre del producto debe tener al menos 2 caracteres.", "INVALID_PRODUCT_NAME");
    }

    const description = input.description?.trim();
    if (!description || description.length < 5) {
      return err("La descripción del producto debe tener al menos 5 caracteres.", "INVALID_PRODUCT_DESCRIPTION");
    }

    const priceCents = Number(input.priceCents);
    if (!Number.isFinite(priceCents) || priceCents <= 0) {
      return err("El precio del producto debe ser un número entero mayor a cero.", "INVALID_PRICE");
    }

    try {
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user) {
        return err("Usuario no encontrado.", "USER_NOT_FOUND");
      }

      // 2. Resolver comercio activo
      let client = null;
      if (user.activeClientId) {
        const [c] = await db.select().from(clients).where(eq(clients.id, user.activeClientId)).limit(1);
        client = c || null;
      }
      if (!client) {
        const [c] = await db
          .select()
          .from(clients)
          .where(and(eq(clients.ownerUserId, userId), sql`${clients.lifecycleStatus} <> 'baja'`))
          .limit(1);
        client = c || null;
      }

      if (!client) {
        return err("No existe un comercio vinculado para registrar el producto.", "CLIENT_NOT_FOUND");
      }

      const productId = randomUUID();
      const currency = (input.currency || client.currency || "COP").slice(0, 3).toUpperCase();
      const kind = input.kind || "physical";

      // 3. Inserción atómica en pg-cell-XX bajo RLS
      await withTenantCellTransaction(client.id, async (tx) => {
        await tx.insert(cellProducts).values({
          id: productId,
          clientId: client.id,
          name,
          description,
          priceCents: Math.round(priceCents),
          currency,
          kind,
          condition: "new",
          availability: "in_stock",
          status: "published",
          sourceSystem: "onboarding",
          sortOrder: 1,
          createdBy: user.email,
          updatedBy: user.email,
        });

        // Contabilizar en client_usage
        await tx
          .insert(cellClientUsage)
          .values({
            clientId: client.id,
            dimension: "products",
            usedValue: 1,
            createdBy: user.email,
            updatedBy: user.email,
          })
          .onConflictDoUpdate({
            target: [cellClientUsage.clientId, cellClientUsage.dimension],
            set: {
              usedValue: sql`${cellClientUsage.usedValue} + 1`,
              updatedAt: new Date(),
              updatedBy: user.email,
            },
          });
      });

      // 4. Actualizar sesión de onboarding
      await db
        .update(onboardingSessions)
        .set({
          currentStep: "bot_channel",
          draftPayload: sql`jsonb_set(COALESCE(${onboardingSessions.draftPayload}, '{}'::jsonb), '{firstProduct}', ${JSON.stringify(
            { name, description, priceCents: Math.round(priceCents), currency, kind },
          )}::jsonb)`,
          updatedAt: new Date(),
          updatedBy: user.email,
        })
        .where(eq(onboardingSessions.userId, user.id));

      return ok({
        productId,
        name,
        nextStep: 3,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[completeStep2FirstProduct Failed] ${msg}`, error, { userId, input });
      return err("Error al registrar el primer producto en la celda.", "STEP_2_FAILED");
    }
  }

  /**
   * Completa el Paso 3: Configuración del bot comercial, políticas y activación a 'activo'.
   */
  async completeStep3BotAndActivate(
    userId: string,
    input: CompleteStep3BotAndActivateInput = {},
  ): Promise<Result<CompleteStep3BotAndActivateOutcome>> {
    const db = getDb();

    try {
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user) {
        return err("Usuario no encontrado.", "USER_NOT_FOUND");
      }

      // 1. Resolver cliente
      let client = null;
      if (user.activeClientId) {
        const [c] = await db.select().from(clients).where(eq(clients.id, user.activeClientId)).limit(1);
        client = c || null;
      }
      if (!client) {
        const [c] = await db
          .select()
          .from(clients)
          .where(and(eq(clients.ownerUserId, userId), sql`${clients.lifecycleStatus} <> 'baja'`))
          .limit(1);
        client = c || null;
      }

      if (!client) {
        return err("No existe un comercio vinculado para activar.", "CLIENT_NOT_FOUND");
      }

      const botPreset = input.botPreset || "friendly_sales";
      const paymentMethods = input.paymentMethods || ["Nequi", "Daviplata", "Bancolombia", "Contraentrega"];
      const shippingPolicy = input.shippingPolicy || { domestic: true, deliveryTime: "2-4 días hábiles" };
      const returnsPolicy = input.returnsPolicy || "Garantía legal de 30 días.";
      const warrantyPolicy = input.warrantyPolicy || "Garantía por defectos de fábrica.";
      const orderMessage = input.orderMessage || "¡Gracias por tu compra! Tu pedido está siendo procesado.";

      // 2. Persistir contexto del bot y etiquetas en pg-cell-XX bajo RLS
      await withTenantCellTransaction(client.id, async (tx) => {
        await tx
          .insert(cellClientBusinessInfo)
          .values({
            clientId: client.id,
            botPreset,
            paymentMethods,
            shippingPolicy,
            returnsPolicy,
            warrantyPolicy,
            orderMessage,
            faqs: [],
            remindersEnabled: false,
            createdBy: user.email,
            updatedBy: user.email,
          })
          .onConflictDoUpdate({
            target: cellClientBusinessInfo.clientId,
            set: {
              botPreset,
              paymentMethods,
              shippingPolicy,
              returnsPolicy,
              warrantyPolicy,
              orderMessage,
              updatedAt: new Date(),
              updatedBy: user.email,
            },
          });

        // Sembrar etiquetas reservadas de clasificación si aún no existen
        for (const label of RESERVED_MOCTER_LEAD_LABELS) {
          await tx
            .insert(cellTenantLabels)
            .values({
              clientId: client.id,
              title: label.title,
              description: label.description,
              color: label.color,
              showOnSidebar: label.showOnSidebar,
              origin: label.origin,
              state: "active",
              createdBy: user.email,
              updatedBy: user.email,
            })
            .onConflictDoNothing();
        }
      });

      // 3. Activar cliente en Router Global (`lifecycle_status = 'activo'`)
      await db
        .update(clients)
        .set({
          lifecycleStatus: "activo",
          updatedAt: new Date(),
          updatedBy: user.email,
        })
        .where(eq(clients.id, client.id));

      // 4. Marcar sesión de onboarding como completada
      await db
        .update(onboardingSessions)
        .set({
          currentStep: "completed",
          status: "completed",
          completedAt: new Date(),
          draftPayload: sql`jsonb_set(COALESCE(${onboardingSessions.draftPayload}, '{}'::jsonb), '{botConfig}', ${JSON.stringify(
            { botPreset, paymentMethods },
          )}::jsonb)`,
          updatedAt: new Date(),
          updatedBy: user.email,
        })
        .where(eq(onboardingSessions.userId, user.id));

      return ok({
        clientId: client.id,
        lifecycleStatus: "activo",
        redirectTo: "/workspace",
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[completeStep3BotAndActivate Failed] ${msg}`, error, { userId, input });
      return err("Error al activar el comercio y el bot virtual.", "STEP_3_FAILED");
    }
  }
}

export const tenantOnboardingService = new TenantOnboardingService();
