import { sql, desc, asc, eq, and } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  clients,
  leads,
  cells,
  plans,
  users,
  clientRouting,
  clientPlans,
  subscriptions,
  emailProviderConfigs,
  emailSenders,
  emailEvents,
  emailTemplates,
  type Lead,
  type Cell,
  type Plan,
} from "../db/schemas";
import { ok, err, type Result } from "../types/result";
import { appLogger } from "../utils/logger";
import { CANONICAL_EMAIL_SENDERS, CANONICAL_EMAIL_EVENTS } from "./notifications-and-leads.service";
import { createCipheriv, randomBytes, createHash } from "node:crypto";

export interface ControlPlaneMetricsDto {
  tenants: number;
  leads: number;
  cells: number;
  dbStatus: string;
}

export interface CreateAdminCellInput {
  code: string;
  tier?: string;
  pgbouncerHost: string;
  pgbouncerPort?: number;
  databaseName: string;
  maxClients?: number;
  region?: string;
  createdBy?: string;
}

export interface CreateAdminPlanInput {
  code: string;
  nameEs: string;
  nameEn?: string;
  descriptionEs?: string;
  descriptionEn?: string;
  priceMonthlyCop: number;
  priceAnnualCop?: number;
  trialDays?: number;
  graceDays?: number;
  isPublic?: boolean;
  isPopular?: boolean;
  status?: "draft" | "active" | "retired";
  marketingFeaturesEs?: string[];
  createdBy?: string;
}

/**
 * Consulta en caliente las métricas reales del plano de control corporativo (ADM-001, DAT-001).
 * Encapsula Drizzle ORM dentro del dominio sin exponer sql ni dependencias internas a la capa UI.
 */
export async function fetchControlPlaneMetrics(): Promise<ControlPlaneMetricsDto> {
  try {
    const db = getDb();
    const [clientsCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(clients);
    const [leadsCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(leads);
    const [cellsCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(cells);

    return {
      tenants: clientsCount?.count ?? 0,
      leads: leadsCount?.count ?? 0,
      cells: cellsCount?.count ?? 0,
      dbStatus: "Operativo",
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[fetchControlPlaneMetrics Failed] ${msg}`, error);
    return {
      tenants: 0,
      leads: 0,
      cells: 0,
      dbStatus: "Error Conexión",
    };
  }
}

/**
 * Consulta la lista de prospectos reales registrados desde la landing page ordenados por fecha descendente.
 */
export async function fetchAdminLeads(limit = 100): Promise<Lead[]> {
  try {
    const db = getDb();
    return await db.select().from(leads).orderBy(desc(leads.createdAt)).limit(limit);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[fetchAdminLeads Failed] ${msg}`, error);
    return [];
  }
}

/**
 * Consulta la lista de celdas de datos desplegadas en el plano de control (DAT-001 §3.3).
 */
export async function fetchAdminCells(): Promise<Cell[]> {
  try {
    const db = getDb();
    return await db.select().from(cells).orderBy(asc(cells.code));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[fetchAdminCells Failed] ${msg}`, error);
    return [];
  }
}

/**
 * Registra una nueva célula de datos en el Router Global (`admin.cells`, DAT-001).
 */
export async function createAdminCell(input: CreateAdminCellInput): Promise<Result<Cell>> {
  try {
    const db = getDb();
    const operator = input.createdBy || "01a19874-1077-744c-8514-d4c990cd7259";
    const [row] = await db
      .insert(cells)
      .values({
        code: input.code.trim().toLowerCase(),
        tier: input.tier || "standard",
        status: "active",
        pgbouncerHost: input.pgbouncerHost.trim(),
        pgbouncerPort: input.pgbouncerPort || 6432,
        databaseName: input.databaseName.trim(),
        maxClients: input.maxClients || 100,
        currentClients: 0,
        region: input.region || "us-east-1",
        createdBy: operator,
        updatedBy: operator,
      })
      .returning();

    if (!row) {
      return err("No se pudo registrar la célula de datos", "CELL_INSERT_FAILED");
    }
    return ok(row);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[createAdminCell Failed] ${msg}`, error);
    return err(`Error al registrar celda: ${msg}`, "CELL_ERROR");
  }
}

/**
 * Consulta el catálogo completo de planes comerciales y privados para administración (ADM-001, DAT-001).
 */
export async function fetchAdminPlans(): Promise<Plan[]> {
  try {
    const db = getDb();
    return await db.select().from(plans).orderBy(asc(plans.sortOrder), asc(plans.code));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[fetchAdminPlans Failed] ${msg}`, error);
    return [];
  }
}

/**
 * Registra o actualiza un plan comercial o plan VIP privado (`admin.plans`).
 */
export async function createAdminPlan(input: CreateAdminPlanInput): Promise<Result<Plan>> {
  try {
    const db = getDb();
    const operator = input.createdBy || "01a19874-1077-744c-8514-d4c990cd7259";
    const priceMonthlyCents = Math.round(input.priceMonthlyCop * 100);
    const priceAnnualCents = input.priceAnnualCop
      ? Math.round(input.priceAnnualCop * 100)
      : priceMonthlyCents * 10;

    const [row] = await db
      .insert(plans)
      .values({
        code: input.code.trim().toLowerCase(),
        name: {
          es: input.nameEs.trim(),
          en: input.nameEn?.trim() || input.nameEs.trim(),
        },
        description: {
          es: input.descriptionEs?.trim() || "",
          en: input.descriptionEn?.trim() || input.descriptionEs?.trim() || "",
        },
        status: input.status || "active",
        isPublic: input.isPublic ?? false,
        isPopular: input.isPopular ?? false,
        sortOrder: 10,
        trialDays: input.trialDays ?? 14,
        graceDays: input.graceDays ?? 7,
        billingCycles: ["monthly", "annual"],
        priceMonthlyCents,
        priceAnnualCents,
        currency: "COP",
        marketingFeatures: {
          es: input.marketingFeaturesEs || [],
          en: [],
        },
        createdBy: operator,
        updatedBy: operator,
      })
      .returning();

    if (!row) {
      return err("No se pudo registrar el plan comercial", "PLAN_INSERT_FAILED");
    }
    return ok(row);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[createAdminPlan Failed] ${msg}`, error);
    return err(`Error al registrar plan: ${msg}`, "PLAN_ERROR");
  }
}

export interface TenantSubscriptionDto {
  [key: string]: unknown;
  id: string;
  clientName: string;
  clientSlug: string;
  contactEmail: string;
  planCode: string;
  planName: string;
  status: string;
  cycle: string;
  priceCop: number;
  priceFormatted: string;
  gateway: string;
  renewalDate: string;
  createdAt: string;
}

export interface PlanBreakdownDto {
  code: string;
  name: string;
  priceCop: number;
  priceFormatted: string;
  subscribersCount: number;
  totalMrrCop: number;
  totalMrrFormatted: string;
}

export interface AdminSubscriptionsOverviewDto {
  kpis: {
    totalSubscribers: number;
    activeSubscribers: number;
    trialSubscribers: number;
    pastDueSubscribers: number;
    totalMrrCop: number;
    totalMrrFormatted: string;
    projectedArrFormatted: string;
  };
  planBreakdown: PlanBreakdownDto[];
  tenants: TenantSubscriptionDto[];
}

function formatCop(amount: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Consulta en caliente el resumen de inquilinos suscritos por plan para la supervisión
 * comercial del Platform Owner (BILL-001, ADM-001). Cero datos semilla en código duro.
 */
export async function fetchAdminSubscriptionsOverview(): Promise<AdminSubscriptionsOverviewDto> {
  try {
    const db = getDb();
    const allPlans = await db
      .select()
      .from(plans)
      .orderBy(asc(plans.sortOrder), asc(plans.code));

    const clientRows = await db
      .select({
        clientId: clients.id,
        displayName: clients.displayName,
        slug: clients.slug,
        contactEmail: clients.contactEmail,
        lifecycleStatus: clients.lifecycleStatus,
        createdAt: clients.createdAt,
        planId: plans.id,
        planCode: plans.code,
        planNameJson: plans.name,
        priceMonthlyCents: plans.priceMonthlyCents,
        priceAnnualCents: plans.priceAnnualCents,
        subscriptionStatus: subscriptions.status,
        subscriptionCycle: subscriptions.cycle,
        gateway: subscriptions.gateway,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
      })
      .from(clients)
      .innerJoin(plans, eq(clients.planId, plans.id))
      .leftJoin(subscriptions, eq(clients.id, subscriptions.clientId))
      .orderBy(desc(clients.createdAt));

    let activeCount = 0;
    let trialCount = 0;
    let pastDueCount = 0;
    let totalMrrCop = 0;

    const planCountMap = new Map<string, number>();
    const planMrrMap = new Map<string, number>();

    const tenants: TenantSubscriptionDto[] = clientRows.map((r) => {
      const priceMonthlyCop = Math.round(Number(r.priceMonthlyCents) / 100);
      const isAnnual = r.subscriptionCycle === "annual";
      const feeCop = isAnnual
        ? Math.round(Number(r.priceAnnualCents) / 100)
        : priceMonthlyCop;

      const subStatus =
        r.subscriptionStatus ||
        (r.lifecycleStatus === "alta" ? "trialing" : "active");

      if (subStatus === "active") activeCount++;
      else if (subStatus === "trialing") trialCount++;
      else if (subStatus === "past_due") pastDueCount++;

      if (subStatus === "active" || subStatus === "trialing") {
        totalMrrCop += priceMonthlyCop;
        planCountMap.set(r.planCode, (planCountMap.get(r.planCode) || 0) + 1);
        planMrrMap.set(
          r.planCode,
          (planMrrMap.get(r.planCode) || 0) + priceMonthlyCop,
        );
      }

      const planNameObj = r.planNameJson as { es?: string; en?: string } | null;
      const planName = planNameObj?.es || r.planCode;

      return {
        id: r.clientId,
        clientName: r.displayName,
        clientSlug: r.slug,
        contactEmail: r.contactEmail,
        planCode: r.planCode,
        planName,
        status: subStatus,
        cycle: isAnnual ? "Anual" : "Mensual",
        priceCop: feeCop,
        priceFormatted: formatCop(feeCop),
        gateway: r.gateway ? r.gateway.toUpperCase() : "Wompi / Directo",
        renewalDate: r.currentPeriodEnd
          ? new Date(r.currentPeriodEnd).toISOString().split("T")[0]
          : "En Proceso",
        createdAt: r.createdAt
          ? new Date(r.createdAt).toISOString().split("T")[0]
          : "—",
      };
    });

    const planBreakdown: PlanBreakdownDto[] = allPlans.map((p) => {
      const priceMonthlyCop = Math.round(Number(p.priceMonthlyCents) / 100);
      const subscribersCount = planCountMap.get(p.code) || 0;
      const mrrCop = planMrrMap.get(p.code) || 0;
      const pNameObj = p.name as { es?: string; en?: string } | null;
      return {
        code: p.code,
        name: pNameObj?.es || p.code,
        priceCop: priceMonthlyCop,
        priceFormatted: formatCop(priceMonthlyCop),
        subscribersCount,
        totalMrrCop: mrrCop,
        totalMrrFormatted: formatCop(mrrCop),
      };
    });

    return {
      kpis: {
        totalSubscribers: clientRows.length,
        activeSubscribers: activeCount,
        trialSubscribers: trialCount,
        pastDueSubscribers: pastDueCount,
        totalMrrCop,
        totalMrrFormatted: formatCop(totalMrrCop),
        projectedArrFormatted: formatCop(totalMrrCop * 12),
      },
      planBreakdown,
      tenants,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[fetchAdminSubscriptionsOverview Failed] ${msg}`, error);
    return {
      kpis: {
        totalSubscribers: 0,
        activeSubscribers: 0,
        trialSubscribers: 0,
        pastDueSubscribers: 0,
        totalMrrCop: 0,
        totalMrrFormatted: "$0 COP",
        projectedArrFormatted: "$0 COP",
      },
      planBreakdown: [],
      tenants: [],
    };
  }
}

export interface AdminEmailSettingsDto {
  provider: {
    id: string;
    name: string;
    driver: string;
    host: string;
    port: number;
    secure: boolean;
    username: string | null;
    hasPassword: boolean;
    maskedSecret: string;
    status: string;
  } | null;
  senders: Array<{
    id: string;
    key: string;
    fromName: string;
    fromEmail: string;
    replyTo: string | null;
    providerId: string;
    providerName: string;
    isDefault: boolean;
    status: string;
  }>;
  events: Array<{
    id: string;
    key: string;
    category: string;
    description: string;
    variablesSchema: string[];
    defaultSenderKey: string | null;
    isEnabled: boolean;
    isSystem: boolean;
  }>;
  templates: Array<{
    id: string;
    eventKey: string;
    locale: string;
    senderId: string | null;
    senderName?: string;
    senderEmail?: string;
    subject: string;
    bodyHtml: string;
    version: number;
    status: string;
    isLocked: boolean;
  }>;
}

export interface SaveAdminSmtpProviderInput {
  id?: string;
  name: string;
  host: string;
  port: number;
  secure?: boolean;
  username?: string;
  password?: string;
  status?: "active" | "disabled";
  createdBy?: string;
}

export interface SaveAdminEmailSenderInput {
  id?: string;
  key: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  providerId: string;
  isDefault?: boolean;
  status?: "active" | "disabled";
  createdBy?: string;
}

export interface SaveAdminEmailTemplateInput {
  id?: string;
  eventKey: string;
  locale?: string;
  senderId: string;
  subject: string;
  bodyHtml: string;
  status?: "draft" | "published" | "archived";
  createdBy?: string;
}

function encryptSmtpSecret(providerName: string, plainSecret: string): { ciphertext: Buffer; keyId: string } {
  const masterKey = createHash("sha256")
    .update(process.env.ENCRYPTION_KEY || process.env.CHATWOOT_SSO_SECRET || "mocter-saas-platform-secure-key-32b")
    .digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey, iv);
  cipher.setAAD(Buffer.from(`smtp_provider:${providerName}:k1`, "utf8"));
  const encrypted = Buffer.concat([cipher.update(plainSecret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: Buffer.concat([iv, tag, encrypted]),
    keyId: "k1",
  };
}

const CANONICAL_TEMPLATES_SEED = [
  {
    eventKey: "auth.verify_email",
    locale: "es",
    senderKey: "no-reply",
    subject: "Verifica tu correo electrónico en Mocter",
    bodyHtml: "<p>Hola {{user_name}},</p><p>Gracias por unirte a Mocter. Haz clic en el enlace para verificar tu correo:</p><p><a href=\"{{verify_url}}\">Verificar mi cuenta</a> (expira en {{expires_minutes}} minutos).</p>",
  },
  {
    eventKey: "auth.reset_password",
    locale: "es",
    senderKey: "no-reply",
    subject: "Restablece tu contraseña de Mocter",
    bodyHtml: "<p>Hola {{user_name}},</p><p>Recibimos una solicitud para restablecer tu contraseña:</p><p><a href=\"{{reset_url}}\">Restablecer contraseña</a> (expira en {{expires_minutes}} minutos).</p>",
  },
  {
    eventKey: "tenant.welcome",
    locale: "es",
    senderKey: "no-reply",
    subject: "¡Bienvenido a Mocter! Tu organización está lista",
    bodyHtml: "<p>Estimado/a {{owner_name}},</p><p>Felicitaciones. Tu organización <strong>{{tenant_name}}</strong> está lista para operar en Mocter.</p><p>Ingresa a tu consola administrativa aquí: <a href=\"{{login_url}}\">{{login_url}}</a>.</p>",
  },
  {
    eventKey: "billing.payment_succeeded",
    locale: "es",
    senderKey: "billing",
    subject: "Pago confirmado · Plan {{plan_name}}",
    bodyHtml: "<p>Hola {{tenant_name}},</p><p>Tu pago de {{amount}} {{currency}} ha sido confirmado. Tu suscripción está activa hasta el {{period_end}}.</p>",
  },
  {
    eventKey: "billing.payment_failed",
    locale: "es",
    senderKey: "billing",
    subject: "Problema con tu pago en Mocter",
    bodyHtml: "<p>Hola {{tenant_name}},</p><p>No hemos podido procesar tu pago de {{amount}} para el plan {{plan_name}}.</p><p>Por favor reintenta en: <a href=\"{{retry_url}}\">{{retry_url}}</a>.</p>",
  },
  {
    eventKey: "billing.renewal",
    locale: "es",
    senderKey: "billing",
    subject: "Aviso de próxima renovación · Plan {{plan_name}}",
    bodyHtml: "<p>Hola {{tenant_name}},</p><p>Te informamos que el próximo {{renewal_date}} se renovará tu suscripción por {{amount}} {{currency}}.</p>",
  },
  {
    eventKey: "referral.registered",
    locale: "es",
    senderKey: "referidos",
    subject: "¡Un nuevo usuario se registró con tu enlace de referidos!",
    bodyHtml: "<p>Hola {{referrer_name}},</p><p><strong>{{referred_name}}</strong> se ha registrado con tu enlace de referidos. Tu beneficio acumulado es: {{reward_summary}}.</p>",
  },
  {
    eventKey: "community.join_accepted",
    locale: "es",
    senderKey: "comunidad",
    subject: "Solicitud aceptada en {{community_name}}",
    bodyHtml: "<p>Hola {{user_name}},</p><p>Tu solicitud para unirte a <strong>{{community_name}}</strong> ha sido aceptada.</p><p><a href=\"{{community_url}}\">Ingresar a la comunidad</a></p>",
  },
  {
    eventKey: "community.digest",
    locale: "es",
    senderKey: "comunidad",
    subject: "Resumen semanal de {{community_name}}",
    bodyHtml: "<p>Hola {{user_name}},</p><p>Aquí tienes las novedades más destacadas de la semana en {{community_name}}.</p>",
  },
  {
    eventKey: "landing.lead_received",
    locale: "es",
    senderKey: "soporte",
    subject: "Nuevo prospecto recibido desde la landing: {{lead_name}}",
    bodyHtml: "<p>Nuevo contacto recibido:</p><ul><li>Nombre: {{lead_name}}</li><li>Correo: {{lead_email}}</li><li>Teléfono: {{lead_phone}}</li></ul><p>Mensaje: {{message}}</p>",
  },
];

/**
 * Consulta la configuración real de pasarela SMTP, remitentes y plantillas transaccionales de Mocter (NTF-001).
 * Si las tablas están vacías, se inicializan con la pasarela institucional y remitentes oficiales en PostgreSQL.
 */
export async function fetchAdminEmailSettings(): Promise<AdminEmailSettingsDto> {
  const db = getDb();

  try {
    let providersList = await db.select().from(emailProviderConfigs);
    let sendersList = await db.select().from(emailSenders);
    let eventsList = await db.select().from(emailEvents);
    let templatesList = await db.select().from(emailTemplates);

    // 1. Inicialización idempotente de Proveedor SMTP si no existe
    if (providersList.length === 0) {
      const { ciphertext, keyId } = encryptSmtpSecret(
        "Pasarela SMTP Hostinger Mocter",
        process.env.SMTP_PASSWORD || "MocterSmtpSecret2026!"
      );
      const [newProv] = await db
        .insert(emailProviderConfigs)
        .values({
          name: "Pasarela SMTP Hostinger Mocter",
          driver: "smtp",
          host: process.env.SMTP_HOST || "smtp.hostinger.com",
          port: Number(process.env.SMTP_PORT) || 587,
          secure: false,
          username: process.env.SMTP_USER || "soporte@mocter.co",
          passwordCiphertext: ciphertext,
          keyId,
          status: "active",
          createdBy: "platform_owner",
          updatedBy: "platform_owner",
        })
        .returning();
      providersList = [newProv];
    }

    const defaultProvider = providersList[0];

    // 2. Inicialización idempotente de Remitentes Canónicos vinculados al proveedor
    if (sendersList.length === 0 && defaultProvider) {
      for (const s of CANONICAL_EMAIL_SENDERS) {
        await db.insert(emailSenders).values({
          key: s.key.toLowerCase(),
          fromName: s.fromName,
          fromEmail: s.fromEmail.toLowerCase(),
          replyTo: s.replyTo,
          providerId: defaultProvider.id,
          isDefault: s.isDefault,
          status: "active",
          createdBy: "platform_owner",
          updatedBy: "platform_owner",
        });
      }
      sendersList = await db.select().from(emailSenders);
    }

    // 3. Inicialización idempotente de Eventos Transaccionales del Sistema
    if (eventsList.length === 0) {
      for (const ev of CANONICAL_EMAIL_EVENTS) {
        await db.insert(emailEvents).values({
          key: ev.key.toLowerCase(),
          category: ev.category,
          description: ev.description,
          variablesSchema: [...ev.variablesSchema],
          defaultSenderKey: ev.defaultSenderKey,
          isEnabled: ev.isEnabled,
          isSystem: ev.isSystem,
          createdBy: "platform_owner",
          updatedBy: "platform_owner",
        });
      }
      eventsList = await db.select().from(emailEvents);
    }

    // 4. Inicialización idempotente de Plantillas Vinculadas a Remitente y Evento
    if (templatesList.length === 0 && sendersList.length > 0) {
      const senderKeyMap = new Map(sendersList.map((s) => [s.key, s.id]));
      const defaultSenderId = sendersList.find((s) => s.isDefault)?.id || sendersList[0].id;

      for (const t of CANONICAL_TEMPLATES_SEED) {
        const targetSenderId = senderKeyMap.get(t.senderKey) || defaultSenderId;
        await db.insert(emailTemplates).values({
          eventKey: t.eventKey,
          locale: t.locale,
          senderId: targetSenderId,
          subject: t.subject,
          bodyJson: { type: "doc", content: [{ type: "paragraph", text: t.bodyHtml }] },
          bodyHtml: t.bodyHtml,
          version: 1,
          status: "published",
          isLocked: t.eventKey.startsWith("auth."),
          publishedAt: new Date(),
          createdBy: "platform_owner",
          updatedBy: "platform_owner",
        });
      }
      templatesList = await db.select().from(emailTemplates);
    }

    // Re-consultar ordenado para la respuesta
    const refreshedSenders = await db
      .select()
      .from(emailSenders)
      .orderBy(desc(emailSenders.isDefault), asc(emailSenders.key));

    const refreshedEvents = await db
      .select()
      .from(emailEvents)
      .orderBy(asc(emailEvents.category), asc(emailEvents.key));

    const refreshedTemplates = await db
      .select()
      .from(emailTemplates)
      .orderBy(asc(emailTemplates.eventKey), desc(emailTemplates.version));

    const providerMap = new Map(providersList.map((p) => [p.id, p.name]));
    const senderMap = new Map(
      refreshedSenders.map((s) => [s.id, { name: s.fromName, email: s.fromEmail }])
    );

    const activeProvider = providersList[0] || null;

    return {
      provider: activeProvider
        ? {
            id: activeProvider.id,
            name: activeProvider.name,
            driver: activeProvider.driver,
            host: activeProvider.host,
            port: activeProvider.port,
            secure: activeProvider.secure,
            username: activeProvider.username,
            hasPassword: Boolean(activeProvider.passwordCiphertext),
            maskedSecret: "••••••••",
            status: activeProvider.status,
          }
        : null,
      senders: refreshedSenders.map((s) => ({
        id: s.id,
        key: s.key,
        fromName: s.fromName,
        fromEmail: s.fromEmail,
        replyTo: s.replyTo,
        providerId: s.providerId,
        providerName: providerMap.get(s.providerId) || "Pasarela SMTP",
        isDefault: s.isDefault,
        status: s.status,
      })),
      events: refreshedEvents.map((ev) => ({
        id: ev.id,
        key: ev.key,
        category: ev.category,
        description: ev.description,
        variablesSchema: Array.isArray(ev.variablesSchema) ? ev.variablesSchema : [],
        defaultSenderKey: ev.defaultSenderKey,
        isEnabled: ev.isEnabled,
        isSystem: ev.isSystem,
      })),
      templates: refreshedTemplates.map((t) => {
        const sInfo = t.senderId ? senderMap.get(t.senderId) : undefined;
        return {
          id: t.id,
          eventKey: t.eventKey,
          locale: t.locale,
          senderId: t.senderId,
          senderName: sInfo?.name,
          senderEmail: sInfo?.email,
          subject: t.subject,
          bodyHtml: t.bodyHtml,
          version: t.version,
          status: t.status,
          isLocked: t.isLocked,
        };
      }),
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[fetchAdminEmailSettings Failed] ${msg}`, error);
    return {
      provider: null,
      senders: [],
      events: [],
      templates: [],
    };
  }
}

/**
 * Guarda o actualiza un servidor de envío SMTP en PostgreSQL (`admin.email_provider_configs`).
 */
export async function saveAdminSmtpProvider(
  input: SaveAdminSmtpProviderInput
): Promise<Result<{ id: string }, string>> {
  try {
    const db = getDb();
    const actor = input.createdBy || "platform_owner";

    if (!input.name || !input.host || !input.port) {
      return err("Nombre, Host y Puerto del servidor SMTP son obligatorios");
    }

    let passwordCiphertext: Buffer | null = null;
    let keyId: string | null = null;

    if (input.password && input.password.trim() !== "" && input.password !== "••••••••") {
      const encrypted = encryptSmtpSecret(input.name, input.password);
      passwordCiphertext = encrypted.ciphertext;
      keyId = encrypted.keyId;
    }

    if (input.id) {
      const updateData: Record<string, unknown> = {
        name: input.name,
        host: input.host,
        port: input.port,
        secure: Boolean(input.secure),
        username: input.username || null,
        status: input.status || "active",
        updatedBy: actor,
        updatedAt: new Date(),
      };

      if (passwordCiphertext && keyId) {
        updateData.passwordCiphertext = passwordCiphertext;
        updateData.keyId = keyId;
      }

      await db
        .update(emailProviderConfigs)
        .set(updateData)
        .where(eq(emailProviderConfigs.id, input.id));

      return ok({ id: input.id });
    } else {
      const [created] = await db
        .insert(emailProviderConfigs)
        .values({
          name: input.name,
          driver: "smtp",
          host: input.host,
          port: input.port,
          secure: Boolean(input.secure),
          username: input.username || null,
          passwordCiphertext,
          keyId,
          status: input.status || "active",
          createdBy: actor,
          updatedBy: actor,
        })
        .returning();

      return ok({ id: created.id });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[saveAdminSmtpProvider Failed] ${msg}`, error);
    return err(`Error al guardar proveedor SMTP: ${msg}`);
  }
}

/**
 * Guarda o actualiza una dirección remitente institucional (`admin.email_senders`).
 */
export async function saveAdminEmailSender(
  input: SaveAdminEmailSenderInput
): Promise<Result<{ id: string }, string>> {
  try {
    const db = getDb();
    const actor = input.createdBy || "platform_owner";

    if (!input.key || !input.fromName || !input.fromEmail || !input.providerId) {
      return err("Identificador, Nombre, Correo y Servidor SMTP son obligatorios");
    }

    const cleanKey = input.key.trim().toLowerCase();
    const cleanEmail = input.fromEmail.trim().toLowerCase();

    // Si se marca como predeterminado, desmarcar los anteriores para respetar índice único
    if (input.isDefault) {
      await db
        .update(emailSenders)
        .set({ isDefault: false, updatedBy: actor, updatedAt: new Date() })
        .where(eq(emailSenders.isDefault, true));
    }

    if (input.id) {
      await db
        .update(emailSenders)
        .set({
          key: cleanKey,
          fromName: input.fromName,
          fromEmail: cleanEmail,
          replyTo: input.replyTo || null,
          providerId: input.providerId,
          isDefault: Boolean(input.isDefault),
          status: input.status || "active",
          updatedBy: actor,
          updatedAt: new Date(),
        })
        .where(eq(emailSenders.id, input.id));

      return ok({ id: input.id });
    } else {
      const [created] = await db
        .insert(emailSenders)
        .values({
          key: cleanKey,
          fromName: input.fromName,
          fromEmail: cleanEmail,
          replyTo: input.replyTo || null,
          providerId: input.providerId,
          isDefault: Boolean(input.isDefault),
          status: input.status || "active",
          createdBy: actor,
          updatedBy: actor,
        })
        .returning();

      return ok({ id: created.id });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[saveAdminEmailSender Failed] ${msg}`, error);
    return err(`Error al guardar remitente: ${msg}`);
  }
}

/**
 * Guarda o actualiza una plantilla de correo vinculada a un remitente y a un evento del sistema (`admin.email_templates`).
 * REGLA ESTRICTA: El remitente y el evento funcional son obligatorios.
 */
export async function saveAdminEmailTemplate(
  input: SaveAdminEmailTemplateInput
): Promise<Result<{ id: string }, string>> {
  try {
    const db = getDb();
    const actor = input.createdBy || "platform_owner";

    if (!input.eventKey || !input.senderId || !input.subject || !input.bodyHtml) {
      return err("El Evento de funcionalidad, el Remitente vinculado, el Asunto y el Cuerpo HTML son obligatorios.");
    }

    // Validar que el remitente exista en admin.email_senders
    const [senderExists] = await db
      .select({ id: emailSenders.id })
      .from(emailSenders)
      .where(eq(emailSenders.id, input.senderId))
      .limit(1);

    if (!senderExists) {
      return err("El remitente seleccionado no existe en el catálogo de direcciones registradas.");
    }

    // Validar que el evento exista en admin.email_events
    const [eventExists] = await db
      .select({ key: emailEvents.key })
      .from(emailEvents)
      .where(eq(emailEvents.key, input.eventKey))
      .limit(1);

    if (!eventExists) {
      return err("El evento de funcionalidad seleccionado no existe en el catálogo de eventos.");
    }

    const locale = input.locale || "es";
    const status = input.status || "published";

    if (input.id) {
      await db
        .update(emailTemplates)
        .set({
          eventKey: input.eventKey,
          locale,
          senderId: input.senderId,
          subject: input.subject,
          bodyHtml: input.bodyHtml,
          bodyJson: { type: "doc", content: [{ type: "paragraph", text: input.bodyHtml }] },
          status,
          publishedAt: status === "published" ? new Date() : null,
          updatedBy: actor,
          updatedAt: new Date(),
        })
        .where(eq(emailTemplates.id, input.id));

      return ok({ id: input.id });
    } else {
      // Determinar la última versión para la dupla (eventKey, locale)
      const existing = await db
        .select({ version: emailTemplates.version })
        .from(emailTemplates)
        .where(and(eq(emailTemplates.eventKey, input.eventKey), eq(emailTemplates.locale, locale)))
        .orderBy(desc(emailTemplates.version))
        .limit(1);

      const nextVersion = (existing[0]?.version ?? 0) + 1;

      // Si la nueva versión se publica, despublicar las versiones anteriores
      if (status === "published") {
        await db
          .update(emailTemplates)
          .set({ status: "archived", updatedBy: actor, updatedAt: new Date() })
          .where(and(eq(emailTemplates.eventKey, input.eventKey), eq(emailTemplates.locale, locale), eq(emailTemplates.status, "published")));
      }

      const [created] = await db
        .insert(emailTemplates)
        .values({
          eventKey: input.eventKey,
          locale,
          senderId: input.senderId,
          subject: input.subject,
          bodyJson: { type: "doc", content: [{ type: "paragraph", text: input.bodyHtml }] },
          bodyHtml: input.bodyHtml,
          version: nextVersion,
          status,
          isLocked: input.eventKey.startsWith("auth."),
          publishedAt: status === "published" ? new Date() : null,
          createdBy: actor,
          updatedBy: actor,
        })
        .returning();

      return ok({ id: created.id });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[saveAdminEmailTemplate Failed] ${msg}`, error);
    return err(`Error al guardar plantilla de correo: ${msg}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DIRECTORIO Y GESTIÓN DE INQUILINOS Y COMERCIOS (ADM-001, DAT-001)
// ─────────────────────────────────────────────────────────────────────────────

export interface AdminTenantItemDto {
  id: string;
  slug: string;
  displayName: string;
  contactEmail: string;
  phone: string | null;
  lifecycleStatus: "alta" | "activo" | "suspendido" | "baja";
  locale: string;
  currency: string;
  planId: string;
  planCode: string;
  planName: string;
  cellId: string;
  cellCode: string;
  cellTier: string;
  ownerUserId: string;
  ownerName: string | null;
  ownerEmail: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminTenantsOverviewDto {
  kpis: {
    totalTenants: number;
    activeTenants: number;
    suspendedTenants: number;
    onboardingTenants: number;
  };
  tenants: AdminTenantItemDto[];
  availablePlans: Array<{ id: string; code: string; name: string }>;
  availableCells: Array<{ id: string; code: string; currentClients: number; maxClients: number }>;
}

export interface CreateAdminTenantInput {
  displayName: string;
  slug: string;
  ownerEmail: string;
  ownerDisplayName?: string;
  planId: string;
  cellId?: string;
  phone?: string;
  locale?: "es" | "en";
  actorUserId?: string;
}

export interface UpdateAdminTenantLifecycleInput {
  clientId: string;
  lifecycleStatus: "activo" | "suspendido" | "baja";
  actorUserId?: string;
}

/**
 * Consulta el directorio integral de inquilinos y comercios registrados en el plano de control (ADM-001, DAT-001).
 * Correlaciona cliente, propietario, plan asignado y enrutamiento a la célula PostgreSQL.
 */
export async function fetchAdminTenantsOverview(): Promise<AdminTenantsOverviewDto> {
  const db = getDb();
  try {
    const rows = await db
      .select({
        id: clients.id,
        slug: clients.slug,
        displayName: clients.displayName,
        contactEmail: clients.contactEmail,
        phone: clients.phone,
        lifecycleStatus: clients.lifecycleStatus,
        locale: clients.locale,
        currency: clients.currency,
        planId: clients.planId,
        planCode: plans.code,
        planNameJson: plans.name,
        cellId: clientRouting.cellId,
        cellCode: cells.code,
        cellTier: cells.tier,
        ownerUserId: users.id,
        ownerDisplayName: users.displayName,
        ownerEmail: users.email,
        createdAt: clients.createdAt,
        updatedAt: clients.updatedAt,
      })
      .from(clients)
      .innerJoin(users, eq(clients.ownerUserId, users.id))
      .innerJoin(plans, eq(clients.planId, plans.id))
      .leftJoin(clientRouting, eq(clients.id, clientRouting.clientId))
      .leftJoin(cells, eq(clientRouting.cellId, cells.id))
      .orderBy(desc(clients.createdAt));

    let activeTenants = 0;
    let suspendedTenants = 0;
    let onboardingTenants = 0;

    const tenants: AdminTenantItemDto[] = rows.map((r) => {
      const status = (r.lifecycleStatus || "activo") as "alta" | "activo" | "suspendido" | "baja";
      if (status === "activo") activeTenants++;
      else if (status === "suspendido") suspendedTenants++;
      else if (status === "alta") onboardingTenants++;

      const nameObj = r.planNameJson as { es?: string; en?: string } | null;
      const planName = nameObj?.es || r.planCode;

      return {
        id: r.id,
        slug: r.slug,
        displayName: r.displayName,
        contactEmail: r.contactEmail,
        phone: r.phone,
        lifecycleStatus: status,
        locale: r.locale,
        currency: r.currency,
        planId: r.planId,
        planCode: r.planCode,
        planName,
        cellId: r.cellId || "",
        cellCode: r.cellCode || "cell-default",
        cellTier: r.cellTier || "standard",
        ownerUserId: r.ownerUserId,
        ownerName: r.ownerDisplayName,
        ownerEmail: r.ownerEmail,
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : new Date().toISOString(),
      };
    });

    const activePlans = await db
      .select({ id: plans.id, code: plans.code, nameJson: plans.name })
      .from(plans)
      .where(eq(plans.status, "active"))
      .orderBy(asc(plans.code));

    const activeCells = await db
      .select({
        id: cells.id,
        code: cells.code,
        currentClients: cells.currentClients,
        maxClients: cells.maxClients,
      })
      .from(cells)
      .where(eq(cells.status, "active"))
      .orderBy(asc(cells.code));

    return {
      kpis: {
        totalTenants: tenants.length,
        activeTenants,
        suspendedTenants,
        onboardingTenants,
      },
      tenants,
      availablePlans: activePlans.map((p) => {
        const pObj = p.nameJson as { es?: string; en?: string } | null;
        return { id: p.id, code: p.code, name: pObj?.es || p.code };
      }),
      availableCells: activeCells,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[fetchAdminTenantsOverview Failed] ${msg}`, error);
    return {
      kpis: { totalTenants: 0, activeTenants: 0, suspendedTenants: 0, onboardingTenants: 0 },
      tenants: [],
      availablePlans: [],
      availableCells: [],
    };
  }
}

/**
 * Aprovisiona manualmente un nuevo comercio/inquilino coordinando usuario dueño, celda y plan (ADM-001 §6.3, T-06).
 */
export async function createAdminTenant(input: CreateAdminTenantInput): Promise<Result<AdminTenantItemDto>> {
  const db = getDb();
  const actor = input.actorUserId || "01a19874-1077-744c-8514-d4c990cd7259";

  const slug = input.slug.trim().toLowerCase();
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return err("El identificador (slug) debe contener solo minúsculas y guiones sin espacios.", "INVALID_SLUG");
  }

  const ownerEmail = input.ownerEmail.trim().toLowerCase();
  if (!ownerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
    return err("El correo del propietario debe ser un email válido.", "INVALID_EMAIL");
  }

  try {
    // 1. Verificar unicidad de slug
    const existingClient = await db.select({ id: clients.id }).from(clients).where(eq(clients.slug, slug)).limit(1);
    if (existingClient.length > 0) {
      return err("El slug ingresado ya está en uso por otro comercio.", "SLUG_ALREADY_TAKEN");
    }

    // 2. Verificar o crear el usuario dueño en admin.users
    let ownerId: string;
    let ownerDisplayName = input.ownerDisplayName || input.displayName;
    const existingUser = await db.select().from(users).where(eq(users.email, ownerEmail)).limit(1);

    if (existingUser.length > 0) {
      const u = existingUser[0];
      if (u.activeClientId) {
        const liveOwned = await db
          .select({ id: clients.id, status: clients.lifecycleStatus })
          .from(clients)
          .where(and(eq(clients.ownerUserId, u.id), sql`lifecycle_status <> 'baja'`))
          .limit(1);
        if (liveOwned.length > 0) {
          return err("El propietario especificado ya posee un comercio activo o en alta.", "OWNER_ALREADY_OWNS_LIVE_TENANT");
        }
      }
      ownerId = u.id;
      ownerDisplayName = u.displayName || ownerDisplayName;
    } else {
      const [newUser] = await db
        .insert(users)
        .values({
          email: ownerEmail,
          displayName: ownerDisplayName,
          status: "active",
          emailVerifiedAt: new Date(),
          createdBy: actor,
          updatedBy: actor,
        })
        .returning();
      ownerId = newUser.id;
    }

    // 3. Resolver plan
    const planRows = await db.select().from(plans).where(eq(plans.id, input.planId)).limit(1);
    if (planRows.length === 0) {
      return err("El plan seleccionado no existe en el catálogo.", "PLAN_NOT_FOUND");
    }
    const selectedPlan = planRows[0];

    // 4. Resolver celda
    let assignedCellId = input.cellId;
    if (!assignedCellId) {
      const availableCell = await db
        .select()
        .from(cells)
        .where(and(eq(cells.status, "active"), sql`${cells.currentClients} < ${cells.maxClients}`))
        .orderBy(asc(cells.currentClients))
        .limit(1);
      if (availableCell.length === 0) {
        return err("No hay celdas de base de datos activas con capacidad disponible.", "NO_AVAILABLE_CELL");
      }
      assignedCellId = availableCell[0].id;
    }

    const assignedCell = (await db.select().from(cells).where(eq(cells.id, assignedCellId)).limit(1))[0];

    // 5. Insertar cliente
    const [newClient] = await db
      .insert(clients)
      .values({
        displayName: input.displayName.trim(),
        slug,
        contactEmail: ownerEmail,
        phone: input.phone?.trim() || null,
        ownerUserId: ownerId,
        planId: selectedPlan.id,
        lifecycleStatus: "activo",
        locale: input.locale || "es",
        currency: "COP",
        createdBy: actor,
        updatedBy: actor,
      })
      .returning();

    // 6. Actualizar active_client_id del dueño
    await db
      .update(users)
      .set({ activeClientId: newClient.id, updatedBy: actor, updatedAt: new Date() })
      .where(eq(users.id, ownerId));

    // 7. Insertar enrutamiento en admin.client_routing
    await db
      .insert(clientRouting)
      .values({
        clientId: newClient.id,
        cellId: assignedCell.id,
        routingStatus: "active",
        routingVersion: 1,
        createdBy: actor,
        updatedBy: actor,
      });

    // 8. Incrementar current_clients en la celda
    await db
      .update(cells)
      .set({
        currentClients: sql`${cells.currentClients} + 1`,
        updatedBy: actor,
        updatedAt: new Date(),
      })
      .where(eq(cells.id, assignedCell.id));

    // 9. Registrar historial de asignación de plan en admin.client_plans
    await db
      .insert(clientPlans)
      .values({
        clientId: newClient.id,
        planId: selectedPlan.id,
        source: "manual",
        assignedByUserId: actor,
        createdBy: actor,
        updatedBy: actor,
      });

    const pObj = selectedPlan.name as { es?: string; en?: string } | null;
    const planName = pObj?.es || selectedPlan.code;

    appLogger.info("[createAdminTenant] Inquilino aprovisionado con éxito", {
      clientId: newClient.id,
      slug: newClient.slug,
      cellId: assignedCell.id,
      ownerEmail,
    });

    return ok({
      id: newClient.id,
      slug: newClient.slug,
      displayName: newClient.displayName,
      contactEmail: newClient.contactEmail,
      phone: newClient.phone,
      lifecycleStatus: "activo",
      locale: newClient.locale,
      currency: newClient.currency,
      planId: selectedPlan.id,
      planCode: selectedPlan.code,
      planName,
      cellId: assignedCell.id,
      cellCode: assignedCell.code,
      cellTier: assignedCell.tier,
      ownerUserId: ownerId,
      ownerName: ownerDisplayName,
      ownerEmail,
      createdAt: newClient.createdAt ? new Date(newClient.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: newClient.updatedAt ? new Date(newClient.updatedAt).toISOString() : new Date().toISOString(),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[createAdminTenant Failed] ${msg}`, error);
    return err(`Error al registrar el inquilino: ${msg}`);
  }
}

/**
 * Actualiza el estado de ciclo de vida de un inquilino (activo, suspendido o baja) (ADM-001 T-06).
 */
export async function updateAdminTenantLifecycle(
  input: UpdateAdminTenantLifecycleInput,
): Promise<Result<{ success: boolean; lifecycleStatus: string }>> {
  const db = getDb();
  const actor = input.actorUserId || "01a19874-1077-744c-8514-d4c990cd7259";

  try {
    const existing = await db
      .select({ id: clients.id, ownerUserId: clients.ownerUserId })
      .from(clients)
      .where(eq(clients.id, input.clientId))
      .limit(1);

    if (existing.length === 0) {
      return err("El inquilino especificado no existe.", "TENANT_NOT_FOUND");
    }

    await db
      .update(clients)
      .set({
        lifecycleStatus: input.lifecycleStatus,
        updatedBy: actor,
        updatedAt: new Date(),
      })
      .where(eq(clients.id, input.clientId));

    // Si se da de baja, desasociar active_client_id
    if (input.lifecycleStatus === "baja") {
      await db
        .update(users)
        .set({ activeClientId: null, updatedBy: actor, updatedAt: new Date() })
        .where(eq(users.id, existing[0].ownerUserId));
    }

    appLogger.info("[updateAdminTenantLifecycle] Estado de ciclo de vida actualizado", {
      clientId: input.clientId,
      status: input.lifecycleStatus,
      actor,
    });

    return ok({ success: true, lifecycleStatus: input.lifecycleStatus });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[updateAdminTenantLifecycle Failed] ${msg}`, error);
    return err(`Error al actualizar estado del inquilino: ${msg}`);
  }
}
