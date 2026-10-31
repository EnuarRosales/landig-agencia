import { createHash, randomBytes } from "node:crypto";
import { err, ok, type Result } from "../types/result";

/**
 * Etiquetas reservadas de clasificación de prospectos sembradas por defecto en cada inquilino (ADM-001 RF-03.7, T-07, T-12).
 */
export const RESERVED_MOCTER_LEAD_LABELS = [
  {
    title: "lead-frio",
    description: "Prospecto en etapa inicial de exploración",
    color: "#3B82F6",
    showOnSidebar: true,
    origin: "mocter_default" as const,
  },
  {
    title: "lead-tibio",
    description: "Prospecto con interés comercial activo",
    color: "#F59E0B",
    showOnSidebar: true,
    origin: "mocter_default" as const,
  },
  {
    title: "lead-caliente",
    description: "Prospecto con alta intención de compra inmediata",
    color: "#EF4444",
    showOnSidebar: true,
    origin: "mocter_default" as const,
  },
  {
    title: "compra-realizada",
    description: "Contacto con pedido confirmado o pagado",
    color: "#10B981",
    showOnSidebar: true,
    origin: "mocter_default" as const,
  },
] as const;

/**
 * Dimensiones numéricas canónicas de planes comerciales (ADM-001 T-10, RF-04.1, RF-04.8).
 */
export type PlanDimensionKey =
  | "max_products"
  | "max_tenant_agents"
  | "max_images_per_product"
  | "max_audios"
  | "max_videos"
  | "max_pdfs"
  | "chat_retention_days"
  | "storage_bytes"
  | "max_bots"
  | "max_channels"
  | "max_followup_sequences";

/**
 * Capacidades (feature gates) canónicas de planes comerciales (ADM-001 T-10, RF-04.8, RF-04.9).
 *
 * Nota: `ai_assistance` («Mejorar con AI») es transversal a todos los planes y NO se gatea (AI-001 D-05).
 */
export type PlanFeatureKey =
  | "white_label"
  | "custom_domain"
  | "legal_archive"
  | "community_feed"
  | "data_export"
  | "api_access";

/**
 * Límites por defecto del plan gratuito (`free`) según ADM-001 RF-04.7 y T-10.
 * Incluye 1 `tenant_owner` fijo y 0 `tenant_agent`.
 */
export const DEFAULT_FREE_PLAN_LIMITS: Record<PlanDimensionKey, number> = {
  max_products: 10,
  max_tenant_agents: 0,
  max_images_per_product: 5,
  max_audios: 5,
  max_videos: 2,
  max_pdfs: 5,
  chat_retention_days: 30,
  storage_bytes: 104_857_600, // 100 MB
  max_bots: 1,
  max_channels: 1,
  max_followup_sequences: 1,
};

/**
 * Piso legal mínimo por dimensión que ningún override puede reducir (ADM-001 RF-04.5, DAT-001 §3.2).
 */
export const LEGAL_FLOOR_BY_DIMENSION: Partial<Record<PlanDimensionKey, number>> = {
  chat_retention_days: 30,
};

/**
 * Sesión de onboarding persistida por usuario (`ADM-001 T-07`).
 */
export interface OnboardingSessionState {
  userId: string;
  clientId: string | null;
  planCode: string;
  currentStep: "business" | "product" | "bot_channel" | "completed";
  status: "in_progress" | "completed";
  draftPayload: {
    displayName?: string;
    slug?: string;
    locale?: "es" | "en";
    currency?: string;
    timezone?: string;
    productName?: string;
    productDescription?: string;
    productPriceCents?: number;
    botPreset?: string;
  };
  optionalChecklist: string[];
  startedAt: Date;
  completedAt: Date | null;
}

/**
 * Datos para completar el onboarding en una sesión corta (< 5 minutos) dejando al inquilino operativo (ADM-001 T-07, RF-14.8).
 */
export interface CompleteOnboardingWizardInput {
  userId: string;
  userEmail: string;
  emailVerified: boolean;
  hasActiveMembership: boolean;
  ownsLiveTenant: boolean;
  planCode?: string;
  business: {
    displayName: string;
    slug: string;
    locale?: "es" | "en";
    currency?: string;
    timezone?: string;
  };
  firstProduct?: {
    name: string;
    description: string;
    priceCents: number;
  };
  botPreset?: string;
}

/**
 * Resultado del onboarding guiado completado (`ADM-001 T-07`).
 */
export interface CompletedOnboardingOutcome {
  clientId: string;
  planCode: string;
  planId: string;
  cellId: string;
  locale: "es" | "en";
  currency: string;
  timezone: string;
  seededLabels: typeof RESERVED_MOCTER_LEAD_LABELS;
  firstProduct: {
    id: string;
    name: string;
    description: string;
    priceCents: number;
    currency: string;
    kind: "physical";
    condition: "new";
    availability: "in_stock";
    status: "published";
  };
  botConfig: {
    preset: string;
    remindersEnabled: false;
    webchatActive: true;
  };
  optionalPendingTasks: string[];
}

/**
 * Servicio de onboarding guiado, invitaciones, aprovisionamiento de celdas y enforcement de planes/límites (ADM-001 T-07, T-08, T-09, T-10).
 */
export class AdminOnboardingAndLimitsService {
  private readonly onboardingStore = new Map<string, OnboardingSessionState>();
  private readonly routingCache = new Map<string, { cellId: string; identityLocation: string }>();
  private readonly cellsStore = new Map<
    string,
    {
      id: string;
      code: string;
      status: "active" | "draining" | "readonly" | "maintenance";
      maxClients: number;
      currentClients: number;
    }
  >();
  private readonly invitationsStore = new Map<
    string,
    {
      id: string;
      clientId: string;
      email: string;
      role: "tenant_agent";
      invitedByUserId: string;
      tokenHashHex: string;
      status: "pending" | "accepted" | "revoked" | "expired";
      expiresAt: Date;
    }
  >();

  /**
   * Inicia o recupera una sesión de onboarding guiado interrumpible y reejecutable (ADM-001 T-07, RF-14.3 a RF-14.5).
   *
   * No crea ningún registro en `clients` hasta que se complete el paso de negocio.
   *
   * @param userId - Identificador UUID del usuario.
   * @param planCode - Código de plan opcional proveniente de `/register?plan_code=...`.
   * @returns El estado actual de la sesión de onboarding.
   */
  saveOrResumeOnboardingDraft(
    userId: string,
    draftUpdate: Partial<OnboardingSessionState["draftPayload"]> & {
      planCode?: string;
      currentStep?: OnboardingSessionState["currentStep"];
    } = {},
  ): OnboardingSessionState {
    const existing = this.onboardingStore.get(userId);
    const nextState: OnboardingSessionState = {
      userId,
      clientId: existing?.clientId ?? null,
      planCode: draftUpdate.planCode ?? existing?.planCode ?? "free",
      currentStep: draftUpdate.currentStep ?? existing?.currentStep ?? "business",
      status: existing?.status ?? "in_progress",
      draftPayload: {
        ...(existing?.draftPayload ?? {}),
        ...draftUpdate,
      },
      optionalChecklist: existing?.optionalChecklist ?? [
        "connect_whatsapp",
        "complete_policies",
        "load_more_products",
      ],
      startedAt: existing?.startedAt ?? new Date(),
      completedAt: existing?.completedAt ?? null,
    };
    this.onboardingStore.set(userId, nextState);
    return nextState;
  }

  /**
   * Obtiene el estado guardado del onboarding para un usuario (ADM-001 T-07).
   */
  getOnboardingSession(userId: string): OnboardingSessionState | null {
    return this.onboardingStore.get(userId) ?? null;
  }

  /**
   * Completa el asistente de onboarding dejando al inquilino operativo en una sesión corta (ADM-001 T-07, RF-14.1 a RF-14.11):
   * - Verifica correo confirmado y ausencia de membresía/inquilino vivo previo.
   * - Resuelve `plan_code` → `plan_id` (descartando planes retirados).
   * - Enruta a una celda con capacidad disponible (abriendo una nueva si la celda alcanza 100 inquilinos, T-09).
   * - Siembra defaults de plataforma (`COP`, `es`, `America/Bogota`, etiquetas reservadas `lead-frio..compra-realizada`, bot en ritmo natural, recordatorios apagados).
   * - Crea el primer producto demo/real y activa el canal webchat sin bloquear por WhatsApp ni políticas avanzadas.
   */
  completeOnboarding(
    input: CompleteOnboardingWizardInput,
    availablePlans: Array<{ id: string; code: string; status: "draft" | "active" | "retired" }>,
  ): Result<CompletedOnboardingOutcome> {
    if (!input.emailVerified) {
      return err(
        "Email must be verified before creating the tenant in onboarding (RF-14.6).",
        "EMAIL_NOT_VERIFIED",
      );
    }

    if (input.hasActiveMembership || input.ownsLiveTenant) {
      return err(
        "User already has an active membership or owns a live tenant (D-15, T-07).",
        "ALREADY_HAS_TENANT_OR_MEMBERSHIP",
      );
    }

    const businessName = input.business.displayName.trim();
    const slug = input.business.slug.trim().toLowerCase();
    if (!businessName || !slug) {
      return err("Business displayName and slug are required.", "INVALID_BUSINESS_DATA");
    }

    const savedSession = this.onboardingStore.get(input.userId);
    const effectivePlanCode = input.planCode ?? savedSession?.planCode ?? "free";
    const resolvedPlan = availablePlans.find((p) => p.code === effectivePlanCode);

    if (!resolvedPlan) {
      return err(`Plan '${effectivePlanCode}' does not exist.`, "PLAN_NOT_FOUND");
    }
    if (resolvedPlan.status === "retired") {
      return err(
        `Plan '${effectivePlanCode}' is retired and cannot be offered in self-service (ADM-001 T-10).`,
        "PLAN_RETIRED",
      );
    }

    const cell = this.allocateCellForNewTenant();
    const clientId = `019a0000-0000-7000-8000-${Math.floor(Math.random() * 1e12)
      .toString()
      .padStart(12, "0")}`;

    this.routingCache.set(clientId, {
      cellId: cell.id,
      identityLocation: cell.id,
    });

    const locale = input.business.locale ?? "es";
    const currency = (input.business.currency ?? "COP").toUpperCase();
    const timezone = input.business.timezone ?? "America/Bogota";

    const firstProduct = {
      id: `019a0000-0000-7000-8001-${Math.floor(Math.random() * 1e12)
        .toString()
        .padStart(12, "0")}`,
      name: input.firstProduct?.name?.trim() || `${businessName} - Producto Destacado`,
      description:
        input.firstProduct?.description?.trim() ||
        "Producto inicial configurado durante el onboarding rápido.",
      priceCents: input.firstProduct?.priceCents ?? 50_000_00,
      currency,
      kind: "physical" as const,
      condition: "new" as const,
      availability: "in_stock" as const,
      status: "published" as const,
    };

    const optionalPendingTasks = [
      "connect_whatsapp",
      "complete_policies",
      "load_more_products",
    ];

    this.onboardingStore.set(input.userId, {
      userId: input.userId,
      clientId,
      planCode: resolvedPlan.code,
      currentStep: "completed",
      status: "completed",
      draftPayload: {
        displayName: businessName,
        slug,
        locale,
        currency,
        timezone,
        productName: firstProduct.name,
        productDescription: firstProduct.description,
        productPriceCents: firstProduct.priceCents,
        botPreset: input.botPreset ?? "natural_rhythm",
      },
      optionalChecklist: optionalPendingTasks,
      startedAt: savedSession?.startedAt ?? new Date(),
      completedAt: new Date(),
    });

    return ok({
      clientId,
      planCode: resolvedPlan.code,
      planId: resolvedPlan.id,
      cellId: cell.id,
      locale,
      currency,
      timezone,
      seededLabels: RESERVED_MOCTER_LEAD_LABELS,
      firstProduct,
      botConfig: {
        preset: input.botPreset ?? "natural_rhythm",
        remindersEnabled: false,
        webchatActive: true,
      },
      optionalPendingTasks,
    });
  }

  /**
   * Registra una celda en el catálogo o abre una nueva automáticamente cuando las activas llegan a 100 inquilinos (ADM-001 T-09, RF-10.5, RF-10.15).
   */
  registerCell(cell: {
    id: string;
    code: string;
    status?: "active" | "draining" | "readonly" | "maintenance";
    maxClients?: number;
    currentClients?: number;
  }): void {
    this.cellsStore.set(cell.id, {
      id: cell.id,
      code: cell.code,
      status: cell.status ?? "active",
      maxClients: cell.maxClients ?? 100,
      currentClients: cell.currentClients ?? 0,
    });
  }

  /**
   * Asigna una celda con capacidad (< 100 inquilinos); si la celda actual tiene 100 inquilinos, aprovisiona automáticamente una nueva celda (ADM-001 T-09).
   */
  allocateCellForNewTenant(): {
    id: string;
    code: string;
    currentClients: number;
    maxClients: number;
    newlyProvisioned: boolean;
  } {
    for (const cell of this.cellsStore.values()) {
      if (cell.status === "active" && cell.currentClients < cell.maxClients) {
        cell.currentClients += 1;
        return { ...cell, newlyProvisioned: false };
      }
    }

    const nextIndex = this.cellsStore.size + 1;
    const newCell = {
      id: `019a0000-0000-7000-8002-${String(nextIndex).padStart(12, "0")}`,
      code: `cell-${String(nextIndex).padStart(2, "0")}`,
      status: "active" as const,
      maxClients: 100,
      currentClients: 1,
    };
    this.cellsStore.set(newCell.id, newCell);
    return { ...newCell, newlyProvisioned: true };
  }

  /**
   * Ejecuta una consulta de datos de inquilino exigiendo resolución previa de celda en `client_routing` (ADM-001 T-09, RF-10.7).
   */
  executeTenantScopedQuery<T>(
    clientId: string | null | undefined,
    resolvedCellId: string | null | undefined,
    callback: (context: { clientId: string; cellId: string }) => T,
  ): Result<T> {
    if (!clientId) {
      return err("Tenant clientId is required.", "MISSING_CLIENT_ID");
    }
    const cachedRouting = this.routingCache.get(clientId);
    const effectiveCellId = resolvedCellId ?? cachedRouting?.cellId;
    if (!effectiveCellId) {
      return err(
        "Query rejected: tenant cell routing must be resolved before querying a cell (ADM-001 RF-10.7).",
        "UNRESOLVED_CELL_ROUTING",
      );
    }
    return ok(callback({ clientId, cellId: effectiveCellId }));
  }

  /**
   * Crea una invitación para unirse a un inquilino existente como `tenant_agent` (ADM-001 T-08, RF-14.7, D-31).
   *
   * El rol `tenant_owner` es único y jamás puede ser invitado.
   */
  issueTenantInvitation(params: {
    clientId: string;
    email: string;
    invitedByUserId: string;
    requestedRole?: string;
    ttlMs?: number;
    maxTenantAgentsAllowed: number;
    currentActiveAgentsCount: number;
  }): Result<{ invitationId: string; rawToken: string; expiresAt: Date }> {
    if (params.requestedRole && params.requestedRole !== "tenant_agent") {
      return err(
        "tenant_owner is unique per tenant and cannot be invited; invitations only grant tenant_agent (ADM-001 T-08, D-31).",
        "CANNOT_INVITE_OWNER_ROLE",
      );
    }

    if (params.currentActiveAgentsCount >= params.maxTenantAgentsAllowed) {
      return err(
        `Plan limit exceeded for max_tenant_agents (${params.maxTenantAgentsAllowed}). Upgrade your plan to invite more agents (ADM-001 T-10).`,
        "QUOTA_EXCEEDED_MAX_TENANT_AGENTS",
      );
    }

    const rawToken = randomBytes(32).toString("hex");
    const tokenHashHex = createHash("sha256").update(rawToken).digest("hex");
    const invitationId = `019a0000-0000-7000-8003-${String(this.invitationsStore.size + 1).padStart(12, "0")}`;
    const expiresAt = new Date(Date.now() + (params.ttlMs ?? 7 * 24 * 60 * 60 * 1000));

    this.invitationsStore.set(tokenHashHex, {
      id: invitationId,
      clientId: params.clientId,
      email: params.email.trim().toLowerCase(),
      role: "tenant_agent",
      invitedByUserId: params.invitedByUserId,
      tokenHashHex,
      status: "pending",
      expiresAt,
    });

    return ok({ invitationId, rawToken, expiresAt });
  }

  /**
   * Acepta una invitación de inquilino validando vencimiento y membresía única `1:0..1` (ADM-001 T-08, D-15).
   */
  acceptTenantInvitation(params: {
    rawToken: string;
    userId: string;
    userEmail: string;
    userActiveClientId: string | null;
    now?: Date;
  }): Result<{ clientId: string; assignedRole: "tenant_agent" }> {
    const tokenHashHex = createHash("sha256").update(params.rawToken).digest("hex");
    const invitation = this.invitationsStore.get(tokenHashHex);

    if (!invitation || invitation.status !== "pending") {
      return err("Invitation not found or already consumed.", "INVITATION_INVALID");
    }

    const now = params.now ?? new Date();
    if (now.getTime() > invitation.expiresAt.getTime()) {
      invitation.status = "expired";
      return err(
        "Invitation has expired and cannot create a membership (ADM-001 T-08).",
        "INVITATION_EXPIRED",
      );
    }

    if (params.userActiveClientId !== null) {
      return err(
        "User already has an active membership in another tenant (ADM-001 D-15, T-08).",
        "USER_ALREADY_HAS_ACTIVE_MEMBERSHIP",
      );
    }

    invitation.status = "accepted";
    return ok({
      clientId: invitation.clientId,
      assignedRole: "tenant_agent",
    });
  }

  /**
   * Evalúa un límite numérico de plan aplicando overrides vigentes del inquilino y piso legal (ADM-001 T-10, RF-04.1 a RF-04.5).
   */
  evaluateNumericQuota(params: {
    clientId: string;
    dimension: PlanDimensionKey;
    currentUsedValue: number;
    incrementBy: number;
    planLimits: Partial<Record<PlanDimensionKey, number>>;
    clientOverrides?: Array<{
      clientId: string;
      dimension: PlanDimensionKey;
      value: number;
      validFrom: Date;
      validTo: Date | null;
    }>;
    now?: Date;
  }): Result<{ allowed: true; effectiveLimit: number; projectedValue: number }> {
    const now = params.now ?? new Date();
    const activeOverride = params.clientOverrides?.find(
      (o) =>
        o.clientId === params.clientId &&
        o.dimension === params.dimension &&
        o.validFrom.getTime() <= now.getTime() &&
        (o.validTo === null || o.validTo.getTime() > now.getTime()),
    );

    const baseLimit =
      params.planLimits[params.dimension] ?? DEFAULT_FREE_PLAN_LIMITS[params.dimension];
    const rawLimit = activeOverride ? activeOverride.value : baseLimit;
    const legalFloor = LEGAL_FLOOR_BY_DIMENSION[params.dimension];
    const effectiveLimit =
      legalFloor !== undefined ? Math.max(rawLimit, legalFloor) : rawLimit;

    const projectedValue = params.currentUsedValue + params.incrementBy;
    if (projectedValue > effectiveLimit) {
      return err(
        `Quota exceeded for dimension '${params.dimension}': requested ${projectedValue}, limit is ${effectiveLimit} (ADM-001 RF-04.3, T-10).`,
        `QUOTA_EXCEEDED_${params.dimension.toUpperCase()}`,
      );
    }

    return ok({ allowed: true, effectiveLimit, projectedValue });
  }

  /**
   * Evalúa si un inquilino tiene habilitada una capacidad (`plan_features`), aplicando overrides por inquilino.
   *
   * Nota: `marketing_features` jamás se usa para enforcement (ADM-001 T-10, RF-04.9).
   */
  evaluateFeatureGate(params: {
    clientId: string;
    featureKey: PlanFeatureKey;
    planFeatureValues: Partial<
      Record<PlanFeatureKey, { enabled: boolean; value?: unknown }>
    >;
    clientFeatureOverrides?: Array<{
      clientId: string;
      featureKey: PlanFeatureKey;
      enabled: boolean;
      value?: unknown;
      validFrom: Date;
      validTo: Date | null;
    }>;
    now?: Date;
  }): Result<{ enabled: true; value: unknown }> {
    const now = params.now ?? new Date();
    const activeOverride = params.clientFeatureOverrides?.find(
      (o) =>
        o.clientId === params.clientId &&
        o.featureKey === params.featureKey &&
        o.validFrom.getTime() <= now.getTime() &&
        (o.validTo === null || o.validTo.getTime() > now.getTime()),
    );

    const resolved = activeOverride ?? params.planFeatureValues[params.featureKey];
    if (!resolved || !resolved.enabled) {
      return err(
        `Feature '${params.featureKey}' is not enabled for this tenant's plan (ADM-001 T-10).`,
        `FEATURE_DISABLED_${params.featureKey.toUpperCase()}`,
      );
    }

    return ok({ enabled: true, value: resolved.value ?? true });
  }
}

