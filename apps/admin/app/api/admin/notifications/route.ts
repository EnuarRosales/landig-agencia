import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  fetchAdminEmailSettings,
  saveAdminSmtpProvider,
  saveAdminEmailSender,
  saveAdminEmailTemplate,
  saveAdminEmailBilingualTemplates,
  saveAdminEmailLayoutConfig,
  toggleAdminEmailEvent,
} from "@mocter/domain";
import { handle } from "@/lib/errors/route";
import { problemResponse, requirePlatformAdmin } from "@/lib/billing-route-auth";

const saveProviderSchema = z.object({
  action: z.literal("save_provider"),
  id: z.string().optional(),
  name: z.string().trim().min(1, "El nombre del servidor SMTP es obligatorio."),
  host: z.string().trim().min(1, "El host SMTP es obligatorio."),
  port: z.coerce.number().int().min(1).max(65535),
  secure: z.boolean().optional().default(false),
  username: z.string().optional(),
  password: z.string().optional(),
  status: z.enum(["active", "disabled"]).optional().default("active"),
});

const saveSenderSchema = z.object({
  action: z.literal("save_sender"),
  id: z.string().optional(),
  key: z.string().trim().min(1, "El identificador del remitente es obligatorio."),
  fromName: z.string().trim().min(1, "El nombre visible es obligatorio."),
  fromEmail: z.string().trim().email("El correo remitente no es válido."),
  replyTo: z.string().optional(),
  providerId: z.string().trim().min(1, "El servidor SMTP vinculado es obligatorio."),
  isDefault: z.boolean().optional().default(false),
  status: z.enum(["active", "disabled"]).optional().default("active"),
});

const saveTemplateSchema = z.object({
  action: z.literal("save_template"),
  id: z.string().optional(),
  eventKey: z.string().trim().min(1, "Debe vincular obligatoriamente un Evento del sistema."),
  locale: z.enum(["es", "en"]).optional().default("es"),
  senderId: z.string().trim().min(1, "Debe vincular obligatoriamente una Dirección Remitente."),
  subject: z.string().trim().min(1, "El asunto del correo es obligatorio."),
  bodyHtml: z.string().trim().min(1, "El cuerpo HTML es obligatorio."),
  status: z.enum(["draft", "published", "retired"]).optional().default("published"),
});

const localeTemplateDraftSchema = z.object({
  id: z.string().optional(),
  subject: z.string().default(""),
  bodyHtml: z.string().default(""),
});

const saveBilingualTemplateSchema = z.object({
  action: z.literal("save_bilingual_template"),
  eventKey: z.string().trim().min(1, "Debe vincular obligatoriamente un Evento del sistema."),
  senderId: z.string().trim().min(1, "Debe vincular obligatoriamente una Dirección Remitente."),
  status: z.enum(["draft", "published", "retired"]).optional().default("published"),
  translations: z.object({
    es: localeTemplateDraftSchema.optional(),
    en: localeTemplateDraftSchema.optional(),
  }),
});

const toggleEventSchema = z.object({
  action: z.literal("toggle_event"),
  eventKey: z.string().trim().min(1, "El identificador del evento es obligatorio."),
  isEnabled: z.boolean(),
});

const saveLayoutSchema = z.object({
  action: z.literal("save_layout"),
  locale: z.enum(["es", "en"]).default("es"),
  headerHtml: z.string().default(""),
  footerHtml: z.string().default(""),
  isEnabled: z.boolean().optional().default(true),
});

const adminNotificationsActionSchema = z.discriminatedUnion("action", [
  saveProviderSchema,
  saveSenderSchema,
  saveTemplateSchema,
  saveBilingualTemplateSchema,
  toggleEventSchema,
  saveLayoutSchema,
]);

function rejectLockedAuthTemplateIfNeeded(eventKey: string, role: string): NextResponse | null {
  if (eventKey.startsWith("auth.") && role !== "platform_owner") {
    return problemResponse(
      403,
      "Forbidden",
      "Solo el propietario de plataforma puede editar plantillas críticas de autenticación.",
      { typeSlug: "forbidden", code: "SYSTEM_TEMPLATE_LOCKED" },
    );
  }
  return null;
}

/**
 * `GET /api/admin/notifications` — Consulta proveedores SMTP, remitentes, eventos y plantillas (`NTF-001`, `SPEC-14`).
 */
export const GET = handle(async (req: NextRequest): Promise<NextResponse> => {
  await requirePlatformAdmin(req, "consultar configuración de notificaciones");
  const data = await fetchAdminEmailSettings();
  return NextResponse.json({ ok: true, data });
});

/**
 * `POST /api/admin/notifications` — Administra proveedores SMTP, remitentes, plantillas y activación de eventos (`NTF-001`, `SPEC-14`).
 */
export const POST = handle(async (req: NextRequest): Promise<NextResponse> => {
  const admin = await requirePlatformAdmin(req, "administrar notificaciones y plantillas");
  const rawBody: unknown = await req.json();
  const parsed = adminNotificationsActionSchema.safeParse(rawBody);

  if (!parsed.success) {
    return problemResponse(
      400,
      "Validation Error",
      parsed.error.issues[0]?.message || "Solicitud de notificaciones inválida.",
      {
        typeSlug: "validation-error",
        code: "VALIDATION_ERROR",
        errors: parsed.error.issues,
      },
    );
  }

  const actor = admin.user.email || admin.user.id;
  const payload = parsed.data;

  if (payload.action === "save_provider") {
    const result = await saveAdminSmtpProvider({
      id: payload.id || undefined,
      name: payload.name,
      host: payload.host,
      port: payload.port,
      secure: payload.secure,
      username: payload.username,
      password: payload.password,
      status: payload.status,
      createdBy: actor,
    });
    if (!result.ok) {
      return problemResponse(400, "SMTP Provider Error", result.error, {
        code: result.code,
      });
    }
    return NextResponse.json({ ok: true, data: result.data });
  }

  if (payload.action === "save_sender") {
    const result = await saveAdminEmailSender({
      id: payload.id || undefined,
      key: payload.key,
      fromName: payload.fromName,
      fromEmail: payload.fromEmail,
      replyTo: payload.replyTo,
      providerId: payload.providerId,
      isDefault: payload.isDefault,
      status: payload.status,
      createdBy: actor,
    });
    if (!result.ok) {
      return problemResponse(400, "Email Sender Error", result.error, {
        code: result.code,
      });
    }
    return NextResponse.json({ ok: true, data: result.data });
  }

  if (payload.action === "save_template") {
    const authGuard = rejectLockedAuthTemplateIfNeeded(payload.eventKey, admin.role);
    if (authGuard) {
      return authGuard;
    }

    const result = await saveAdminEmailTemplate({
      id: payload.id || undefined,
      eventKey: payload.eventKey,
      locale: payload.locale,
      senderId: payload.senderId,
      subject: payload.subject,
      bodyHtml: payload.bodyHtml,
      status: payload.status,
      createdBy: actor,
    });
    if (!result.ok) {
      return problemResponse(422, "Email Template Error", result.error, {
        code: result.code,
      });
    }
    return NextResponse.json({ ok: true, data: result.data });
  }

  if (payload.action === "save_bilingual_template") {
    const authGuard = rejectLockedAuthTemplateIfNeeded(payload.eventKey, admin.role);
    if (authGuard) {
      return authGuard;
    }

    const result = await saveAdminEmailBilingualTemplates({
      eventKey: payload.eventKey,
      senderId: payload.senderId,
      status: payload.status,
      translations: payload.translations,
      createdBy: actor,
    });
    if (!result.ok) {
      return problemResponse(422, "Email Template Error", result.error, {
        code: result.code,
      });
    }
    return NextResponse.json({ ok: true, data: result.data });
  }

  if (payload.action === "save_layout") {
    const layoutRes = await saveAdminEmailLayoutConfig({
      locale: payload.locale,
      headerHtml: payload.headerHtml,
      footerHtml: payload.footerHtml,
      isEnabled: payload.isEnabled,
      actorUserId: actor,
    });
    if (!layoutRes.ok) {
      return problemResponse(400, "Layout Save Failed", layoutRes.error, {
        code: layoutRes.code,
      });
    }
    return NextResponse.json({ ok: true, data: layoutRes.data });
  }

  const toggleRes = await toggleAdminEmailEvent({
    eventKey: payload.eventKey,
    isEnabled: payload.isEnabled,
    actorUserId: actor,
  });
  if (!toggleRes.ok) {
    const status =
      toggleRes.code === "EVENT_NOT_FOUND"
        ? 404
        : toggleRes.code === "SYSTEM_EVENT_CANNOT_BE_DISABLED"
          ? 422
          : 400;
    return problemResponse(status, "Event Toggle Failed", toggleRes.error, {
      code: toggleRes.code,
    });
  }

  return NextResponse.json({ ok: true, data: toggleRes.data });
});
