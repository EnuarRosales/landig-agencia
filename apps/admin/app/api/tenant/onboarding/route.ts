import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  resolveAuthenticatedPortalContext,
  tenantOnboardingService,
  appLogger,
} from "@mocter/domain";

const step1Schema = z.object({
  action: z.literal("step1_business"),
  displayName: z.string().min(2, "El nombre del comercio debe tener al menos 2 caracteres."),
  slug: z
    .string()
    .min(3, "El slug debe tener al menos 3 caracteres.")
    .max(50, "El slug no puede exceder 50 caracteres.")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "El slug solo admite letras minúsculas, números y guiones."),
  locale: z.enum(["es", "en"]).optional(),
  currency: z.string().min(3).max(3).optional(),
  timezone: z.string().optional(),
  planCode: z.string().optional(),
});

const step2Schema = z.object({
  action: z.literal("step2_product"),
  name: z.string().min(2, "El nombre del producto debe tener al menos 2 caracteres."),
  description: z.string().min(5, "La descripción del producto debe tener al menos 5 caracteres."),
  priceCents: z.number().int().positive("El precio debe ser un número entero mayor a cero."),
  currency: z.string().min(3).max(3).optional(),
  kind: z.enum(["physical", "digital", "service"]).optional(),
});

const step3Schema = z.object({
  action: z.literal("step3_activate"),
  botPreset: z.string().optional(),
  paymentMethods: z.array(z.string()).optional(),
  shippingPolicy: z.record(z.string(), z.unknown()).optional(),
  returnsPolicy: z.string().optional(),
  warrantyPolicy: z.string().optional(),
  orderMessage: z.string().optional(),
});

const onboardingActionSchema = z.discriminatedUnion("action", [
  step1Schema,
  step2Schema,
  step3Schema,
]);

/**
 * Resuelve el contexto de autenticación autoritativo a partir de las cookies de la petición.
 */
async function resolveAuth(req: NextRequest) {
  const isProduction = process.env.NODE_ENV === "production";
  const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
  const sid = (req.cookies.get(sidCookieName)?.value || req.cookies.get("mocter_sid")?.value)?.trim();

  if (!sid) {
    return null;
  }

  const context = await resolveAuthenticatedPortalContext(sid);
  return context;
}

/**
 * Endpoint GET `/api/tenant/onboarding`
 * Devuelve el estado actual de onboarding para el usuario autenticado (TNT-RF-03.1).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const authContext = await resolveAuth(req);
    if (!authContext?.user) {
      return NextResponse.json(
        {
          type: "https://mocter.co/errors/unauthorized",
          title: "Unauthorized",
          status: 401,
          detail: "Sesión no iniciada o expirada.",
        },
        { status: 401, headers: { "Content-Type": "application/problem+json" } },
      );
    }

    const stateRes = await tenantOnboardingService.getOnboardingState(authContext.user.id);
    if (!stateRes.ok) {
      return NextResponse.json(
        {
          type: "https://mocter.co/errors/onboarding-error",
          title: "Onboarding State Error",
          status: 400,
          detail: stateRes.error,
          code: stateRes.code,
        },
        { status: 400, headers: { "Content-Type": "application/problem+json" } },
      );
    }

    return NextResponse.json({ ok: true, data: stateRes.data }, { status: 200 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[GET /api/tenant/onboarding Failed] ${msg}`, error);
    return NextResponse.json(
      {
        type: "https://mocter.co/errors/internal-server-error",
        title: "Internal Server Error",
        status: 500,
        detail: "Ocurrió un error inesperado al resolver el onboarding.",
      },
      { status: 500, headers: { "Content-Type": "application/problem+json" } },
    );
  }
}

/**
 * Endpoint POST `/api/tenant/onboarding`
 * Ejecuta de forma atómica y tipada cada paso del asistente (TNT-RF-03.2 a TNT-RF-03.5).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const authContext = await resolveAuth(req);
    if (!authContext?.user) {
      return NextResponse.json(
        {
          type: "https://mocter.co/errors/unauthorized",
          title: "Unauthorized",
          status: 401,
          detail: "Sesión no iniciada o expirada.",
        },
        { status: 401, headers: { "Content-Type": "application/problem+json" } },
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = onboardingActionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          type: "https://mocter.co/errors/validation-error",
          title: "Validation Error",
          status: 400,
          detail: "La carga útil no cumple con el esquema requerido para este paso.",
          errors: parsed.error.issues,
        },
        { status: 400, headers: { "Content-Type": "application/problem+json" } },
      );
    }

    const actionData = parsed.data;

    if (actionData.action === "step1_business") {
      const result = await tenantOnboardingService.completeStep1Business(authContext.user.id, {
        displayName: actionData.displayName,
        slug: actionData.slug,
        locale: actionData.locale,
        currency: actionData.currency,
        timezone: actionData.timezone,
        planCode: actionData.planCode,
      });

      if (!result.ok) {
        return NextResponse.json(
          {
            type: "https://mocter.co/errors/onboarding-step1-error",
            title: "Step 1 Error",
            status: 400,
            detail: result.error,
            code: result.code,
          },
          { status: 400, headers: { "Content-Type": "application/problem+json" } },
        );
      }

      return NextResponse.json({ ok: true, data: result.data }, { status: 200 });
    }

    if (actionData.action === "step2_product") {
      const result = await tenantOnboardingService.completeStep2FirstProduct(authContext.user.id, {
        name: actionData.name,
        description: actionData.description,
        priceCents: actionData.priceCents,
        currency: actionData.currency,
        kind: actionData.kind,
      });

      if (!result.ok) {
        return NextResponse.json(
          {
            type: "https://mocter.co/errors/onboarding-step2-error",
            title: "Step 2 Error",
            status: 400,
            detail: result.error,
            code: result.code,
          },
          { status: 400, headers: { "Content-Type": "application/problem+json" } },
        );
      }

      return NextResponse.json({ ok: true, data: result.data }, { status: 200 });
    }

    if (actionData.action === "step3_activate") {
      const result = await tenantOnboardingService.completeStep3BotAndActivate(authContext.user.id, {
        botPreset: actionData.botPreset,
        paymentMethods: actionData.paymentMethods,
        shippingPolicy: actionData.shippingPolicy,
        returnsPolicy: actionData.returnsPolicy,
        warrantyPolicy: actionData.warrantyPolicy,
        orderMessage: actionData.orderMessage,
      });

      if (!result.ok) {
        return NextResponse.json(
          {
            type: "https://mocter.co/errors/onboarding-step3-error",
            title: "Step 3 Error",
            status: 400,
            detail: result.error,
            code: result.code,
          },
          { status: 400, headers: { "Content-Type": "application/problem+json" } },
        );
      }

      return NextResponse.json({ ok: true, data: result.data }, { status: 200 });
    }

    return NextResponse.json(
      {
        type: "https://mocter.co/errors/bad-request",
        title: "Bad Request",
        status: 400,
        detail: "Acción no reconocida.",
      },
      { status: 400, headers: { "Content-Type": "application/problem+json" } },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[POST /api/tenant/onboarding Failed] ${msg}`, error);
    return NextResponse.json(
      {
        type: "https://mocter.co/errors/internal-server-error",
        title: "Internal Server Error",
        status: 500,
        detail: "Ocurrió un error inesperado al procesar el paso de onboarding.",
      },
      { status: 500, headers: { "Content-Type": "application/problem+json" } },
    );
  }
}

