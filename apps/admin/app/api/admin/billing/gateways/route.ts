import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getBillingService } from "@mocter/domain";
import { handle } from "@/lib/errors/route";
import { problemResponse, requirePlatformBillingAdmin } from "@/lib/billing-route-auth";

const gatewayUpdateSchema = z.object({
  id: z.enum(["wompi", "stripe", "bre_b"]),
  displayName: z.string().trim().min(1).optional(),
  isEnabled: z.boolean().default(false),
  environment: z.enum(["sandbox", "production"]).default("sandbox"),
  publicKey: z.string().optional(),
  secretKey: z.string().optional(),
  webhookSecret: z.string().optional(),
  webhookUrl: z.string().optional(),
  supportedCountries: z.array(z.string().min(1)).optional(),
  breBKeyType: z
    .enum(["phone", "email", "document", "alphanumeric", "merchant_code"])
    .nullable()
    .optional(),
  breBKeyValue: z.string().max(160).nullable().optional(),
  breBRecipientName: z.string().max(160).nullable().optional(),
});

/**
 * Lista las pasarelas y canales de cobro configurados para el Backoffice SaaS (`BILL-001`, `SPEC-04`).
 */
export const GET = handle(async (req: NextRequest) => {
  await requirePlatformBillingAdmin(req);
  const billingService = getBillingService();
  const result = await billingService.listPaymentGatewaysPublicConfig();

  if (!result.ok) {
    return problemResponse(500, "Gateways Query Error", result.error, {
      code: result.code,
    });
  }

  return NextResponse.json({ ok: true, data: result.data });
});

/**
 * Actualiza configuración, estado `isEnabled` y parámetros Bre-B de una pasarela o canal (`wompi`, `stripe`, `bre_b`).
 */
export const PUT = handle(async (req: NextRequest) => {
  const admin = await requirePlatformBillingAdmin(req);
  const body = await req.json();
  const parsed = gatewayUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return problemResponse(
      400,
      "Validation Error",
      "Identificador o parámetros de pasarela inválidos (wompi, stripe o bre_b).",
      { typeSlug: "validation-error", errors: parsed.error.issues },
    );
  }

  const billingService = getBillingService();
  const result = await billingService.upsertPaymentGatewayConfig({
    ...parsed.data,
    breBQrPayloadTemplate: null,
    actor: admin.user.email || admin.user.id,
  });

  if (!result.ok) {
    return problemResponse(422, "Gateway Update Failed", result.error, {
      code: result.code,
    });
  }

  return NextResponse.json({ ok: true, data: result.data });
});
