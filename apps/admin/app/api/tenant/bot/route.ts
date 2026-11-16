import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import {
  botConfigUnifiedService,
  syncPendingLabelsToChatwootNonBlocking,
  isTenantProfileWriterRole,
} from "@mocter/domain";
import { resolveTenantSession } from "@/lib/tenant-auth";
import { handle } from "@/lib/errors/route";

const messageEntryPatchSchema = z.object({
  body: z.string().max(2000),
  enabled: z.boolean().optional(),
});

const dayScheduleSchema = z.object({
  open: z.string().regex(/^\d{2}:\d{2}$/),
  close: z.string().regex(/^\d{2}:\d{2}$/),
  closed: z.boolean(),
});

const shippingPolicySchema = z
  .object({
    freeShipping: z.boolean().optional(),
    defaultCostCents: z.number().int().min(0).optional(),
    policyText: z.string().max(4000).optional(),
    deliveryRules: z
      .array(
        z.object({
          regionCode: z.string().max(16).nullable(),
          city: z.string().max(120).nullable(),
          days: z.string().min(1).max(120),
        }),
      )
      .optional(),
  })
  .passthrough();

const updateUnifiedBotSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  status: z.enum(["draft", "active", "paused"]).optional(),
  objective: z.string().trim().min(2).max(500).optional(),
  presetId: z.string().uuid().nullable().optional(),
  toneId: z.string().uuid().nullable().optional(),
  persona: z.string().max(2000).nullable().optional(),
  instructions: z.string().max(8000).nullable().optional(),
  allowedTopics: z.string().max(4000).nullable().optional(),
  excludedTopics: z.string().max(4000).nullable().optional(),
  handoffTriggers: z.array(z.string().trim().min(1).max(80)).max(25).optional(),
  responseLanguage: z.enum(["es", "en", "auto"]).optional(),
  answerPolicy: z.enum(["solo_conocimiento", "libre"]).optional(),
  maxTurns: z.number().int().min(1).max(100).optional(),
  maxMessagesPerContact: z.number().int().min(1).max(500).optional(),
  classifierPrompt: z.string().max(4000).nullable().optional(),
  defaultMessages: z
    .object({
      welcome: messageEntryPatchSchema.optional(),
      order_confirmation: messageEntryPatchSchema.optional(),
      dispatch_tracking: messageEntryPatchSchema.optional(),
      delivery_issue: messageEntryPatchSchema.optional(),
      out_of_hours: messageEntryPatchSchema.optional(),
      handoff: messageEntryPatchSchema.optional(),
    })
    .optional(),
  businessHours: z
    .object({
      timezone: z.string().trim().min(2).max(64),
      enabled: z.boolean(),
      schedule: z.object({
        mon: dayScheduleSchema,
        tue: dayScheduleSchema,
        wed: dayScheduleSchema,
        thu: dayScheduleSchema,
        fri: dayScheduleSchema,
        sat: dayScheduleSchema,
        sun: dayScheduleSchema,
      }),
    })
    .optional(),
  remindersEnabled: z.boolean().optional(),
  returnsPolicy: z.string().max(4000).nullable().optional(),
  warrantyPolicy: z.string().max(4000).nullable().optional(),
  shippingPolicy: shippingPolicySchema.optional(),
  orderMessage: z.string().max(2000).nullable().optional(),
  faqs: z
    .array(
      z.object({
        question: z.string().trim().min(1).max(400),
        answer: z.string().trim().min(1).max(2000),
      }),
    )
    .max(50)
    .optional(),
  paymentMethods: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  labels: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        title: z.string().trim().min(2).max(60),
        description: z.string().max(300).nullable().optional(),
        color: z.string().max(20).optional(),
        category: z.enum(["operational", "functional"]).optional(),
        activationRule: z.string().max(600).nullable().optional(),
        sideEffects: z.string().max(600).nullable().optional(),
      }),
    )
    .max(40)
    .optional(),
});

function problemJson(
  req: NextRequest,
  requestId: string,
  status: number,
  title: string,
  detail: string,
  typeSlug: string,
): NextResponse {
  return NextResponse.json(
    {
      type: `https://mocter.co/errors/${typeSlug}`,
      title,
      status,
      detail,
      instance: req.nextUrl.pathname,
      reference: requestId,
    },
    {
      status,
      headers: {
        "Content-Type": "application/problem+json",
        "x-request-id": requestId,
      },
    },
  );
}

/**
 * `GET /api/tenant/bot` — Retorna la configuración unificada del Asistente AI (`SPEC-10` + `SPEC-19` + `SPEC-20`).
 */
export const GET = handle(async (req: NextRequest) => {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const auth = await resolveTenantSession(req);
  if (!auth.ok) {
    return auth.response;
  }

  const actor = auth.context.user?.email || auth.clientId;
  const res = await botConfigUnifiedService.getUnifiedConfig(auth.clientId, {
    actorEmail: actor,
  });

  if (!res.ok) {
    const status = res.code === "CLIENT_NOT_FOUND" ? 404 : 400;
    return problemJson(req, requestId, status, "Bot Config Read Error", res.error, "bot-config-error");
  }

  return NextResponse.json(
    { ok: true, data: res.data },
    { status: 200, headers: { "x-request-id": requestId } },
  );
});

/**
 * `PUT /api/tenant/bot` — Persiste identidad, mensajes, horarios, políticas, clasificación y etiquetas.
 * Restringido a roles propietarios (`tenant_owner` / `tenancy_owner`).
 */
export const PUT = handle(async (req: NextRequest) => {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const auth = await resolveTenantSession(req);
  if (!auth.ok) {
    return auth.response;
  }

  if (!isTenantProfileWriterRole(auth.context.role, auth.context.effectiveRoles)) {
    return problemJson(
      req,
      requestId,
      403,
      "Forbidden",
      "Permiso denegado: solo el propietario del comercio puede modificar la configuración del asistente.",
      "forbidden",
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = updateUnifiedBotSchema.safeParse(body);
  if (!parsed.success) {
    return problemJson(
      req,
      requestId,
      400,
      "Validation Error",
      parsed.error.issues[0]?.message || "Datos del asistente inválidos.",
      "validation-error",
    );
  }

  const actor = auth.context.user?.email || auth.clientId;
  const res = await botConfigUnifiedService.updateUnifiedConfig(
    auth.clientId,
    parsed.data,
    actor,
  );

  if (!res.ok) {
    const status = res.code === "CLIENT_NOT_FOUND" ? 404 : 400;
    return problemJson(req, requestId, status, "Bot Config Update Error", res.error, "bot-config-error");
  }

  after(async () => {
    await syncPendingLabelsToChatwootNonBlocking(auth.clientId);
  });

  return NextResponse.json(
    { ok: true, data: res.data },
    { status: 200, headers: { "x-request-id": requestId } },
  );
});
