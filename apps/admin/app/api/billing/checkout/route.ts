import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCheckoutService, type CheckoutService } from "@mocter/domain";
import { handle } from "@/lib/errors/route";
import { problemResponse, requireTenantBillingOwner } from "@/lib/billing-route-auth";

const checkoutRequestSchema = z.object({
  clientId: z.string().uuid().optional(),
  planId: z.string().uuid(),
  planCode: z.string().min(1),
  amountCents: z.number().int().positive(),
  currency: z.enum(["COP", "USD"]),
  cycle: z.enum(["monthly", "annual"]).default("monthly"),
  gateway: z.enum(["wompi", "stripe", "bre_b"]).optional(),
  operationKind: z.enum(["new_subscription", "renewal", "upgrade"]).optional(),
  customerEmail: z.string().email().optional(),
  redirectUrl: z.string().url().optional(),
  executedBy: z.string().optional(),
});

/**
 * Construye el handler POST `/api/billing/checkout` con RBAC `tenant_owner`,
 * soporte Wompi / Stripe / Bre-B y errores RFC 9457 (`BILL-001`, `SPEC-04 T-05`).
 */
export function createCheckoutRouteHandler(checkoutService: CheckoutService) {
  return handle(async (req: NextRequest) => {
    const body = await req.json();
    const parsed = checkoutRequestSchema.safeParse(body);

    if (!parsed.success) {
      return problemResponse(400, "Validation Error", "Parámetros de checkout inválidos.", {
        typeSlug: "validation-error",
        errors: parsed.error.issues,
      });
    }

    const { context, clientId } = await requireTenantBillingOwner(req, parsed.data.clientId);

    const result = await checkoutService.createCheckoutSession({
      clientId,
      planId: parsed.data.planId,
      planCode: parsed.data.planCode,
      amountCents: parsed.data.amountCents,
      currency: parsed.data.currency,
      cycle: parsed.data.cycle,
      gateway: parsed.data.gateway,
      operationKind: parsed.data.operationKind,
      customerEmail: parsed.data.customerEmail || context.user.email,
      redirectUrl: parsed.data.redirectUrl,
      executedBy: parsed.data.executedBy || context.user.id,
    });

    if (!result.ok) {
      return problemResponse(422, "Checkout Session Failed", result.error, {
        typeSlug: "checkout-error",
        code: result.code,
      });
    }

    return NextResponse.json({
      ok: true,
      data: result.data,
    });
  });
}

/**
 * Endpoint HTTP POST `/api/billing/checkout`. Inicializa lazy el servicio real en tiempo de petición.
 */
export const POST = (req: NextRequest) => createCheckoutRouteHandler(getCheckoutService())(req);
