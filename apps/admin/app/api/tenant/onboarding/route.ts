import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  resolveAuthenticatedPortalContext,
  tenantOnboardingService,
  TENANT_PAYMENT_CHANNEL_CODES,
  normalizeAndValidatePhoneE164,
} from "@mocter/domain";
import { handle } from "@/lib/errors/route";
import { readSessionToken } from "@/lib/billing-route-auth";

const step1Schema = z.object({
  action: z.literal("step1_business"),
  displayName: z.string().min(2, "El nombre del comercio debe tener al menos 2 caracteres."),
  slug: z
    .string()
    .min(3, "El slug debe tener al menos 3 caracteres.")
    .max(50, "El slug no puede exceder 50 caracteres.")
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "El slug solo admite letras minúsculas, números y guiones.",
    ),
  commercialEmail: z.string().email("Correo comercial inválido.").nullable().optional().or(z.literal("")),
  websiteUrl: z.string().max(300).nullable().optional().or(z.literal("")),
  phone: z
    .string()
    .max(30)
    .nullable()
    .optional()
    .or(z.literal(""))
    .superRefine((val, ctx) => {
      if (!val || val.trim() === "") return;
      const res = normalizeAndValidatePhoneE164({
        rawPhone: val,
        allowLocalWithDefaultCountry: false,
      });
      if (!res.ok) {
        ctx.addIssue({ code: "custom", message: res.error });
      }
    }),
  countryCode: z.string().trim().max(8).nullable().optional(),
  country: z.string().trim().max(120).nullable().optional(),
  subdivisionCode: z.string().trim().max(16).nullable().optional(),
  state: z.string().trim().max(120).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  addressLine: z.string().trim().max(255).nullable().optional(),
  addressComplement: z.string().trim().max(255).nullable().optional(),
  postalCode: z.string().trim().max(32).nullable().optional(),
  locale: z.enum(["es", "en"]).optional(),
  currency: z.string().min(3).max(3).optional(),
  timezone: z.string().optional(),
  planCode: z.string().optional(),
});

const step2PlanSchema = z.object({
  action: z.literal("step2_plan"),
  planId: z.string().uuid().optional(),
  planCode: z.string().min(1).optional(),
  cycle: z.enum(["monthly", "annual"]).optional(),
});

const step3ProductSchema = z.object({
  action: z.literal("step3_product"),
  name: z.string().min(2, "El nombre del producto debe tener al menos 2 caracteres."),
  description: z.string().min(5, "La descripción del producto debe tener al menos 5 caracteres."),
  costPriceCents: z.number().int().nonnegative().nullable().optional(),
  salePriceCents: z.number().int().positive("El precio de venta debe ser mayor a cero.").optional(),
  priceCents: z.number().int().positive("El precio debe mayor a cero.").optional(),
  currency: z.string().min(3).max(3).optional(),
  kind: z.enum(["physical", "digital", "service"]).optional(),
});

const legacyStep2ProductSchema = z.object({
  action: z.literal("step2_product"),
  name: z.string().min(2, "El nombre del producto debe tener al menos 2 caracteres."),
  description: z.string().min(5, "La descripción del producto debe tener al menos 5 caracteres."),
  costPriceCents: z.number().int().nonnegative().nullable().optional(),
  salePriceCents: z.number().int().positive("El precio de venta debe ser mayor a cero.").optional(),
  priceCents: z.number().int().positive("El precio debe ser mayor a cero.").optional(),
  currency: z.string().min(3).max(3).optional(),
  kind: z.enum(["physical", "digital", "service"]).optional(),
});

const paymentChannelItemSchema = z.object({
  id: z.string().optional(),
  channelCode: z.enum(TENANT_PAYMENT_CHANNEL_CODES),
  displayName: z.string().min(2).max(120),
  accountIdentifier: z.string().max(255).nullable().optional(),
  accountHolderName: z.string().max(150).nullable().optional(),
  instructions: z.string().max(1000).nullable().optional(),
  isActive: z.boolean().optional(),
});

const step4AssistantSchema = z.object({
  action: z.literal("step4_assistant_payments"),
  botName: z.string().min(2).max(120).optional(),
  botObjective: z.string().min(3).max(500).optional(),
  botPresetId: z.string().uuid().optional(),
  botPreset: z.string().optional(),
  botToneId: z.string().uuid().optional(),
  paymentChannels: z.array(paymentChannelItemSchema).optional(),
  paymentMethods: z.array(z.string()).optional(),
  orderConfirmationMessage: z.string().max(1000).optional(),
  orderMessage: z.string().max(1000).optional(),
  shippingPolicy: z.record(z.string(), z.unknown()).optional(),
  returnsPolicy: z.string().optional(),
  warrantyPolicy: z.string().optional(),
});

const step5CompleteSchema = z.object({
  action: z.literal("step5_complete"),
  completionMode: z.enum(["trial", "free", "pending_payment_review", "paid"]).optional(),
  planCode: z.string().optional(),
  cycle: z.enum(["monthly", "annual"]).optional(),
  botPreset: z.string().optional(),
  paymentMethods: z.array(z.string()).optional(),
  shippingPolicy: z.record(z.string(), z.unknown()).optional(),
  returnsPolicy: z.string().optional(),
  warrantyPolicy: z.string().optional(),
  orderMessage: z.string().optional(),
});

const legacyStep3ActivateSchema = z.object({
  action: z.literal("step3_activate"),
  completionMode: z.enum(["trial", "free", "pending_payment_review", "paid"]).optional(),
  planCode: z.string().optional(),
  cycle: z.enum(["monthly", "annual"]).optional(),
  botPreset: z.string().optional(),
  paymentMethods: z.array(z.string()).optional(),
  shippingPolicy: z.record(z.string(), z.unknown()).optional(),
  returnsPolicy: z.string().optional(),
  warrantyPolicy: z.string().optional(),
  orderMessage: z.string().optional(),
});

const onboardingActionSchema = z.discriminatedUnion("action", [
  step1Schema,
  step2PlanSchema,
  step3ProductSchema,
  legacyStep2ProductSchema,
  step4AssistantSchema,
  step5CompleteSchema,
  legacyStep3ActivateSchema,
]);

function problemResponse(params: {
  req: NextRequest;
  status: number;
  title: string;
  detail: string;
  code?: string;
  typeSlug: string;
  errors?: unknown;
}): NextResponse {
  return NextResponse.json(
    {
      type: `https://mocter.co/errors/${params.typeSlug}`,
      title: params.title,
      status: params.status,
      detail: params.detail,
      ...(params.code ? { code: params.code } : {}),
      ...(params.errors ? { errors: params.errors } : {}),
      instance: params.req.nextUrl.pathname,
    },
    { status: params.status, headers: { "Content-Type": "application/problem+json" } },
  );
}

async function resolveAuth(req: NextRequest) {
  const sid = (await readSessionToken(req))?.trim();
  if (!sid) {
    return null;
  }
  return resolveAuthenticatedPortalContext(sid);
}

/**
 * `GET /api/tenant/onboarding` · Devuelve el estado completo del asistente de 5 pasos (`SPEC-06 §9.1`).
 */
export const GET = handle(async (req: NextRequest): Promise<NextResponse> => {
  const authContext = await resolveAuth(req);
  if (!authContext?.user) {
    return problemResponse({
      req,
      status: 401,
      title: "Unauthorized",
      detail: "Sesión no iniciada o expirada.",
      typeSlug: "unauthorized",
    });
  }

  const preselectedPlanCode = req.nextUrl.searchParams.get("plan")?.trim() || undefined;
  const stateRes = await tenantOnboardingService.getOnboardingState(authContext.user.id, {
    preselectedPlanCode,
  });

  if (!stateRes.ok) {
    return problemResponse({
      req,
      status: 400,
      title: "Onboarding State Error",
      detail: stateRes.error,
      code: stateRes.code,
      typeSlug: "onboarding-error",
    });
  }

  return NextResponse.json({ ok: true, data: stateRes.data }, { status: 200 });
});

/**
 * `POST /api/tenant/onboarding` · Ejecuta de forma atómica el paso 1..5 del onboarding (`SPEC-06 §9.1`).
 */
export const POST = handle(async (req: NextRequest): Promise<NextResponse> => {
  const authContext = await resolveAuth(req);
  if (!authContext?.user) {
    return problemResponse({
      req,
      status: 401,
      title: "Unauthorized",
      detail: "Sesión no iniciada o expirada.",
      typeSlug: "unauthorized",
    });
  }

  const body = await req.json().catch(() => null);
  const parsed = onboardingActionSchema.safeParse(body);

  if (!parsed.success) {
    return problemResponse({
      req,
      status: 400,
      title: "Validation Error",
      detail: "La carga útil no cumple con el esquema requerido para este paso.",
      typeSlug: "validation-error",
      errors: parsed.error.issues,
    });
  }

  const actionData = parsed.data;

  if (actionData.action === "step1_business") {
    const result = await tenantOnboardingService.saveBusinessStep(authContext.user.id, {
      displayName: actionData.displayName,
      slug: actionData.slug,
      commercialEmail: actionData.commercialEmail || null,
      websiteUrl: actionData.websiteUrl || null,
      phone: actionData.phone || null,
      countryCode: actionData.countryCode || null,
      country: actionData.country || null,
      subdivisionCode: actionData.subdivisionCode || null,
      state: actionData.state || null,
      city: actionData.city || null,
      addressLine: actionData.addressLine || null,
      addressComplement: actionData.addressComplement || null,
      postalCode: actionData.postalCode || null,
      locale: actionData.locale,
      currency: actionData.currency,
      timezone: actionData.timezone,
      planCode: actionData.planCode,
    });

    if (!result.ok) {
      return problemResponse({
        req,
        status: result.code === "SLUG_ALREADY_EXISTS" ? 409 : 400,
        title: "Step 1 Error",
        detail: result.error,
        code: result.code,
        typeSlug: "onboarding-step1-error",
      });
    }

    return NextResponse.json({ ok: true, data: result.data }, { status: 200 });
  }

  if (actionData.action === "step2_plan") {
    const result = await tenantOnboardingService.savePlanStep(authContext.user.id, {
      planId: actionData.planId,
      planCode: actionData.planCode,
      cycle: actionData.cycle,
    });

    if (!result.ok) {
      return problemResponse({
        req,
        status: 400,
        title: "Step 2 Error",
        detail: result.error,
        code: result.code,
        typeSlug: "onboarding-step2-error",
      });
    }

    return NextResponse.json({ ok: true, data: result.data }, { status: 200 });
  }

  if (actionData.action === "step3_product" || actionData.action === "step2_product") {
    const result = await tenantOnboardingService.saveFirstProductStep(authContext.user.id, {
      name: actionData.name,
      description: actionData.description,
      costPriceCents: actionData.costPriceCents ?? null,
      salePriceCents: actionData.salePriceCents ?? actionData.priceCents,
      currency: actionData.currency,
      kind: actionData.kind,
    });

    if (!result.ok) {
      return problemResponse({
        req,
        status: 400,
        title: "Step 3 Error",
        detail: result.error,
        code: result.code,
        typeSlug: "onboarding-step3-error",
      });
    }

    return NextResponse.json({ ok: true, data: result.data }, { status: 200 });
  }

  if (actionData.action === "step4_assistant_payments") {
    const result = await tenantOnboardingService.saveAssistantAndPaymentsStep(
      authContext.user.id,
      {
        botName: actionData.botName,
        botObjective: actionData.botObjective,
        botPresetId: actionData.botPresetId,
        botPreset: actionData.botPreset,
        botToneId: actionData.botToneId,
        paymentChannels: actionData.paymentChannels,
        paymentMethods: actionData.paymentMethods,
        orderConfirmationMessage:
          actionData.orderConfirmationMessage ?? actionData.orderMessage,
        shippingPolicy: actionData.shippingPolicy,
        returnsPolicy: actionData.returnsPolicy,
        warrantyPolicy: actionData.warrantyPolicy,
      },
    );

    if (!result.ok) {
      return problemResponse({
        req,
        status: 400,
        title: "Step 4 Error",
        detail: result.error,
        code: result.code,
        typeSlug: "onboarding-step4-error",
      });
    }

    return NextResponse.json({ ok: true, data: result.data }, { status: 200 });
  }

  if (actionData.action === "step5_complete") {
    const result = await tenantOnboardingService.completeOnboardingStep(authContext.user.id, {
      completionMode: actionData.completionMode,
      planCode: actionData.planCode,
      cycle: actionData.cycle,
    });

    if (!result.ok) {
      return problemResponse({
        req,
        status: 400,
        title: "Step 5 Error",
        detail: result.error,
        code: result.code,
        typeSlug: "onboarding-step5-error",
      });
    }

    return NextResponse.json({ ok: true, data: result.data }, { status: 200 });
  }

  // Compatibilidad hacia atrás (`step3_activate`)
  const legacyResult = await tenantOnboardingService.completeStep3BotAndActivate(
    authContext.user.id,
    {
      botPreset: actionData.botPreset,
      paymentMethods: actionData.paymentMethods,
      shippingPolicy: actionData.shippingPolicy,
      returnsPolicy: actionData.returnsPolicy,
      warrantyPolicy: actionData.warrantyPolicy,
      orderMessage: actionData.orderMessage,
      completionMode: actionData.completionMode,
      planCode: actionData.planCode,
      cycle: actionData.cycle,
    },
  );

  if (!legacyResult.ok) {
    return problemResponse({
      req,
      status: 400,
      title: "Onboarding Activation Error",
      detail: legacyResult.error,
      code: legacyResult.code,
      typeSlug: "onboarding-activation-error",
    });
  }

  return NextResponse.json({ ok: true, data: legacyResult.data }, { status: 200 });
});
