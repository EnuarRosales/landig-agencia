import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { err, ok, type Result } from "../types/result";
import { getActiveSmtpConfig } from "./admin-dashboard.service";

/**
 * Catálogo inicial de remitentes aprobados en `NTF-001 T-01`.
 */
export const CANONICAL_EMAIL_SENDERS = [
  {
    key: "no-reply",
    fromName: "Mocter",
    fromEmail: "no-reply@mocter.co",
    replyTo: "soporte@mocter.co",
    isDefault: true,
    status: "active" as const,
  },
  {
    key: "billing",
    fromName: "Facturación Mocter",
    fromEmail: "facturacion@mocter.co",
    replyTo: "facturacion@mocter.co",
    isDefault: false,
    status: "active" as const,
  },
  {
    key: "comunidad",
    fromName: "Comunidad Mocter",
    fromEmail: "comunidad@mocter.co",
    replyTo: "comunidad@mocter.co",
    isDefault: false,
    status: "active" as const,
  },
  {
    key: "referidos",
    fromName: "Programa Referidos Mocter",
    fromEmail: "referidos@mocter.co",
    replyTo: "referidos@mocter.co",
    isDefault: false,
    status: "active" as const,
  },
  {
    key: "soporte",
    fromName: "Soporte Mocter",
    fromEmail: "soporte@mocter.co",
    replyTo: "soporte@mocter.co",
    isDefault: false,
    status: "active" as const,
  },
] as const;

/**
 * Catálogo inicial de los 10 eventos transaccionales aprobados en `NTF-001 T-01` y `design.md` §4.
 */
export const CANONICAL_EMAIL_EVENTS = [
  {
    key: "auth.verify_email",
    category: "auth" as const,
    description: "Verificación de dirección de correo electrónico tras el registro.",
    variablesSchema: ["user_name", "verify_url", "expires_minutes"],
    defaultSenderKey: "no-reply",
    isEnabled: true,
    isSystem: true,
    tenantConfigurable: false,
  },
  {
    key: "auth.reset_password",
    category: "auth" as const,
    description: "Recuperación o establecimiento inicial de contraseña.",
    variablesSchema: ["user_name", "reset_url", "expires_minutes"],
    defaultSenderKey: "no-reply",
    isEnabled: true,
    isSystem: true,
    tenantConfigurable: false,
  },
  {
    key: "tenant.welcome",
    category: "tenant" as const,
    description: "Correo de bienvenida al completar el alta del comercio.",
    variablesSchema: ["tenant_name", "owner_name", "login_url", "brand_name"],
    defaultSenderKey: "no-reply",
    isEnabled: true,
    isSystem: false,
    tenantConfigurable: false,
  },
  {
    key: "billing.payment_succeeded",
    category: "billing" as const,
    description: "Confirmación de pago exitoso de suscripción o recarga.",
    variablesSchema: ["tenant_name", "plan_name", "amount", "currency", "period_end"],
    defaultSenderKey: "billing",
    isEnabled: true,
    isSystem: false,
    tenantConfigurable: false,
  },
  {
    key: "billing.payment_failed",
    category: "billing" as const,
    description: "Aviso de fallo en el cobro de suscripción con enlace de reintento.",
    variablesSchema: ["tenant_name", "plan_name", "amount", "retry_url"],
    defaultSenderKey: "billing",
    isEnabled: true,
    isSystem: false,
    tenantConfigurable: false,
  },
  {
    key: "billing.renewal",
    category: "billing" as const,
    description: "Aviso de próxima renovación de suscripción.",
    variablesSchema: ["tenant_name", "plan_name", "amount", "currency", "renewal_date"],
    defaultSenderKey: "billing",
    isEnabled: true,
    isSystem: false,
    tenantConfigurable: false,
  },
  {
    key: "community.role_promoted",
    category: "community" as const,
    description: "Notificación de promoción a líder o co-líder de comunidad.",
    variablesSchema: ["user_name", "community_name", "role", "community_url"],
    defaultSenderKey: "comunidad",
    isEnabled: true,
    isSystem: false,
    tenantConfigurable: false,
  },
  {
    key: "community.join_accepted",
    category: "community" as const,
    description: "Confirmación de admisión del miembro en una comunidad.",
    variablesSchema: ["user_name", "community_name", "community_url"],
    defaultSenderKey: "comunidad",
    isEnabled: true,
    isSystem: false,
    tenantConfigurable: true,
  },
  {
    key: "community.digest",
    category: "community" as const,
    description: "Resumen periódico de actividad y novedades en la comunidad.",
    variablesSchema: ["user_name", "community_name"],
    defaultSenderKey: "comunidad",
    isEnabled: true,
    isSystem: false,
    tenantConfigurable: true,
  },
  {
    key: "community.leader_status",
    category: "community" as const,
    description: "Notificación de aprobación, rechazo o revocación de solicitud de líder de comunidad.",
    variablesSchema: ["tenant_name", "status_label", "max_communities", "review_notes", "community_url"],
    defaultSenderKey: "comunidad",
    isEnabled: true,
    isSystem: false,
    tenantConfigurable: false,
  },
  {
    key: "community.invited",
    category: "community" as const,
    description: "Invitación directa a un comercio para unirse a una comunidad.",
    variablesSchema: ["tenant_name", "community_name", "inviter_name", "role_label", "invite_url"],
    defaultSenderKey: "comunidad",
    isEnabled: true,
    isSystem: false,
    tenantConfigurable: true,
  },
  {
    key: "community.product_version_published",
    category: "community" as const,
    description: "Aviso de nueva versión disponible para un producto clonado desde una comunidad.",
    variablesSchema: ["tenant_name", "community_name", "product_name", "version", "changelog", "community_url"],
    defaultSenderKey: "comunidad",
    isEnabled: true,
    isSystem: false,
    tenantConfigurable: true,
  },
  {
    key: "referral.registered",
    category: "referral" as const,
    description: "Confirmación de referido registrado y resumen de recompensa.",
    variablesSchema: ["referrer_name", "referred_name", "reward_summary"],
    defaultSenderKey: "referidos",
    isEnabled: true,
    isSystem: false,
    tenantConfigurable: true,
  },
  {
    key: "referral.reward_credited",
    category: "referral" as const,
    description: "Notificación de crédito de referido acreditado tras el primer pago efectivo del comercio invitado.",
    variablesSchema: [
      "referrer_name",
      "referred_name",
      "reward_amount",
      "currency",
      "expires_at",
      "referrals_url",
    ],
    defaultSenderKey: "referidos",
    isEnabled: true,
    isSystem: false,
    tenantConfigurable: true,
  },
  {
    key: "landing.lead_received",
    category: "landing" as const,
    description: "Notificación interna de nuevo prospecto capturado en la landing.",
    variablesSchema: ["lead_name", "lead_email", "lead_phone", "message"],
    defaultSenderKey: "soporte",
    isEnabled: true,
    isSystem: false,
    tenantConfigurable: false,
  },
  {
    key: "billing.trial_d5_reminder",
    category: "billing" as const,
    description: "Recordatorio preventivo 5 días antes del vencimiento del periodo de prueba o ciclo activo.",
    variablesSchema: ["tenant_name", "plan_name", "days_remaining", "expires_at", "billing_url"],
    defaultSenderKey: "billing",
    isEnabled: true,
    isSystem: false,
    tenantConfigurable: false,
  },
  {
    key: "billing.trial_d0_expired",
    category: "billing" as const,
    description: "Aviso inmediato el día de vencimiento del periodo de prueba o suscripción.",
    variablesSchema: ["tenant_name", "plan_name", "expires_at", "billing_url"],
    defaultSenderKey: "billing",
    isEnabled: true,
    isSystem: false,
    tenantConfigurable: false,
  },
  {
    key: "billing.bre_b_report_pending_admin",
    category: "billing" as const,
    description: "Aviso al equipo administrativo SaaS cuando un comercio reporta un comprobante Bre-B para validación.",
    variablesSchema: ["tenant_name", "plan_name", "amount", "payment_reference", "review_url"],
    defaultSenderKey: "billing",
    isEnabled: true,
    isSystem: false,
    tenantConfigurable: false,
  },
  {
    key: "billing.bre_b_approved",
    category: "billing" as const,
    description: "Confirmación de pago inmediato Bre-B verificado y activación de suscripción.",
    variablesSchema: ["tenant_name", "plan_name", "amount", "receipt_number", "billing_url"],
    defaultSenderKey: "billing",
    isEnabled: true,
    isSystem: false,
    tenantConfigurable: false,
  },
  {
    key: "billing.bre_b_rejected",
    category: "billing" as const,
    description: "Notificación de comprobante Bre-B rechazado con motivo detallado.",
    variablesSchema: ["tenant_name", "plan_name", "amount", "rejection_reason", "billing_url"],
    defaultSenderKey: "billing",
    isEnabled: true,
    isSystem: false,
    tenantConfigurable: false,
  },
  {
    key: "tenant.inventory.low_stock",
    category: "tenant" as const,
    description:
      "Alerta al comercio cuando un producto físico simple alcanza o desciende del umbral mínimo de stock configurado.",
    variablesSchema: [
      "business_name",
      "product_name",
      "sku",
      "current_stock",
      "min_threshold",
      "product_admin_url",
    ],
    defaultSenderKey: "no-reply",
    isEnabled: true,
    isSystem: false,
    tenantConfigurable: true,
  },
  {
    key: "team.member_invited",
    category: "tenant" as const,
    description:
      "Invitación enviada por el propietario de un comercio a un colaborador para unirse a su equipo de trabajo.",
    variablesSchema: [
      "tenant_name",
      "inviter_name",
      "invitee_name",
      "invite_url",
      "expires_hours",
    ],
    defaultSenderKey: "no-reply",
    isEnabled: true,
    isSystem: false,
    tenantConfigurable: false,
  },
] as const;

export type EmailEventKey = (typeof CANONICAL_EMAIL_EVENTS)[number]["key"];

/**
 * Representación de una plantilla versionada (`NTF-001 T-05, T-06`).
 */
export interface EmailTemplateRecord {
  id: string;
  eventKey: string;
  locale: "es" | "en";
  senderKey: string | null;
  subject: string;
  bodyJson: Record<string, unknown>;
  bodyHtml: string;
  version: number;
  status: "draft" | "published" | "retired";
  isLocked: boolean;
  publishedAt: Date | null;
}

/**
 * Registro de entrega en el outbox `email_deliveries` (`NTF-001 T-07`).
 */
export interface EmailDeliveryRecord {
  id: string;
  eventKey: string;
  templateId: string;
  templateVersion: number;
  senderKey: string;
  fromEmail: string;
  recipient: string;
  locale: "es" | "en";
  renderedSubject: string;
  renderedHtml: string;
  payload: Record<string, string | number>;
  idempotencyKey: string;
  status: "queued" | "published" | "sending" | "sent" | "failed" | "dead";
  attempts: number;
  lastError: string | null;
  providerMessageId: string | null;
  rabbitmqMessageId: string | null;
  nextRetryDelayMinutes: number | null;
}

/**
 * Solicitud de contacto de la landing gestionada en `/admin/leads` (`ADM-001 T-37, RF-16`).
 */
export interface ManagedLandingLead {
  id: string;
  name: string;
  email: string;
  phone: string;
  message: string | null;
  status: "new" | "contacted" | "qualified" | "discarded";
  assignedToUserId: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  updatedBy: string;
}

const BACKOFF_MINUTES = [1, 5, 15] as const;

/**
 * Sanitiza HTML server-side eliminando `<script>`, `<iframe>`, `<object>`, `<embed>`
 * y atributos `on*` o `javascript:` (`NTF-001 T-06, RF-04.3, RNF-06`).
 */
export function sanitizeEmailHtml(rawHtml: string): string {
  return rawHtml
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/<(object|embed|style|link|meta)\b[^>]*>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/href\s*=\s*["']\s*javascript:[^"']*["']/gi, 'href="#"')
    .replace(/src\s*=\s*["']\s*javascript:[^"']*["']/gi, 'src=""');
}

/**
 * Escapa entidades HTML en valores de variables dinámicas para prevenir inyección XSS en correos (`RN-SPEC-14-04`).
 */
export function escapeHtmlVariable(value: string | number): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Servicio centralizado de notificaciones transaccionales (`NTF-001 T-01..T-11`, `ADM-001 T-38`)
 * y bandeja administrativa de prospectos de la landing (`ADM-001 T-37, RF-16`).
 *
 * Cumple el principio no bloqueante: `enqueueEmail` solo persiste en el outbox (`queued`)
 * sin esperar a RabbitMQ ni a SMTP; un fallo posterior en RabbitMQ o SMTP jamás revierte ni bloquea el negocio.
 */
export class TransactionalNotificationsAndLeadsService {
  private readonly senders = new Map<
    string,
    {
      key: string;
      fromName: string;
      fromEmail: string;
      replyTo: string;
      isDefault: boolean;
      status: "active" | "disabled";
    }
  >();
  private readonly events = new Map<
    string,
    {
      key: string;
      category: string;
      description: string;
      variablesSchema: string[];
      defaultSenderKey: string | null;
      isEnabled: boolean;
      isSystem: boolean;
      tenantConfigurable: boolean;
    }
  >();
  private readonly templates: EmailTemplateRecord[] = [];
  private readonly deliveriesByIdempotency = new Map<string, EmailDeliveryRecord>();
  private readonly deliveriesById = new Map<string, EmailDeliveryRecord>();
  private readonly leadsById = new Map<string, ManagedLandingLead>();
  private readonly auditEntries: Array<{
    actorUserId: string;
    actorRole: string;
    action: string;
    entityType: string;
    entityId: string;
    createdAt: Date;
  }> = [];

  constructor(
    private readonly secretKey: Buffer = Buffer.alloc(32, 9),
    private readonly activeKeyId: string = "k1",
  ) {
    for (const s of CANONICAL_EMAIL_SENDERS) {
      this.senders.set(s.key, { ...s });
    }
    for (const ev of CANONICAL_EMAIL_EVENTS) {
      this.events.set(ev.key, {
        ...ev,
        variablesSchema: [...ev.variablesSchema],
      });
    }
    this.seedDefaultPublishedTemplates();
  }

  private seedDefaultPublishedTemplates(): void {
    const defaults: Array<{
      eventKey: EmailEventKey;
      locale: "es" | "en";
      subject: string;
      bodyHtml: string;
    }> = [
      {
        eventKey: "auth.verify_email",
        locale: "es",
        subject: "Confirma tu correo en Mocter",
        bodyHtml:
          "<p>Hola {{user_name}}, confirma tu cuenta en <a href=\"{{verify_url}}\">este enlace</a> (vence en {{expires_minutes}} minutos).</p>",
      },
      {
        eventKey: "auth.verify_email",
        locale: "en",
        subject: "Verify your email on Mocter",
        bodyHtml:
          "<p>Hi {{user_name}}, verify your account at <a href=\"{{verify_url}}\">this link</a> (expires in {{expires_minutes}} minutes).</p>",
      },
      {
        eventKey: "auth.reset_password",
        locale: "es",
        subject: "Restablece tu contraseña en Mocter",
        bodyHtml:
          "<p>Hola {{user_name}}, restablece tu contraseña en <a href=\"{{reset_url}}\">este enlace</a> ({{expires_minutes}} min).</p>",
      },
      {
        eventKey: "tenant.welcome",
        locale: "es",
        subject: "¡Bienvenido a {{brand_name}}, {{owner_name}}!",
        bodyHtml:
          "<p>Tu comercio <strong>{{tenant_name}}</strong> ya está operativo. Ingresa en <a href=\"{{login_url}}\">{{login_url}}</a>.</p>",
      },
      {
        eventKey: "tenant.welcome",
        locale: "en",
        subject: "Welcome to {{brand_name}}, {{owner_name}}!",
        bodyHtml:
          "<p>Your business <strong>{{tenant_name}}</strong> is now live. Sign in at <a href=\"{{login_url}}\">{{login_url}}</a>.</p>",
      },
      {
        eventKey: "community.role_promoted",
        locale: "es",
        subject: "Nuevo rol en la comunidad {{community_name}}",
        bodyHtml:
          "<p>Hola {{user_name}}, has sido promovido al rol <strong>{{role}}</strong> en {{community_name}} (<a href=\"{{community_url}}\">ver comunidad</a>).</p>",
      },
      {
        eventKey: "community.join_accepted",
        locale: "es",
        subject: "Solicitud aceptada en {{community_name}}",
        bodyHtml:
          "<p>Hola {{user_name}}, tu ingreso a <strong>{{community_name}}</strong> fue aprobado (<a href=\"{{community_url}}\">entrar</a>).</p>",
      },
      {
        eventKey: "community.leader_status",
        locale: "es",
        subject: "Estado de solicitud de líder de comunidad: {{status_label}}",
        bodyHtml:
          "<p>Hola {{tenant_name}}, el estado de tu autorización para crear comunidades cambió a <strong>{{status_label}}</strong> (cupo: {{max_communities}}). {{review_notes}} <a href=\"{{community_url}}\">Ir a Comunidad</a></p>",
      },
      {
        eventKey: "community.leader_status",
        locale: "en",
        subject: "Community leader authorization update: {{status_label}}",
        bodyHtml:
          "<p>Hi {{tenant_name}}, your community leader authorization status is now <strong>{{status_label}}</strong> (quota: {{max_communities}}). {{review_notes}} <a href=\"{{community_url}}\">Open Community</a></p>",
      },
      {
        eventKey: "community.invited",
        locale: "es",
        subject: "Invitación a la comunidad {{community_name}}",
        bodyHtml:
          "<p>Hola {{tenant_name}}, <strong>{{inviter_name}}</strong> te invitó con rol <strong>{{role_label}}</strong> a <strong>{{community_name}}</strong>. <a href=\"{{invite_url}}\">Ver Invitación</a></p>",
      },
      {
        eventKey: "community.invited",
        locale: "en",
        subject: "Invitation to join {{community_name}}",
        bodyHtml:
          "<p>Hi {{tenant_name}}, <strong>{{inviter_name}}</strong> invited you as <strong>{{role_label}}</strong> to <strong>{{community_name}}</strong>. <a href=\"{{invite_url}}\">View Invitation</a></p>",
      },
      {
        eventKey: "community.product_version_published",
        locale: "es",
        subject: "Nueva versión {{version}} de {{product_name}} en {{community_name}}",
        bodyHtml:
          "<p>Hola {{tenant_name}}, {{community_name}} publicó la versión <strong>{{version}}</strong> de <strong>{{product_name}}</strong>. Novedades: {{changelog}}. <a href=\"{{community_url}}\">Revisar Cambios</a></p>",
      },
      {
        eventKey: "community.product_version_published",
        locale: "en",
        subject: "New version {{version}} of {{product_name}} in {{community_name}}",
        bodyHtml:
          "<p>Hi {{tenant_name}}, {{community_name}} published version <strong>{{version}}</strong> of <strong>{{product_name}}</strong>. Changelog: {{changelog}}. <a href=\"{{community_url}}\">Review Changes</a></p>",
      },
      {
        eventKey: "billing.payment_succeeded",
        locale: "es",
        subject: "Pago confirmado · Plan {{plan_name}}",
        bodyHtml:
          "<p>Recibimos tu pago de {{amount}} {{currency}} para {{tenant_name}} (vigente hasta {{period_end}}).</p>",
      },
      {
        eventKey: "billing.payment_failed",
        locale: "es",
        subject: "Problema con tu pago en Mocter",
        bodyHtml:
          "<p>No pudimos procesar el cobro de {{amount}} para {{tenant_name}} ({{plan_name}}). Reintenta en <a href=\"{{retry_url}}\">{{retry_url}}</a>.</p>",
      },
      {
        eventKey: "billing.renewal",
        locale: "es",
        subject: "Próxima renovación de {{plan_name}}",
        bodyHtml:
          "<p>Tu suscripción de {{tenant_name}} se renovará el {{renewal_date}} por {{amount}} {{currency}}.</p>",
      },
      {
        eventKey: "referral.registered",
        locale: "es",
        subject: "¡Nuevo referido registrado!",
        bodyHtml:
          "<p>Hola {{referrer_name}}, {{referred_name}} se registró con tu enlace. Beneficio: {{reward_summary}}.</p>",
      },
      {
        eventKey: "referral.registered",
        locale: "en",
        subject: "New referral registered!",
        bodyHtml:
          "<p>Hi {{referrer_name}}, {{referred_name}} signed up using your link. Reward: {{reward_summary}}.</p>",
      },
      {
        eventKey: "referral.reward_credited",
        locale: "es",
        subject: "¡Ganaste {{reward_amount}} en créditos de referidos!",
        bodyHtml:
          "<p>Hola {{referrer_name}}, <strong>{{referred_name}}</strong> completó su primer pago efectivo y acreditamos <strong>{{reward_amount}}</strong> ({{currency}}) a tu saldo disponible, vigente hasta el {{expires_at}}.</p><p>Consulta tu saldo o aplícalo en tu próxima factura desde <a href=\"{{referrals_url}}\">Programa de Referidos</a>.</p>",
      },
      {
        eventKey: "referral.reward_credited",
        locale: "en",
        subject: "You earned {{reward_amount}} in referral credits!",
        bodyHtml:
          "<p>Hi {{referrer_name}}, <strong>{{referred_name}}</strong> completed their first paid invoice and we credited <strong>{{reward_amount}}</strong> ({{currency}}) to your available balance, valid until {{expires_at}}.</p><p>Review your balance or apply it to your next invoice in <a href=\"{{referrals_url}}\">Referral Program</a>.</p>",
      },
      {
        eventKey: "landing.lead_received",
        locale: "es",
        subject: "Nuevo contacto desde la landing: {{lead_name}}",
        bodyHtml:
          "<p>Contacto: {{lead_name}} ({{lead_email}}, {{lead_phone}}). Mensaje: {{message}}.</p>",
      },
      {
        eventKey: "billing.trial_d5_reminder",
        locale: "es",
        subject: "Tu plan {{plan_name}} vence en {{days_remaining}} días · {{tenant_name}}",
        bodyHtml:
          "<p>Hola {{tenant_name}}, tu periodo actual de {{plan_name}} vence el {{expires_at}}. Renueva o actualiza tu plan en <a href=\"{{billing_url}}\">Mi Plan y Cuotas</a> para mantener la continuidad sin interrupciones.</p>",
      },
      {
        eventKey: "billing.trial_d5_reminder",
        locale: "en",
        subject: "Your {{plan_name}} plan expires in {{days_remaining}} days · {{tenant_name}}",
        bodyHtml:
          "<p>Hi {{tenant_name}}, your current {{plan_name}} period expires on {{expires_at}}. Renew or upgrade at <a href=\"{{billing_url}}\">My Plan &amp; Quotas</a> to keep uninterrupted service.</p>",
      },
      {
        eventKey: "billing.trial_d0_expired",
        locale: "es",
        subject: "Tu periodo de prueba de {{plan_name}} venció hoy · {{tenant_name}}",
        bodyHtml:
          "<p>El ciclo de {{plan_name}} para {{tenant_name}} venció el {{expires_at}}. Completa tu pago en <a href=\"{{billing_url}}\">Mi Plan y Cuotas</a> para reactivar el servicio de inmediato.</p>",
      },
      {
        eventKey: "billing.trial_d0_expired",
        locale: "en",
        subject: "Your {{plan_name}} trial expired today · {{tenant_name}}",
        bodyHtml:
          "<p>The {{plan_name}} cycle for {{tenant_name}} expired on {{expires_at}}. Complete your payment at <a href=\"{{billing_url}}\">My Plan &amp; Quotas</a> to restore active status immediately.</p>",
      },
      {
        eventKey: "billing.bre_b_report_pending_admin",
        locale: "es",
        subject: "Nuevo comprobante Bre-B por verificar · {{tenant_name}}",
        bodyHtml:
          "<p>El comercio <strong>{{tenant_name}}</strong> reportó un pago Bre-B para el plan <strong>{{plan_name}}</strong> por <strong>{{amount}}</strong> (Ref: <code>{{payment_reference}}</code>).</p><p>Revisa y aprueba o rechaza el comprobante en <a href=\"{{review_url}}\">Revisión De Pagos Bre-B</a>.</p>",
      },
      {
        eventKey: "billing.bre_b_report_pending_admin",
        locale: "en",
        subject: "New Bre-B voucher pending review · {{tenant_name}}",
        bodyHtml:
          "<p>Business <strong>{{tenant_name}}</strong> submitted a Bre-B payment voucher for <strong>{{plan_name}}</strong> (<strong>{{amount}}</strong>, Ref: <code>{{payment_reference}}</code>).</p><p>Review and approve or reject it at <a href=\"{{review_url}}\">Bre-B Payment Review</a>.</p>",
      },
      {
        eventKey: "billing.bre_b_approved",
        locale: "es",
        subject: "Pago Bre-B verificado · Plan {{plan_name}} activo",
        bodyHtml:
          "<p>Confirmamos la recepción de tu pago Bre-B por {{amount}} para {{tenant_name}} (Recibo {{receipt_number}}). Tu plan {{plan_name}} ya está activo. Revisa tu detalle en <a href=\"{{billing_url}}\">Mi Plan y Cuotas</a>.</p>",
      },
      {
        eventKey: "billing.bre_b_report_pending_admin",
        locale: "es",
        subject: "Nuevo comprobante Bre-B por verificar · {{tenant_name}}",
        bodyHtml:
          "<p>El comercio <strong>{{tenant_name}}</strong> reportó un pago Bre-B para el plan <strong>{{plan_name}}</strong> por <strong>{{amount}}</strong> (Ref: <code>{{payment_reference}}</code>).</p><p>Revisa y aprueba o rechaza el comprobante en <a href=\"{{review_url}}\">Revisión De Pagos Bre-B</a>.</p>",
      },
      {
        eventKey: "billing.bre_b_report_pending_admin",
        locale: "en",
        subject: "New Bre-B voucher pending review · {{tenant_name}}",
        bodyHtml:
          "<p>Business <strong>{{tenant_name}}</strong> submitted a Bre-B payment voucher for <strong>{{plan_name}}</strong> (<strong>{{amount}}</strong>, Ref: <code>{{payment_reference}}</code>).</p><p>Review and approve or reject it at <a href=\"{{review_url}}\">Bre-B Payment Review</a>.</p>",
      },
      {
        eventKey: "billing.bre_b_approved",
        locale: "en",
        subject: "Bre-B payment verified · {{plan_name}} active",
        bodyHtml:
          "<p>We confirmed your Bre-B payment of {{amount}} for {{tenant_name}} (Receipt {{receipt_number}}). Your {{plan_name}} plan is now active. Check details at <a href=\"{{billing_url}}\">My Plan &amp; Quotas</a>.</p>",
      },
      {
        eventKey: "billing.bre_b_rejected",
        locale: "es",
        subject: "No pudimos verificar tu comprobante Bre-B · {{tenant_name}}",
        bodyHtml:
          "<p>Tu reporte de pago Bre-B por {{amount}} para el plan {{plan_name}} no fue aprobado. Motivo: <strong>{{rejection_reason}}</strong>. Tu espacio mantiene su configuración vigente; vuelve a subir el comprobante en <a href=\"{{billing_url}}\">Mi Plan y Cuotas</a>.</p>",
      },
      {
        eventKey: "billing.bre_b_rejected",
        locale: "en",
        subject: "Could not verify your Bre-B voucher · {{tenant_name}}",
        bodyHtml:
          "<p>Your Bre-B payment report of {{amount}} for {{plan_name}} could not be approved. Reason: <strong>{{rejection_reason}}</strong>. Your workspace keeps its current configuration; please upload a clear voucher at <a href=\"{{billing_url}}\">My Plan &amp; Quotas</a>.</p>",
      },
      {
        eventKey: "tenant.inventory.low_stock",
        locale: "es",
        subject: "Alerta de stock bajo: {{product_name}} ({{sku}}) · {{business_name}}",
        bodyHtml:
          "<p>Hola {{business_name}}, el producto <strong>{{product_name}}</strong> (SKU: <code>{{sku}}</code>) alcanzó el nivel mínimo configurado.</p><p>Stock vigente: <strong>{{current_stock}}</strong> unidades · Umbral mínimo: <strong>{{min_threshold}}</strong> unidades.</p><p>Revisa o repón el inventario desde <a href=\"{{product_admin_url}}\">Catálogo de Productos</a>.</p>",
      },
      {
        eventKey: "tenant.inventory.low_stock",
        locale: "en",
        subject: "Low stock alert: {{product_name}} ({{sku}}) · {{business_name}}",
        bodyHtml:
          "<p>Hi {{business_name}}, <strong>{{product_name}}</strong> (SKU: <code>{{sku}}</code>) has reached or dropped below its configured minimum threshold.</p><p>Current stock: <strong>{{current_stock}}</strong> units · Minimum threshold: <strong>{{min_threshold}}</strong> units.</p><p>Review or restock this item in <a href=\"{{product_admin_url}}\">Product Catalog</a>.</p>",
      },
      {
        eventKey: "team.member_invited",
        locale: "es",
        subject: "Invitación para unirte al equipo de {{tenant_name}}",
        bodyHtml:
          "<p>Hola {{invitee_name}}, <strong>{{inviter_name}}</strong> te invitó a colaborar en el equipo de <strong>{{tenant_name}}</strong> en Mocter.</p><p>Acepta tu invitación en <a href=\"{{invite_url}}\">Aceptar Invitación</a>. Este enlace vence en {{expires_hours}} horas.</p>",
      },
      {
        eventKey: "team.member_invited",
        locale: "en",
        subject: "Invitation to join {{tenant_name}}'s team",
        bodyHtml:
          "<p>Hi {{invitee_name}}, <strong>{{inviter_name}}</strong> invited you to collaborate with <strong>{{tenant_name}}</strong> on Mocter.</p><p>Accept your invitation at <a href=\"{{invite_url}}\">Accept Invitation</a>. This link expires in {{expires_hours}} hours.</p>",
      },
    ];

    let idx = 1;
    for (const d of defaults) {
      this.templates.push({
        id: `019a0000-0000-7000-8007-${String(idx).padStart(12, "0")}`,
        eventKey: d.eventKey,
        locale: d.locale,
        senderKey: null,
        subject: d.subject,
        bodyJson: { type: "doc", content: [{ type: "paragraph", text: d.bodyHtml }] },
        bodyHtml: sanitizeEmailHtml(d.bodyHtml),
        version: 1,
        status: "published",
        isLocked: d.eventKey.startsWith("auth."),
        publishedAt: new Date(),
      });
      idx += 1;
    }
  }

  /**
   * Cifra credenciales SMTP con AES-256-GCM y AAD vinculada a `keyId` (`NTF-001 T-03, RF-02.3`).
   */
  encryptSmtpPassword(providerName: string, plainPassword: string): {
    ciphertext: Buffer;
    keyId: string;
    maskedPreview: string;
  } {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.secretKey, iv);
    cipher.setAAD(Buffer.from(`smtp_provider:${providerName}:${this.activeKeyId}`, "utf8"));
    const encrypted = Buffer.concat([
      cipher.update(plainPassword, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return {
      ciphertext: Buffer.concat([iv, tag, encrypted]),
      keyId: this.activeKeyId,
      maskedPreview: "••••••••",
    };
  }

  /**
   * Descifra internamente la credencial SMTP para uso exclusivo del worker (`NTF-001 T-03`).
   */
  decryptSmtpPassword(providerName: string, ciphertext: Buffer, keyId: string): string {
    const iv = ciphertext.subarray(0, 12);
    const tag = ciphertext.subarray(12, 28);
    const enc = ciphertext.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", this.secretKey, iv);
    decipher.setAAD(Buffer.from(`smtp_provider:${providerName}:${keyId}`, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  }

  /**
   * Crea un borrador (`draft`) o nueva versión de plantilla validando que no contenga variables desconocidas
   * ni omita variables requeridas por el evento (`NTF-001 T-05, T-06, RF-04.4`).
   */
  createOrDraftTemplate(params: {
    eventKey: string;
    locale: "es" | "en";
    subject: string;
    bodyJson: Record<string, unknown>;
    bodyHtml: string;
    senderKey?: string | null;
    actorRole: "platform_owner" | "platform_admin" | "platform_sales" | "tenant_owner" | "tenant_agent";
  }): Result<EmailTemplateRecord> {
    if (params.actorRole !== "platform_owner" && params.actorRole !== "platform_admin") {
      return err(
        "Forbidden: only platform_owner and platform_admin can manage notification templates (NTF-001 RF-06.2).",
        "FORBIDDEN_ROLE",
      );
    }

    const ev = this.events.get(params.eventKey);
    if (!ev) {
      return err(`Event '${params.eventKey}' does not exist.`, "EVENT_NOT_FOUND");
    }

    if (ev.isSystem && params.actorRole !== "platform_owner") {
      return err(
        "System templates (auth.*) are locked and can only be modified by platform_owner (NTF-001 RF-04.6).",
        "SYSTEM_TEMPLATE_LOCKED",
      );
    }

    const validation = this.validateTemplateVariables(
      params.subject,
      params.bodyHtml,
      ev.variablesSchema,
    );
    if (!validation.ok) {
      return validation;
    }

    const existingVersions = this.templates
      .filter((t) => t.eventKey === params.eventKey && t.locale === params.locale)
      .map((t) => t.version);
    const nextVersion = existingVersions.length > 0 ? Math.max(...existingVersions) + 1 : 1;

    const record: EmailTemplateRecord = {
      id: `019a0000-0000-7000-8007-${String(this.templates.length + 1).padStart(12, "0")}`,
      eventKey: params.eventKey,
      locale: params.locale,
      senderKey: params.senderKey ?? null,
      subject: params.subject,
      bodyJson: params.bodyJson,
      bodyHtml: sanitizeEmailHtml(params.bodyHtml),
      version: nextVersion,
      status: "draft",
      isLocked: ev.isSystem,
      publishedAt: null,
    };

    this.templates.push(record);
    return ok(record);
  }

  /**
   * Publica una plantilla en estado `draft` y retira automáticamente la versión `published` anterior
   * del mismo `(event_key, locale)` (`NTF-001 T-05, RF-04.2, CA-NTF-01`).
   */
  publishTemplate(templateId: string): Result<EmailTemplateRecord> {
    const target = this.templates.find((t) => t.id === templateId);
    if (!target) {
      return err("Template not found.", "TEMPLATE_NOT_FOUND");
    }

    for (const other of this.templates) {
      if (
        other.eventKey === target.eventKey &&
        other.locale === target.locale &&
        other.status === "published" &&
        other.id !== target.id
      ) {
        other.status = "retired";
      }
    }

    target.status = "published";
    target.publishedAt = new Date();
    return ok(target);
  }

  /**
   * Encola de forma **no bloqueante** un correo transaccional en el outbox (`email_deliveries` con `status = 'queued'`) (`NTF-001 T-07, T-08, RF-05.1, RF-05.2`).
   *
   * - Jamás espera a RabbitMQ ni a SMTP.
   * - Es idempotente por `idempotencyKey`: dos llamadas con la misma clave devuelven la misma entrega sin duplicar.
   * - Si falta la plantilla en el `locale` solicitado (`en`), hace fallback automático a `es` (`RF-05.7`).
   */
  enqueueEmail(params: {
    eventKey: string;
    recipient: string;
    locale?: "es" | "en";
    variables: Record<string, string | number>;
    idempotencyKey: string;
  }): Result<EmailDeliveryRecord> {
    const existingDelivery = this.deliveriesByIdempotency.get(params.idempotencyKey);
    if (existingDelivery) {
      return ok(existingDelivery);
    }

    const ev = this.events.get(params.eventKey);
    if (!ev) {
      return err(`Unknown email event '${params.eventKey}'.`, "EVENT_NOT_FOUND");
    }
    if (!ev.isEnabled) {
      return err(
        `Email event '${params.eventKey}' is currently disabled (NTF-001 T-04).`,
        "EVENT_DISABLED",
      );
    }

    // Validar que todas las variables requeridas estén presentes
    for (const reqVar of ev.variablesSchema) {
      if (
        params.variables[reqVar] === undefined ||
        params.variables[reqVar] === null ||
        String(params.variables[reqVar]).trim() === ""
      ) {
        return err(
          `Missing required template variable '${reqVar}' for event '${params.eventKey}' (NTF-001 RF-04.4, CA-NTF-04).`,
          "MISSING_TEMPLATE_VARIABLE",
        );
      }
    }

    const requestedLocale = params.locale ?? "es";
    let template = this.templates.find(
      (t) =>
        t.eventKey === params.eventKey &&
        t.locale === requestedLocale &&
        t.status === "published",
    );
    if (!template && requestedLocale !== "es") {
      template = this.templates.find(
        (t) =>
          t.eventKey === params.eventKey &&
          t.locale === "es" &&
          t.status === "published",
      );
    }

    if (!template) {
      return err(
        `No published template found for event '${params.eventKey}'.`,
        "PUBLISHED_TEMPLATE_NOT_FOUND",
      );
    }

    const senderKey = template.senderKey ?? ev.defaultSenderKey ?? "no-reply";
    let sender = this.senders.get(senderKey);
    if (!sender || sender.status !== "active") {
      sender = Array.from(this.senders.values()).find(
        (s) => s.isDefault && s.status === "active",
      );
    }
    if (!sender) {
      return err("No active default email sender configured.", "NO_ACTIVE_SENDER");
    }

    const renderedSubject = this.interpolateVariables(
      template.subject,
      params.variables,
      false,
    );
    const renderedHtml = sanitizeEmailHtml(
      this.interpolateVariables(template.bodyHtml, params.variables, true),
    );

    const delivery: EmailDeliveryRecord = {
      id: `019a0000-0000-7000-8008-${String(this.deliveriesById.size + 1).padStart(12, "0")}`,
      eventKey: params.eventKey,
      templateId: template.id,
      templateVersion: template.version,
      senderKey: sender.key,
      fromEmail: sender.fromEmail,
      recipient: params.recipient.trim().toLowerCase(),
      locale: template.locale,
      renderedSubject,
      renderedHtml,
      payload: { ...params.variables },
      idempotencyKey: params.idempotencyKey,
      status: "queued",
      attempts: 0,
      lastError: null,
      providerMessageId: null,
      rabbitmqMessageId: null,
      nextRetryDelayMinutes: null,
    };

    this.deliveriesByIdempotency.set(params.idempotencyKey, delivery);
    this.deliveriesById.set(delivery.id, delivery);

    // Envío best-effort no bloqueante usando la config SMTP de la BD (sin env vars)
    void (async () => {
      try {
        const cfg = await getActiveSmtpConfig();
        if (!cfg || !cfg.host || !cfg.user) return;
        const nodemailer = await import("nodemailer");
        const transporter = nodemailer.createTransport({
          host: cfg.host,
          port: cfg.port,
          secure: cfg.secure || cfg.port === 465,
          auth: { user: cfg.user, pass: cfg.password },
        });
        await transporter.sendMail({
          from: `"${delivery.senderKey}" <${delivery.fromEmail || cfg.from}>`,
          to: delivery.recipient,
          subject: delivery.renderedSubject,
          html: delivery.renderedHtml,
        });
        delivery.status = "sent";
        delivery.attempts = 1;
      } catch (e) {
        delivery.status = "failed";
        delivery.lastError = e instanceof Error ? e.message : String(e);
      }
    })();

    return ok(delivery);
  }

  /**
   * Ejecuta un ciclo del relay del outbox hacia RabbitMQ (`NTF-001 T-07, CA-NTF-08`).
   *
   * Si RabbitMQ está caído (`rabbitMqHealthy = false`), los mensajes permanecen en `queued`
   * sin afectar el caso de uso de negocio que los originó; al recuperarse se publican en `email.send`.
   */
  runOutboxRelayTick(rabbitMqHealthy: boolean): {
    publishedCount: number;
    remainingQueuedCount: number;
  } {
    let publishedCount = 0;
    let remainingQueuedCount = 0;

    for (const delivery of this.deliveriesById.values()) {
      if (delivery.status === "queued") {
        if (rabbitMqHealthy) {
          delivery.status = "published";
          delivery.rabbitmqMessageId = `rmq-${delivery.id}`;
          publishedCount += 1;
        } else {
          remainingQueuedCount += 1;
        }
      }
    }

    return { publishedCount, remainingQueuedCount };
  }

  /**
   * Procesa un intento de envío en el worker SMTP con política de backoff 1 / 5 / 15 min
   * y envío a DLQ (`dead`) tras 3 fallos (`NTF-001 T-07, RF-05.5, CA-NTF-06`).
   */
  processWorkerDeliveryAttempt(
    deliveryId: string,
    smtpSuccess: boolean,
    smtpError?: string,
  ): Result<EmailDeliveryRecord> {
    const delivery = this.deliveriesById.get(deliveryId);
    if (!delivery) {
      return err("Delivery not found.", "DELIVERY_NOT_FOUND");
    }

    delivery.attempts += 1;

    if (smtpSuccess) {
      delivery.status = "sent";
      delivery.providerMessageId = `smtp-msg-${delivery.id}-${delivery.attempts}`;
      delivery.lastError = null;
      delivery.nextRetryDelayMinutes = null;
      return ok(delivery);
    }

    delivery.lastError = smtpError ?? "SMTP connection timeout";
    if (delivery.attempts >= 3) {
      delivery.status = "dead";
      delivery.nextRetryDelayMinutes = null;
    } else {
      delivery.status = "failed";
      delivery.nextRetryDelayMinutes = BACKOFF_MINUTES[delivery.attempts - 1] ?? 15;
    }

    return ok(delivery);
  }

  /**
   * Registra un contacto desde el formulario público de la landing (`mocter_landing`, solo `INSERT`) (`ADM-001 T-37, RF-16.6`).
   */
  insertPublicLandingLead(params: {
    name: string;
    email: string;
    phone: string;
    message?: string | null;
  }): ManagedLandingLead {
    const now = new Date();
    const lead: ManagedLandingLead = {
      id: `019a0000-0000-7000-8009-${String(this.leadsById.size + 1).padStart(12, "0")}`,
      name: params.name.trim(),
      email: params.email.trim().toLowerCase(),
      phone: params.phone.trim(),
      message: params.message ?? null,
      status: "new",
      assignedToUserId: null,
      notes: null,
      createdAt: now,
      updatedAt: now,
      updatedBy: "mocter_landing",
    };
    this.leadsById.set(lead.id, lead);
    return lead;
  }

  /**
   * Actualiza estado, asignación o notas de un lead en `/admin/leads` validando permisos RBAC (`platform_sales` / `platform_admin`)
   * y auditando cada cambio (`ADM-001 T-37, RF-16.1 a RF-16.6`).
   */
  updateLandingLeadInAdmin(params: {
    leadId: string;
    actorUserId: string;
    actorRole: "platform_owner" | "platform_admin" | "platform_sales" | "tenant_owner" | "tenant_agent" | "mocter_landing";
    status?: "new" | "contacted" | "qualified" | "discarded";
    assignedToUserId?: string | null;
    notes?: string | null;
  }): Result<ManagedLandingLead> {
    if (
      params.actorRole !== "platform_sales" &&
      params.actorRole !== "platform_admin" &&
      params.actorRole !== "platform_owner"
    ) {
      return err(
        "Forbidden (403): only platform_sales and platform_admin can read or update landing leads (ADM-001 RF-16.1, RF-16.6).",
        "FORBIDDEN_LEADS_ACCESS",
      );
    }

    const lead = this.leadsById.get(params.leadId);
    if (!lead) {
      return err("Lead not found.", "LEAD_NOT_FOUND");
    }

    if (params.status !== undefined) lead.status = params.status;
    if (params.assignedToUserId !== undefined) lead.assignedToUserId = params.assignedToUserId;
    if (params.notes !== undefined) lead.notes = params.notes;
    lead.updatedAt = new Date();
    lead.updatedBy = params.actorUserId;

    this.auditEntries.push({
      actorUserId: params.actorUserId,
      actorRole: params.actorRole,
      action: "lead.updated",
      entityType: "leads",
      entityId: lead.id,
      createdAt: lead.updatedAt,
    });

    return ok({ ...lead });
  }

  /**
   * Exporta el listado filtrado de `/admin/leads` a formato CSV (`ADM-001 T-37, RF-16.5`).
   */
  exportLandingLeadsToCsv(params: {
    actorRole: "platform_owner" | "platform_admin" | "platform_sales" | "tenant_owner" | "tenant_agent";
    statusFilter?: "new" | "contacted" | "qualified" | "discarded";
  }): Result<string> {
    if (
      params.actorRole !== "platform_sales" &&
      params.actorRole !== "platform_admin" &&
      params.actorRole !== "platform_owner"
    ) {
      return err("Forbidden (403): tenant roles cannot access /admin/leads.", "FORBIDDEN_LEADS_ACCESS");
    }

    const rows = Array.from(this.leadsById.values()).filter((l) =>
      params.statusFilter ? l.status === params.statusFilter : true,
    );

    const header = "id,name,email,phone,status,assigned_to_user_id,notes,created_at";
    const lines = rows.map((r) =>
      [
        r.id,
        `"${r.name.replace(/"/g, '""')}"`,
        r.email,
        r.phone,
        r.status,
        r.assignedToUserId ?? "",
        `"${(r.notes ?? "").replace(/"/g, '""')}"`,
        r.createdAt.toISOString(),
      ].join(","),
    );

    return ok([header, ...lines].join("\n"));
  }

  getAuditLogEntries() {
    return [...this.auditEntries];
  }

  private validateTemplateVariables(
    subject: string,
    bodyHtml: string,
    allowedVars: string[],
  ): Result<true> {
    const allowedSet = new Set(allowedVars);
    const combined = `${subject} ${bodyHtml}`;
    const matches = combined.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g);
    const usedVars = new Set<string>();

    for (const m of matches) {
      const varName = m[1]!;
      if (!allowedSet.has(varName)) {
        return err(
          `Unknown template variable '{{${varName}}}'. Allowed variables: ${allowedVars.join(", ")} (NTF-001 RF-04.4).`,
          "UNKNOWN_TEMPLATE_VARIABLE",
        );
      }
      usedVars.add(varName);
    }

    for (const reqVar of allowedVars) {
      if (!usedVars.has(reqVar)) {
        return err(
          `Missing required variable '{{${reqVar}}}' in template subject or body (NTF-001 T-06, RF-04.4).`,
          "MISSING_REQUIRED_VARIABLE_IN_TEMPLATE",
        );
      }
    }

    return ok(true);
  }

  private interpolateVariables(
    templateText: string,
    variables: Record<string, string | number>,
    escapeHtml: boolean,
  ): string {
    return templateText.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
      const rawVal = variables[key] ?? "";
      return escapeHtml ? escapeHtmlVariable(rawVal) : String(rawVal);
    });
  }
}

let defaultNotificationsServiceInstance: TransactionalNotificationsAndLeadsService | null = null;

/**
 * Retorna la instancia singleton del servicio de notificaciones transaccionales (`NTF-001`, `SPEC-04`).
 */
export function getTransactionalNotificationsService(): TransactionalNotificationsAndLeadsService {
  if (!defaultNotificationsServiceInstance) {
    defaultNotificationsServiceInstance = new TransactionalNotificationsAndLeadsService();
  }
  return defaultNotificationsServiceInstance;
}

