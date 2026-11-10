import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { appLogger } from "@mocter/domain";
import type { CheckoutService } from "@mocter/domain";

const checkoutRequestSchema = z.object({
  clientId: z.string().uuid(),
  planId: z.string().uuid(),
  planCode: z.string().min(1),
  amountCents: z.number().int().positive(),
  currency: z.enum(["COP", "USD"]),
  cycle: z.enum(["monthly", "annual"]).default("monthly"),
  customerEmail: z.string().email(),
  redirectUrl: z.string().url().optional(),
  executedBy: z.string().default("checkout.client"),
});

/**
 * Route Handler para iniciar sesión de pago de suscripción SaaS (BILL-001 T-06).
 */
export function createCheckoutRouteHandler(checkoutService: CheckoutService) {
  return async function POST(req: NextRequest) {
    try {
      const body = await req.json();
      const parsed = checkoutRequestSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          {
            type: "https://mocter.co/errors/validation-error",
            title: "Validation Error",
            status: 400,
            detail: "Parámetros de checkout inválidos.",
            errors: parsed.error.issues,
          },
          {
            status: 400,
            headers: { "Content-Type": "application/problem+json" },
          },
        );
      }

      const result = await checkoutService.createCheckoutSession(parsed.data);

      if (!result.ok) {
        return NextResponse.json(
          {
            type: "https://mocter.co/errors/checkout-error",
            title: "Checkout Session Failed",
            status: 422,
            detail: result.error,
            code: result.code,
          },
          {
            status: 422,
            headers: { "Content-Type": "application/problem+json" },
          },
        );
      }

      return NextResponse.json({
        ok: true,
        data: result.data,
      });
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[ApiCheckout] Error inesperado en checkout: ${msg}`, error);
      return NextResponse.json(
        {
          type: "https://mocter.co/errors/internal-server-error",
          title: "Internal Server Error",
          status: 500,
          detail: "Error al generar la sesión de pago.",
        },
        {
          status: 500,
          headers: { "Content-Type": "application/problem+json" },
        },
      );
    }
  };
}

export const POST = createCheckoutRouteHandler({} as any);

