import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/client";
import { clients } from "../db/schemas/admin/clients";
import { emailEvents, emailSenders } from "../db/schemas/admin/notifications";
import { platformUserRoles } from "../db/schemas/admin/chatwoot-media-onboarding";
import {
  tenantInAppNotifications,
  tenantNotificationPreferences,
} from "../db/schemas/admin/notifications";
import { users } from "../db/schemas/admin/users";
import { err, ok, type Result } from "../types/result";
import { appLogger } from "../utils/logger";
import { env } from "../utils/env";
import {
  sendSystemNotificationEmail,
  type SendSystemNotificationEmailInput,
  type SendSystemNotificationEmailResult,
} from "./admin-dashboard.service";
import {
  CANONICAL_EMAIL_EVENTS,
  escapeHtmlVariable,
} from "./notifications-and-leads.service";

/**
 * Eventos de competencia directa del comercio visibles y configurables en `/workspace/notifications` (`SPEC-14`).
 * Todos los demás eventos corresponden a la operación de la SaaS y no se muestran en preferencias del comercio.
 */
export const TENANT_COMPETENCE_EVENT_KEYS = new Set<string>([
  "community.digest",
  "community.join_accepted",
  "referral.registered",
  "tenant.inventory.low_stock",
]);

/**
 * Severidades soportadas en la bandeja in-app del comercio (`admin.tenant_in_app_notifications`).
 */
export type TenantNotificationSeverity = "info" | "warning" | "success" | "critical";

/**
 * Carga opcional para generar una notificación in-app simultáneamente al despacho del evento.
 */
export interface TenantInAppPayload {
  title: string;
  body: string;
  severity?: TenantNotificationSeverity;
  actionUrl?: string | null;
}

/**
 * Parámetros para despachar una notificación hacia un comercio (`SPEC-14`).
 */
export interface DispatchTenantNotificationInput {
  clientId: string;
  eventKey: string;
  locale?: "es" | "en";
  variables: Record<string, string | number>;
  recipientOverride?: string | null;
  idempotencyKey?: string;
  actorUserId?: string;
  inAppPayload?: TenantInAppPayload;
}

/**
 * Parámetros para despachar una notificación administrativa hacia operadores SaaS (`SPEC-14`).
 */
export interface DispatchPlatformAdminNotificationInput {
  eventKey: string;
  locale?: "es" | "en";
  variables: Record<string, string | number>;
  idempotencyKey?: string;
  actorUserId?: string;
}

/**
 * Resultado del despacho unificado de una notificación al comercio.
 */
export interface DispatchTenantNotificationResult {
  dispatched: boolean;
  skippedByAdmin: boolean;
  emailDispatched: boolean;
  emailDeliveryId?: string;
  emailStatus?: "sent" | "queued" | "failed" | "skipped";
  inAppCreated: boolean;
  inAppNotificationId?: string;
}

/**
 * Metadatos de un evento de notificación consultados desde catálogo.
 */
export interface NotificationEventMetadata {
  key: string;
  category: string;
  description: string;
  isEnabled: boolean;
  isSystem: boolean;
  tenantConfigurable: boolean;
  variablesSchema: string[];
}

/**
 * Datos básicos del comercio para resolver destinatario e idioma de notificaciones.
 */
export interface TenantNotificationClientInfo {
  clientId: string;
  displayName: string;
  commercialEmail: string | null;
  contactEmail: string;
  locale: "es" | "en";
}

/**
 * Preferencia almacenada para un par `(client_id, event_key)`.
 */
export interface StoredTenantNotificationPreference {
  eventKey: string;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  customRecipientEmail: string | null;
  updatedAt: Date;
}

/**
 * DTO de notificación in-app en la bandeja del comercio.
 */
export interface TenantInAppNotificationDto {
  id: string;
  clientId: string;
  eventKey: string;
  title: string;
  body: string;
  severity: TenantNotificationSeverity;
  actionUrl: string | null;
  readAt: string | null;
  createdAt: string;
}

/**
 * DTO combinado de evento + preferencia efectiva del comercio para `/workspace/notifications`.
 */
export interface TenantNotificationPreferenceDto {
  eventKey: string;
  category: string;
  description: string;
  tenantConfigurable: boolean;
  isEnabledByPlatform: boolean;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  customRecipientEmail: string | null;
  updatedAt: string | null;
}

/**
 * DTO de respuesta para `GET /api/tenant/notifications`.
 */
export interface TenantNotificationsResponseDto {
  unreadCount: number;
  notifications: TenantInAppNotificationDto[];
  total: number;
  page: number;
  limit: number;
  canManagePreferences: boolean;
  preferences: TenantNotificationPreferenceDto[];
}

/**
 * Entrada validada para actualizar preferencias de notificación del comercio.
 */
export interface UpsertTenantNotificationPreferenceItem {
  eventKey: string;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  customRecipientEmail?: string | null;
}

/**
 * Contrato de repositorio para persistencia de preferencias, bandeja in-app y despacho (`SPEC-14`).
 */
export interface INotificationDispatcherRepository {
  getEventMetadata(eventKey: string): Promise<NotificationEventMetadata | null>;
  listAllEventsMetadata(): Promise<NotificationEventMetadata[]>;
  getClientRecipientInfo(clientId: string): Promise<TenantNotificationClientInfo | null>;
  getTenantPreference(
    clientId: string,
    eventKey: string,
  ): Promise<StoredTenantNotificationPreference | null>;
  listTenantPreferences(clientId: string): Promise<StoredTenantNotificationPreference[]>;
  upsertTenantPreferences(
    clientId: string,
    actorUserId: string,
    items: UpsertTenantNotificationPreferenceItem[],
  ): Promise<StoredTenantNotificationPreference[]>;
  createInAppNotification(input: {
    clientId: string;
    eventKey: string;
    title: string;
    body: string;
    severity: TenantNotificationSeverity;
    actionUrl: string | null;
  }): Promise<TenantInAppNotificationDto>;
  listInAppNotifications(
    clientId: string,
    options: { unreadOnly: boolean; page: number; limit: number },
  ): Promise<{ items: TenantInAppNotificationDto[]; total: number; unreadCount: number }>;
  getUnreadCount(clientId: string): Promise<number>;
  markNotificationRead(clientId: string, notificationId: string): Promise<boolean>;
  markAllNotificationsRead(clientId: string): Promise<number>;
  listActivePlatformAdminEmails(): Promise<string[]>;
  sendEmail(input: SendSystemNotificationEmailInput): Promise<SendSystemNotificationEmailResult>;
}

const preferenceItemSchema = z.object({
  eventKey: z.string().trim().min(1).max(120),
  emailEnabled: z.boolean(),
  inAppEnabled: z.boolean(),
  customRecipientEmail: z
    .union([z.string().trim().email("Correo destinatario inválido."), z.literal(""), z.null()])
    .optional(),
});

export const updateTenantPreferencesPayloadSchema = z.object({
  items: z.array(preferenceItemSchema).min(1, "Debes enviar al menos una preferencia."),
});

function buildCanonicalEventMetadata(
  ev: (typeof CANONICAL_EMAIL_EVENTS)[number],
): NotificationEventMetadata {
  return {
    key: ev.key,
    category: ev.category,
    description: ev.description,
    isEnabled: ev.isEnabled,
    isSystem: ev.isSystem,
    tenantConfigurable: ev.tenantConfigurable,
    variablesSchema: [...ev.variablesSchema],
  };
}

function normalizeSeverity(raw: string): TenantNotificationSeverity {
  if (raw === "warning" || raw === "success" || raw === "critical") {
    return raw;
  }
  return "info";
}

/**
 * Verifica si un evento pertenece al catálogo de competencia directa del comercio en `/workspace/notifications`.
 */
export function isTenantVisibleNotificationEvent(eventKey: string): boolean {
  const normalized = eventKey.trim().toLowerCase();
  return TENANT_COMPETENCE_EVENT_KEYS.has(normalized);
}

/**
 * Implementación Drizzle/PostgreSQL del repositorio de notificaciones (`SPEC-14`).
 */
export class DrizzleNotificationDispatcherRepository
  implements INotificationDispatcherRepository
{
  async getEventMetadata(eventKey: string): Promise<NotificationEventMetadata | null> {
    const db = getDb();
    const normalized = eventKey.trim().toLowerCase();
    const [row] = await db
      .select({
        key: emailEvents.key,
        category: emailEvents.category,
        description: emailEvents.description,
        isEnabled: emailEvents.isEnabled,
        isSystem: emailEvents.isSystem,
        tenantConfigurable: emailEvents.tenantConfigurable,
        variablesSchema: emailEvents.variablesSchema,
      })
      .from(emailEvents)
      .where(eq(emailEvents.key, normalized))
      .limit(1);

    if (row) {
      return {
        key: row.key,
        category: row.category,
        description: row.description,
        isEnabled: row.isEnabled,
        isSystem: row.isSystem,
        tenantConfigurable: row.tenantConfigurable,
        variablesSchema: Array.isArray(row.variablesSchema) ? row.variablesSchema : [],
      };
    }

    const canonical = CANONICAL_EMAIL_EVENTS.find((ev) => ev.key === normalized);
    return canonical ? buildCanonicalEventMetadata(canonical) : null;
  }

  async listAllEventsMetadata(): Promise<NotificationEventMetadata[]> {
    const db = getDb();
    const rows = await db
      .select({
        key: emailEvents.key,
        category: emailEvents.category,
        description: emailEvents.description,
        isEnabled: emailEvents.isEnabled,
        isSystem: emailEvents.isSystem,
        tenantConfigurable: emailEvents.tenantConfigurable,
        variablesSchema: emailEvents.variablesSchema,
      })
      .from(emailEvents);

    const byKey = new Map<string, NotificationEventMetadata>();
    for (const row of rows) {
      byKey.set(row.key.toLowerCase(), {
        key: row.key,
        category: row.category,
        description: row.description,
        isEnabled: row.isEnabled,
        isSystem: row.isSystem,
        tenantConfigurable: row.tenantConfigurable,
        variablesSchema: Array.isArray(row.variablesSchema) ? row.variablesSchema : [],
      });
    }

    // Incluir cualquier evento canónico aún no sembrado en BD
    for (const canonical of CANONICAL_EMAIL_EVENTS) {
      if (!byKey.has(canonical.key)) {
        byKey.set(canonical.key, buildCanonicalEventMetadata(canonical));
      }
    }

    return Array.from(byKey.values()).sort((a, b) =>
      a.category === b.category
        ? a.key.localeCompare(b.key)
        : a.category.localeCompare(b.category),
    );
  }

  async getClientRecipientInfo(clientId: string): Promise<TenantNotificationClientInfo | null> {
    const db = getDb();
    const [row] = await db
      .select({
        id: clients.id,
        displayName: clients.displayName,
        commercialEmail: clients.commercialEmail,
        contactEmail: clients.contactEmail,
        locale: clients.locale,
      })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);

    if (!row) return null;
    return {
      clientId: row.id,
      displayName: row.displayName,
      commercialEmail: row.commercialEmail,
      contactEmail: row.contactEmail,
      locale: row.locale === "en" ? "en" : "es",
    };
  }

  async getTenantPreference(
    clientId: string,
    eventKey: string,
  ): Promise<StoredTenantNotificationPreference | null> {
    const db = getDb();
    const [row] = await db
      .select({
        eventKey: tenantNotificationPreferences.eventKey,
        emailEnabled: tenantNotificationPreferences.emailEnabled,
        inAppEnabled: tenantNotificationPreferences.inAppEnabled,
        customRecipientEmail: tenantNotificationPreferences.customRecipientEmail,
        updatedAt: tenantNotificationPreferences.updatedAt,
      })
      .from(tenantNotificationPreferences)
      .where(
        and(
          eq(tenantNotificationPreferences.clientId, clientId),
          eq(tenantNotificationPreferences.eventKey, eventKey.trim().toLowerCase()),
        ),
      )
      .limit(1);

    return row ?? null;
  }

  async listTenantPreferences(clientId: string): Promise<StoredTenantNotificationPreference[]> {
    const db = getDb();
    const rows = await db
      .select({
        eventKey: tenantNotificationPreferences.eventKey,
        emailEnabled: tenantNotificationPreferences.emailEnabled,
        inAppEnabled: tenantNotificationPreferences.inAppEnabled,
        customRecipientEmail: tenantNotificationPreferences.customRecipientEmail,
        updatedAt: tenantNotificationPreferences.updatedAt,
      })
      .from(tenantNotificationPreferences)
      .where(eq(tenantNotificationPreferences.clientId, clientId));

    return rows;
  }

  async upsertTenantPreferences(
    clientId: string,
    actorUserId: string,
    items: UpsertTenantNotificationPreferenceItem[],
  ): Promise<StoredTenantNotificationPreference[]> {
    const db = getDb();
    const now = new Date();

    // Asegurar que los eventKeys canónicos existan en admin.email_events antes de crear FK
    const existingKeys = new Set(
      (await db.select({ key: emailEvents.key }).from(emailEvents)).map((r) => r.key),
    );
    for (const item of items) {
      const normalizedKey = item.eventKey.trim().toLowerCase();
      if (!existingKeys.has(normalizedKey)) {
        const canonical = CANONICAL_EMAIL_EVENTS.find((ev) => ev.key === normalizedKey);
        if (canonical) {
          await db
            .insert(emailEvents)
            .values({
              key: canonical.key,
              category: canonical.category,
              description: canonical.description,
              variablesSchema: [...canonical.variablesSchema],
              defaultSenderKey: canonical.defaultSenderKey,
              isEnabled: canonical.isEnabled,
              isSystem: canonical.isSystem,
              tenantConfigurable: canonical.tenantConfigurable,
              createdBy: "platform_owner",
              updatedBy: "platform_owner",
            })
            .onConflictDoNothing();
          existingKeys.add(normalizedKey);
        }
      }
    }

    for (const item of items) {
      const normalizedKey = item.eventKey.trim().toLowerCase();
      const normalizedEmail = item.customRecipientEmail?.trim().toLowerCase() || null;
      await db
        .insert(tenantNotificationPreferences)
        .values({
          clientId,
          eventKey: normalizedKey,
          emailEnabled: item.emailEnabled,
          inAppEnabled: item.inAppEnabled,
          customRecipientEmail: normalizedEmail,
          createdBy: actorUserId,
          updatedBy: actorUserId,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            tenantNotificationPreferences.clientId,
            tenantNotificationPreferences.eventKey,
          ],
          set: {
            emailEnabled: item.emailEnabled,
            inAppEnabled: item.inAppEnabled,
            customRecipientEmail: normalizedEmail,
            updatedBy: actorUserId,
            updatedAt: now,
          },
        });
    }

    return this.listTenantPreferences(clientId);
  }

  async createInAppNotification(input: {
    clientId: string;
    eventKey: string;
    title: string;
    body: string;
    severity: TenantNotificationSeverity;
    actionUrl: string | null;
  }): Promise<TenantInAppNotificationDto> {
    const db = getDb();
    const [created] = await db
      .insert(tenantInAppNotifications)
      .values({
        clientId: input.clientId,
        eventKey: input.eventKey,
        title: input.title,
        body: input.body,
        severity: input.severity,
        actionUrl: input.actionUrl,
      })
      .returning();

    return {
      id: created.id,
      clientId: created.clientId,
      eventKey: created.eventKey,
      title: created.title,
      body: created.body,
      severity: normalizeSeverity(created.severity),
      actionUrl: created.actionUrl ?? null,
      readAt: created.readAt ? created.readAt.toISOString() : null,
      createdAt: created.createdAt.toISOString(),
    };
  }

  async listInAppNotifications(
    clientId: string,
    options: { unreadOnly: boolean; page: number; limit: number },
  ): Promise<{ items: TenantInAppNotificationDto[]; total: number; unreadCount: number }> {
    const db = getDb();
    const offset = (options.page - 1) * options.limit;
    const condition = options.unreadOnly
      ? and(
          eq(tenantInAppNotifications.clientId, clientId),
          isNull(tenantInAppNotifications.readAt),
        )
      : eq(tenantInAppNotifications.clientId, clientId);

    const [rows, totalRows, unreadCount] = await Promise.all([
      db
        .select()
        .from(tenantInAppNotifications)
        .where(condition)
        .orderBy(desc(tenantInAppNotifications.createdAt))
        .limit(options.limit)
        .offset(offset),
      db.select({ total: count() }).from(tenantInAppNotifications).where(condition),
      this.getUnreadCount(clientId),
    ]);

    return {
      items: rows.map((r) => ({
        id: r.id,
        clientId: r.clientId,
        eventKey: r.eventKey,
        title: r.title,
        body: r.body,
        severity: normalizeSeverity(r.severity),
        actionUrl: r.actionUrl ?? null,
        readAt: r.readAt ? r.readAt.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
      })),
      total: Number(totalRows[0]?.total ?? 0),
      unreadCount,
    };
  }

  async getUnreadCount(clientId: string): Promise<number> {
    const db = getDb();
    const [row] = await db
      .select({ total: count() })
      .from(tenantInAppNotifications)
      .where(
        and(
          eq(tenantInAppNotifications.clientId, clientId),
          isNull(tenantInAppNotifications.readAt),
        ),
      );
    return Number(row?.total ?? 0);
  }

  async markNotificationRead(clientId: string, notificationId: string): Promise<boolean> {
    const db = getDb();
    const now = new Date();
    const updated = await db
      .update(tenantInAppNotifications)
      .set({ readAt: now })
      .where(
        and(
          eq(tenantInAppNotifications.id, notificationId),
          eq(tenantInAppNotifications.clientId, clientId),
        ),
      )
      .returning({ id: tenantInAppNotifications.id });

    return updated.length > 0;
  }

  async markAllNotificationsRead(clientId: string): Promise<number> {
    const db = getDb();
    const now = new Date();
    const updated = await db
      .update(tenantInAppNotifications)
      .set({ readAt: now })
      .where(
        and(
          eq(tenantInAppNotifications.clientId, clientId),
          isNull(tenantInAppNotifications.readAt),
        ),
      )
      .returning({ id: tenantInAppNotifications.id });

    return updated.length;
  }

  async listActivePlatformAdminEmails(): Promise<string[]> {
    const db = getDb();
    const adminRows = await db
      .select({ email: users.email })
      .from(platformUserRoles)
      .innerJoin(users, eq(platformUserRoles.userId, users.id))
      .where(
        and(
          inArray(platformUserRoles.role, ["platform_owner", "platform_admin"]),
          isNull(platformUserRoles.revokedAt),
          eq(users.status, "active"),
        ),
      );

    const uniqueEmails = Array.from(
      new Set(
        adminRows
          .map((r) => r.email?.trim().toLowerCase())
          .filter((e): e is string => Boolean(e && e.includes("@"))),
      ),
    );

    if (uniqueEmails.length > 0) {
      return uniqueEmails;
    }

    // Fallback al replyTo / fromEmail institucional configurado para billing o soporte
    const senderRows = await db
      .select({
        key: emailSenders.key,
        replyTo: emailSenders.replyTo,
        fromEmail: emailSenders.fromEmail,
        status: emailSenders.status,
      })
      .from(emailSenders)
      .where(inArray(emailSenders.key, ["billing", "soporte", "no-reply"]));

    const billingSender =
      senderRows.find((s) => s.key === "billing" && s.status === "active") ||
      senderRows.find((s) => s.key === "soporte" && s.status === "active") ||
      senderRows.find((s) => s.status === "active");

    const fallback = (billingSender?.replyTo || billingSender?.fromEmail || "").trim().toLowerCase();
    return fallback ? [fallback] : [];
  }

  async sendEmail(input: SendSystemNotificationEmailInput): Promise<SendSystemNotificationEmailResult> {
    return sendSystemNotificationEmail(input);
  }
}

/**
 * Servicio centralizado de despacho de notificaciones in-app y por correo electrónico (`SPEC-14`).
 *
 * Respeta el interruptor administrativo global (`email_events.is_enabled`), aplica preferencias
 * del comercio (`tenant_notification_preferences`), escapa variables HTML contra XSS y registra
 * notificaciones in-app sin bloquear ni fallar transacciones operativas de negocio.
 */
export class NotificationDispatcherService {
  constructor(
    private readonly repository: INotificationDispatcherRepository = new DrizzleNotificationDispatcherRepository(),
  ) {}

  /**
   * Escapa entidades HTML en todas las variables de una plantilla (`RN-SPEC-14-04`).
   */
  static escapeVariables(
    variables: Record<string, string | number>,
  ): Record<string, string> {
    const escaped: Record<string, string> = {};
    for (const [k, v] of Object.entries(variables)) {
      escaped[k] = escapeHtmlVariable(v);
    }
    return escaped;
  }

  /**
   * Despacha una notificación hacia un comercio respetando activación global, preferencias y destino.
   */
  async dispatchTenantNotification(
    input: DispatchTenantNotificationInput,
  ): Promise<Result<DispatchTenantNotificationResult>> {
    try {
      const eventKey = input.eventKey.trim().toLowerCase();
      const eventMeta = await this.repository.getEventMetadata(eventKey);

      if (!eventMeta) {
        return err(`Evento '${eventKey}' no registrado en el catálogo.`, "EVENT_NOT_FOUND");
      }

      if (!eventMeta.isEnabled) {
        appLogger.info("notifications.skipped_disabled", {
          eventKey,
          clientId: input.clientId,
          reason: "skipped_disabled_by_admin",
        });
        return ok({
          dispatched: false,
          skippedByAdmin: true,
          emailDispatched: false,
          inAppCreated: false,
        });
      }

      const [clientInfo, pref] = await Promise.all([
        this.repository.getClientRecipientInfo(input.clientId),
        this.repository.getTenantPreference(input.clientId, eventKey),
      ]);

      let inAppCreated = false;
      let inAppNotificationId: string | undefined;

      const inAppAllowed = pref ? pref.inAppEnabled : true;
      if (input.inAppPayload && inAppAllowed) {
        const createdInApp = await this.repository.createInAppNotification({
          clientId: input.clientId,
          eventKey,
          title: input.inAppPayload.title,
          body: input.inAppPayload.body,
          severity: input.inAppPayload.severity ?? "info",
          actionUrl: input.inAppPayload.actionUrl ?? null,
        });
        inAppCreated = true;
        inAppNotificationId = createdInApp.id;
      }

      const emailAllowed = !eventMeta.tenantConfigurable || (pref ? pref.emailEnabled : true);
      let emailDispatched = false;
      let emailDeliveryId: string | undefined;
      let emailStatus: "sent" | "queued" | "failed" | "skipped" | undefined;

      if (emailAllowed) {
        const resolvedRecipient =
          input.recipientOverride?.trim() ||
          (eventMeta.tenantConfigurable ? pref?.customRecipientEmail?.trim() : undefined) ||
          clientInfo?.commercialEmail?.trim() ||
          clientInfo?.contactEmail?.trim() ||
          "";

        if (resolvedRecipient) {
          const effectiveLocale = input.locale ?? clientInfo?.locale ?? "es";
          const emailRes = await this.repository.sendEmail({
            eventKey,
            recipient: resolvedRecipient,
            locale: effectiveLocale,
            variables: input.variables,
            clientId: input.clientId,
            actorUserId: input.actorUserId,
            idempotencyKey: input.idempotencyKey,
          });

          emailDeliveryId = emailRes.deliveryId;
          emailStatus = emailRes.status;
          emailDispatched = emailRes.status === "sent" || emailRes.status === "queued";

          if (emailRes.status === "failed") {
            appLogger.warn("notifications.smtp_failed", {
              eventKey,
              clientId: input.clientId,
              deliveryId: emailRes.deliveryId,
              error: emailRes.error,
            });
          } else if (emailRes.status === "skipped") {
            appLogger.info("notifications.skipped_disabled", {
              eventKey,
              clientId: input.clientId,
              reason: emailRes.error || "skipped_disabled_by_admin",
            });
          } else {
            appLogger.info("notifications.dispatched", {
              eventKey,
              clientId: input.clientId,
              deliveryId: emailRes.deliveryId,
              status: emailRes.status,
              inAppCreated,
            });
          }
        }
      }

      return ok({
        dispatched: emailDispatched || inAppCreated,
        skippedByAdmin: false,
        emailDispatched,
        emailDeliveryId,
        emailStatus,
        inAppCreated,
        inAppNotificationId,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error("[NotificationDispatcherService.dispatchTenantNotification] Error", error, {
        clientId: input.clientId,
        eventKey: input.eventKey,
      });
      return err(msg, "NOTIFICATION_DISPATCH_ERROR");
    }
  }

  /**
   * Despacha una notificación administrativa hacia los operadores activos de plataforma (`platform_owner` / `platform_admin`).
   */
  async dispatchPlatformAdminNotification(
    input: DispatchPlatformAdminNotificationInput,
  ): Promise<Result<{ sentCount: number; skippedByAdmin: boolean }>> {
    try {
      const eventKey = input.eventKey.trim().toLowerCase();
      const eventMeta = await this.repository.getEventMetadata(eventKey);

      if (!eventMeta) {
        return err(`Evento '${eventKey}' no registrado en el catálogo.`, "EVENT_NOT_FOUND");
      }

      if (!eventMeta.isEnabled) {
        appLogger.info("notifications.skipped_disabled", {
          eventKey,
          reason: "skipped_disabled_by_admin",
        });
        return ok({ sentCount: 0, skippedByAdmin: true });
      }

      const recipients = await this.repository.listActivePlatformAdminEmails();
      let sentCount = 0;

      for (const recipient of recipients) {
        const res = await this.repository.sendEmail({
          eventKey,
          recipient,
          locale: input.locale ?? "es",
          variables: input.variables,
          actorUserId: input.actorUserId,
          idempotencyKey: input.idempotencyKey
            ? `${input.idempotencyKey}:${recipient}`
            : undefined,
        });
        if (res.status === "sent" || res.status === "queued") {
          sentCount += 1;
        } else if (res.status === "failed") {
          appLogger.warn("notifications.smtp_failed", {
            eventKey,
            recipient,
            deliveryId: res.deliveryId,
            error: res.error,
          });
        }
      }

      if (sentCount > 0) {
        appLogger.info("notifications.dispatched", {
          eventKey,
          recipientsCount: sentCount,
        });
      }

      return ok({ sentCount, skippedByAdmin: false });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(
        "[NotificationDispatcherService.dispatchPlatformAdminNotification] Error",
        error,
        { eventKey: input.eventKey },
      );
      return err(msg, "PLATFORM_NOTIFICATION_DISPATCH_ERROR");
    }
  }

  /**
   * Lista la bandeja in-app paginada del comercio y sus preferencias efectivas según el rol del usuario.
   */
  async listTenantInboxAndPreferences(
    clientId: string,
    options: {
      unreadOnly?: boolean;
      page?: number;
      limit?: number;
      viewerRole: "tenant_owner" | "tenant_agent";
    },
  ): Promise<TenantNotificationsResponseDto> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(50, Math.max(1, options.limit ?? 20));
    const unreadOnly = Boolean(options.unreadOnly);
    const canManagePreferences = options.viewerRole === "tenant_owner";

    const [inbox, allEvents, storedPrefs] = await Promise.all([
      this.repository.listInAppNotifications(clientId, { unreadOnly, page, limit }),
      canManagePreferences ? this.repository.listAllEventsMetadata() : Promise.resolve([]),
      canManagePreferences ? this.repository.listTenantPreferences(clientId) : Promise.resolve([]),
    ]);

    const prefByEvent = new Map(storedPrefs.map((p) => [p.eventKey.toLowerCase(), p]));
    const preferences: TenantNotificationPreferenceDto[] = canManagePreferences
      ? allEvents
          .filter((ev) => isTenantVisibleNotificationEvent(ev.key))
          .map((ev) => {
            const pref = prefByEvent.get(ev.key.toLowerCase());
            return {
              eventKey: ev.key,
              category: ev.category,
              description: ev.description,
              tenantConfigurable: ev.tenantConfigurable,
              isEnabledByPlatform: ev.isEnabled,
              emailEnabled: ev.tenantConfigurable ? (pref?.emailEnabled ?? true) : true,
              inAppEnabled: pref?.inAppEnabled ?? true,
              customRecipientEmail: ev.tenantConfigurable
                ? (pref?.customRecipientEmail ?? null)
                : null,
              updatedAt: pref?.updatedAt ? pref.updatedAt.toISOString() : null,
            };
          })
      : [];

    return {
      unreadCount: inbox.unreadCount,
      notifications: inbox.items,
      total: inbox.total,
      page,
      limit,
      canManagePreferences,
      preferences,
    };
  }

  /**
   * Obtiene el conteo de notificaciones no leídas del comercio para el indicador en cabecera.
   */
  async getTenantUnreadCount(clientId: string): Promise<number> {
    return this.repository.getUnreadCount(clientId);
  }

  /**
   * Marca como leída una notificación específica perteneciente al comercio.
   */
  async markNotificationRead(
    clientId: string,
    notificationId: string,
  ): Promise<Result<{ id: string }>> {
    const updated = await this.repository.markNotificationRead(clientId, notificationId);
    if (!updated) {
      return err("Notificación no encontrada para este comercio.", "NOTIFICATION_NOT_FOUND");
    }
    return ok({ id: notificationId });
  }

  /**
   * Marca todas las notificaciones pendientes del comercio como leídas.
   */
  async markAllNotificationsRead(clientId: string): Promise<Result<{ updatedCount: number }>> {
    const updatedCount = await this.repository.markAllNotificationsRead(clientId);
    return ok({ updatedCount });
  }

  /**
   * Actualiza las preferencias de notificación del comercio validando rol `tenant_owner`
   * y protegiendo eventos obligatorios (`tenant_configurable = false`).
   */
  async updateTenantPreferences(
    clientId: string,
    actorUserId: string,
    actorRole: string,
    items: UpsertTenantNotificationPreferenceItem[],
  ): Promise<Result<TenantNotificationPreferenceDto[]>> {
    if (actorRole !== "tenant_owner") {
      return err(
        "Solo el propietario del comercio puede modificar las preferencias de notificación.",
        "FORBIDDEN_ROLE",
      );
    }

    const parsed = updateTenantPreferencesPayloadSchema.safeParse({ items });
    if (!parsed.success) {
      return err(
        parsed.error.issues[0]?.message || "Datos de preferencias inválidos.",
        "VALIDATION_ERROR",
      );
    }

    const allEvents = await this.repository.listAllEventsMetadata();
    const eventsByKey = new Map(allEvents.map((ev) => [ev.key.toLowerCase(), ev]));
    const normalizedItems: UpsertTenantNotificationPreferenceItem[] = [];

    for (const item of parsed.data.items) {
      const normalizedKey = item.eventKey.trim().toLowerCase();
      const eventMeta = eventsByKey.get(normalizedKey);
      if (!eventMeta || !isTenantVisibleNotificationEvent(normalizedKey)) {
        return err(
          `El evento '${normalizedKey}' no es válido para preferencias del comercio.`,
          "INVALID_NOTIFICATION_EVENT",
        );
      }

      if (!eventMeta.tenantConfigurable && !item.emailEnabled) {
        return err(
          `La notificación obligatoria '${normalizedKey}' no puede desactivarse por correo.`,
          "MANDATORY_NOTIFICATION_CANNOT_BE_DISABLED",
        );
      }

      normalizedItems.push({
        eventKey: normalizedKey,
        emailEnabled: eventMeta.tenantConfigurable ? item.emailEnabled : true,
        inAppEnabled: item.inAppEnabled,
        customRecipientEmail: eventMeta.tenantConfigurable
          ? item.customRecipientEmail?.trim().toLowerCase() || null
          : null,
      });
    }

    const saved = await this.repository.upsertTenantPreferences(
      clientId,
      actorUserId,
      normalizedItems,
    );
    const savedByKey = new Map(saved.map((s) => [s.eventKey.toLowerCase(), s]));

    const resultDtos: TenantNotificationPreferenceDto[] = allEvents
      .filter((ev) => isTenantVisibleNotificationEvent(ev.key))
      .map((ev) => {
        const pref = savedByKey.get(ev.key.toLowerCase());
        return {
          eventKey: ev.key,
          category: ev.category,
          description: ev.description,
          tenantConfigurable: ev.tenantConfigurable,
          isEnabledByPlatform: ev.isEnabled,
          emailEnabled: ev.tenantConfigurable ? (pref?.emailEnabled ?? true) : true,
          inAppEnabled: pref?.inAppEnabled ?? true,
          customRecipientEmail: ev.tenantConfigurable
            ? (pref?.customRecipientEmail ?? null)
            : null,
          updatedAt: pref?.updatedAt ? pref.updatedAt.toISOString() : null,
        };
      });

    return ok(resultDtos);
  }
}

let defaultDispatcherInstance: NotificationDispatcherService | null = null;

/**
 * Retorna la instancia singleton del despachador de notificaciones respaldado por PostgreSQL (`SPEC-14`).
 */
export function getNotificationDispatcherService(): NotificationDispatcherService {
  if (!defaultDispatcherInstance) {
    defaultDispatcherInstance = new NotificationDispatcherService();
  }
  return defaultDispatcherInstance;
}

/**
 * Construye la URL absoluta o relativa de revisión administrativa para comprobantes Bre-B.
 */
export function buildAdminBreBReviewUrl(): string {
  const baseOrigin = (env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  return baseOrigin ? `${baseOrigin}/admin/billing` : "/admin/billing";
}
