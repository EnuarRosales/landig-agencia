import type { Client } from "../db/schemas/admin/clients";
import type { ClientPlan } from "../db/schemas/admin/client-plans";
import type { ClientRouting } from "../db/schemas/admin/client-routing";
import type { User } from "../db/schemas/admin/users";
import type { IAuthRepository } from "../repositories/auth.repository.interface";
import type { IClientsRepository } from "../repositories/clients.repository.interface";
import type { IPlansRepository } from "../repositories/plans.repository.interface";
import { err, ok, type Result } from "../types/result";

/**
 * Códigos de error esperados de negocio para la gestión de tenencia y aprovisionamiento de inquilinos (ADM-001 T-05, T-06).
 */
export type TenancyErrorCode =
  | "OWNER_USER_ID_REQUIRED"
  | "OWNER_NOT_FOUND"
  | "OWNER_EMAIL_NOT_VERIFIED"
  | "OWNER_ALREADY_HAS_ACTIVE_MEMBERSHIP"
  | "OWNER_ALREADY_OWNS_LIVE_TENANT"
  | "SLUG_ALREADY_TAKEN"
  | "INVALID_SLUG"
  | "INVALID_CONTACT_EMAIL"
  | "PLAN_NOT_FOUND"
  | "PLAN_RETIRED"
  | "NO_AVAILABLE_CELL";

/**
 * Error tipado de negocio retornado por {@link TenancyService}.
 */
export interface TenancyError {
  /** Código canónico del error de tenencia. */
  code: TenancyErrorCode;
  /** Mensaje técnico descriptivo del error. */
  message: string;
}

/**
 * Datos comerciales y de perfil opcionales de un inquilino (ADM-001 RF-01.11).
 *
 * Todos estos campos son opcionales para evitar fricción durante el alta.
 */
export interface TenantCommercialProfileInput {
  /** Teléfono comercial en formato E.164 (opcional). */
  phone?: string | null;
  /** Sitio web público del comercio (opcional). */
  websiteUrl?: string | null;
  /** Identificación tributaria / NIT (opcional). */
  taxId?: string | null;
  /** País de la dirección física (opcional). */
  country?: string | null;
  /** Departamento o estado de la dirección física (opcional). */
  state?: string | null;
  /** Ciudad o municipio de la dirección física (opcional). */
  city?: string | null;
  /** Línea de dirección física (opcional). */
  addressLine?: string | null;
  /** Código postal (opcional). */
  postalCode?: string | null;
  /** Sector o industria del comercio (opcional). */
  industry?: string | null;
  /** Zona horaria IANA (por defecto `'America/Bogota'`). */
  timezone?: string;
  /** Identificador de archivo del logo en `admin.media_catalog` (opcional). */
  logoMediaId?: string | null;
  /** Mapa de redes sociales (por defecto `{}`). */
  socialLinks?: Record<string, string>;
}

/**
 * Parámetros para el alta de un inquilino cuando el usuario dueño ya existe (autoservicio / onboarding).
 */
export interface CreateTenantForOwnerInput extends TenantCommercialProfileInput {
  /** Identificador UUID obligatorio del usuario dueño (`admin.users.id`). */
  ownerUserId: string;
  /** Nombre comercial visible del inquilino. */
  displayName: string;
  /** Slug único del inquilino (`[a-z0-9-]+`). */
  slug: string;
  /** Correo comercial de contacto (si se omite, hereda el correo del dueño). */
  contactEmail?: string;
  /** Idioma por defecto del inquilino (`'es'` o `'en'`, por defecto `'es'`). */
  locale?: "es" | "en";
  /** Moneda ISO 4217 del catálogo (por defecto `'COP'`). */
  currency?: string;
  /** Identificador UUID del plan o código de plan (`plan_code`, por defecto `'free'`). */
  planIdOrCode?: string;
  /** Celda preferida opcional (`admin.cells.id`). */
  preferredCellId?: string;
}

/**
 * Parámetros para el alta manual de un inquilino ejecutada por `platform_sales` (ADM-001 §6.3, T-06).
 */
export interface ProvisionTenantManualSalesInput extends TenantCommercialProfileInput {
  /** Correo electrónico del usuario dueño (si existe se reutiliza; si no existe se crea en la misma operación). */
  ownerEmail: string;
  /** Nombre visible opcional del usuario dueño si se crea por primera vez. */
  ownerDisplayName?: string | null;
  /** Identificador UUID opcional del dueño cuando ya se conoce de antemano. */
  ownerUserId?: string;
  /** Nombre comercial visible del inquilino. */
  displayName: string;
  /** Slug único del inquilino (`[a-z0-9-]+`). */
  slug: string;
  /** Correo comercial de contacto (por defecto igual a `ownerEmail`). */
  contactEmail?: string;
  /** Idioma por defecto del inquilino (`'es'` o `'en'`, por defecto `'es'`). */
  locale?: "es" | "en";
  /** Moneda ISO 4217 del catálogo (por defecto `'COP'`). */
  currency?: string;
  /** Identificador UUID o código del plan asignado por ventas. */
  planIdOrCode: string;
  /** Identificador UUID del operador de ventas (`platform_sales`) que ejecuta el alta. */
  salesActorUserId: string;
  /** Celda preferida opcional (`admin.cells.id`). */
  preferredCellId?: string;
}

/**
 * Resultado exitoso del aprovisionamiento de un inquilino.
 */
export interface ProvisionedTenantResult {
  /** Usuario dueño vinculado (`admin.users`). */
  owner: User;
  /** Indica si el usuario dueño fue creado nuevo durante la operación manual. */
  ownerCreated: boolean;
  /** Inquilino creado (`admin.clients`). */
  client: Client;
  /** Asignación de plan registrada (`admin.client_plans`). */
  clientPlan: ClientPlan;
  /** Enrutamiento de celda registrado (`admin.client_routing`). */
  routing: ClientRouting;
}

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Servicio de dominio encargado de la identidad de tenencia, creación de inquilinos (`admin.clients`),
 * validación de unicidad de `owner_user_id` y membresía única (`users.active_client_id`),
 * y coordinación del alta por autoservicio o por venta manual (`platform_sales`) (ADM-001 T-05, T-06).
 */
export class TenancyService {
  /**
   * Inicializa una nueva instancia de {@link TenancyService}.
   *
   * @param clientsRepo - Repositorio de inquilinos y enrutamiento en el Router Global.
   * @param authRepo - Repositorio de identidad en el Router Global.
   * @param plansRepo - Repositorio del catálogo canónico de planes.
   */
  constructor(
    private readonly clientsRepo: IClientsRepository,
    private readonly authRepo: IAuthRepository,
    private readonly plansRepo: IPlansRepository,
  ) {}

  /**
   * Crea un inquilino en modo autoservicio para un usuario dueño existente y verificado (ADM-001 T-05, T-06).
   *
   * Reglas verificadas antes de persistir:
   * - `ownerUserId` es obligatorio y debe existir en `admin.users`.
   * - El correo del dueño debe estar verificado (`email_verified_at IS NOT NULL`, RF-14.6).
   * - El dueño no puede tener `active_client_id` activo ni ser dueño de otro inquilino con `lifecycle_status <> 'baja'`.
   * - El alta se completa sin exigir `phone`, `taxId` (NIT) ni dirección (`country`, `state`, `city`, `addressLine`, `postalCode`).
   *
   * @param input - Datos del negocio y del usuario dueño.
   * @returns `Result` con el inquilino aprovisionado o el error de negocio correspondiente.
   */
  async createTenantForSelfService(
    input: CreateTenantForOwnerInput,
  ): Promise<Result<ProvisionedTenantResult>> {
    const ownerUserId = input.ownerUserId?.trim();
    if (!ownerUserId) {
      return err(
        "owner_user_id is mandatory to create a tenant.",
        "OWNER_USER_ID_REQUIRED",
      );
    }

    const owner = await this.authRepo.findUserById(ownerUserId);
    if (!owner) {
      return err(
        "The specified owner user does not exist.",
        "OWNER_NOT_FOUND",
      );
    }

    if (!owner.emailVerifiedAt) {
      return err(
        "Owner email must be verified before creating a tenant (ADM-001 RF-14.6).",
        "OWNER_EMAIL_NOT_VERIFIED",
      );
    }

    return this.executeTenantProvisioning({
      owner,
      ownerCreated: false,
      displayName: input.displayName,
      slug: input.slug,
      contactEmail: input.contactEmail ?? owner.email,
      locale: input.locale ?? "es",
      currency: input.currency ?? "COP",
      planIdOrCode: input.planIdOrCode ?? "free",
      planSource: "self_service",
      assignedByUserId: owner.id,
      actor: owner.id,
      preferredCellId: input.preferredCellId,
      profile: input,
    });
  }

  /**
   * Ejecuta el alta manual de un inquilino por `platform_sales` (ADM-001 §6.3, T-06).
   *
   * En una misma operación coordinada:
   * - Si el correo del dueño ya existe en `admin.users`, vincula la identidad existente sin duplicarla.
   * - Si no existe, crea el usuario en `admin.users` con su consentimiento (`channel = 'manual_sales'`).
   * - Verifica que el usuario no tenga un `active_client_id` ni sea dueño de otro inquilino no dado de baja.
   * - Crea el inquilino en `admin.clients` (sin requerir `phone`, NIT ni dirección), reserva `users.active_client_id`,
   *   asigna el plan en `admin.client_plans` (`source = 'manual'`) y registra el enrutamiento en `admin.client_routing`.
   *
   * @param input - Parámetros del alta manual por ventas.
   * @returns `Result` con el inquilino y usuario dueño aprovisionados o el error de negocio correspondiente.
   */
  async provisionTenantByManualSales(
    input: ProvisionTenantManualSalesInput,
  ): Promise<Result<ProvisionedTenantResult>> {
    const normalizedEmail = input.ownerEmail?.trim().toLowerCase();
    if (!normalizedEmail || !EMAIL_REGEX.test(normalizedEmail)) {
      return err(
        "A valid owner email is required for manual tenant provisioning.",
        "INVALID_CONTACT_EMAIL",
      );
    }

    let owner: User | null = null;
    let ownerCreated = false;

    if (input.ownerUserId) {
      owner = await this.authRepo.findUserById(input.ownerUserId);
      if (!owner) {
        return err(
          "The specified owner_user_id does not exist.",
          "OWNER_NOT_FOUND",
        );
      }
    } else {
      owner = await this.authRepo.findUserByEmail(normalizedEmail);
      if (!owner) {
        const created = await this.authRepo.createUserWithConsent({
          email: normalizedEmail,
          displayName: input.ownerDisplayName ?? input.displayName.trim(),
          createdBy: input.salesActorUserId,
          policyVersion: "v1.0",
          channel: "manual_sales",
        });
        owner = created.user;
        ownerCreated = true;
      }
    }

    return this.executeTenantProvisioning({
      owner,
      ownerCreated,
      displayName: input.displayName,
      slug: input.slug,
      contactEmail: input.contactEmail ?? owner.email,
      locale: input.locale ?? "es",
      currency: input.currency ?? "COP",
      planIdOrCode: input.planIdOrCode,
      planSource: "manual",
      assignedByUserId: input.salesActorUserId,
      actor: input.salesActorUserId,
      preferredCellId: input.preferredCellId,
      profile: input,
    });
  }

  /**
   * Orquesta las validaciones invariantes de `ADM-001 T-06` y persiste el inquilino en el Router Global.
   */
  private async executeTenantProvisioning(params: {
    owner: User;
    ownerCreated: boolean;
    displayName: string;
    slug: string;
    contactEmail: string;
    locale: "es" | "en";
    currency: string;
    planIdOrCode: string;
    planSource: "manual" | "self_service";
    assignedByUserId: string;
    actor: string;
    preferredCellId?: string;
    profile: TenantCommercialProfileInput;
  }): Promise<Result<ProvisionedTenantResult>> {
    const normalizedSlug = params.slug.trim().toLowerCase();
    if (!SLUG_REGEX.test(normalizedSlug)) {
      return err(
        "Tenant slug must contain only lowercase alphanumeric characters and hyphens.",
        "INVALID_SLUG",
      );
    }

    const normalizedContactEmail = params.contactEmail.trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalizedContactEmail)) {
      return err(
        "Tenant contact_email must be a valid email address.",
        "INVALID_CONTACT_EMAIL",
      );
    }

    // 1. Verificar que el usuario no tenga ya una membresía activa (users.active_client_id)
    if (params.owner.activeClientId !== null) {
      return err(
        "User already has an active tenant membership (active_client_id is not null).",
        "OWNER_ALREADY_HAS_ACTIVE_MEMBERSHIP",
      );
    }

    // 2. Verificar que el usuario no sea dueño de otro inquilino no dado de baja (clients_one_live_owner)
    const existingOwnedTenant = await this.clientsRepo.findLiveByOwnerUserId(params.owner.id);
    if (existingOwnedTenant) {
      return err(
        "User already owns a live tenant (lifecycle_status <> 'baja').",
        "OWNER_ALREADY_OWNS_LIVE_TENANT",
      );
    }

    // 3. Verificar disponibilidad del slug
    const existingSlug = await this.clientsRepo.findBySlug(normalizedSlug);
    if (existingSlug) {
      return err(
        `Tenant slug '${normalizedSlug}' is already in use.`,
        "SLUG_ALREADY_TAKEN",
      );
    }

    // 4. Resolver el plan por UUID o por código slug
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        params.planIdOrCode,
      );
    const plan = isUuid
      ? await this.plansRepo.findById(params.planIdOrCode)
      : await this.plansRepo.findByCode(params.planIdOrCode);

    if (!plan) {
      return err(
        `Plan '${params.planIdOrCode}' was not found in the catalog.`,
        "PLAN_NOT_FOUND",
      );
    }

    if (plan.status === "retired") {
      return err(
        `Plan '${plan.code}' is retired and cannot be assigned to new tenants.`,
        "PLAN_RETIRED",
      );
    }

    // 5. Seleccionar una celda activa con capacidad disponible
    const cell = await this.clientsRepo.findAvailableCell(params.preferredCellId);
    if (!cell) {
      return err(
        "No active cell with available capacity was found.",
        "NO_AVAILABLE_CELL",
      );
    }

    // 6. Persistir transaccionalmente en el Router Global
    const provisioned = await this.clientsRepo.provisionTenantInRouter({
      client: {
        ownerUserId: params.owner.id,
        slug: normalizedSlug,
        displayName: params.displayName.trim(),
        contactEmail: normalizedContactEmail,
        phone: params.profile.phone ?? null,
        websiteUrl: params.profile.websiteUrl ?? null,
        lifecycleStatus: "alta",
        locale: params.locale,
        currency: params.currency.toUpperCase(),
        planId: plan.id,
        quotaVersion: 1,
        taxId: params.profile.taxId ?? null,
        country: params.profile.country ?? null,
        state: params.profile.state ?? null,
        city: params.profile.city ?? null,
        addressLine: params.profile.addressLine ?? null,
        postalCode: params.profile.postalCode ?? null,
        industry: params.profile.industry ?? null,
        timezone: params.profile.timezone ?? "America/Bogota",
        logoMediaId: params.profile.logoMediaId ?? null,
        socialLinks: params.profile.socialLinks ?? {},
        createdBy: params.actor,
        updatedBy: params.actor,
      },
      cellId: cell.id,
      planSource: params.planSource,
      assignedByUserId: params.assignedByUserId,
      actor: params.actor,
    });

    const updatedOwner: User = {
      ...params.owner,
      activeClientId: provisioned.client.id,
    };

    return ok({
      owner: updatedOwner,
      ownerCreated: params.ownerCreated,
      client: provisioned.client,
      clientPlan: provisioned.clientPlan,
      routing: provisioned.routing,
    });
  }
}
