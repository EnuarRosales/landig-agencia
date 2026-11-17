import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  ORDER_STATUS_LIST,
  normalizeAndValidatePhoneE164,
} from "@mocter/domain";

/**
 * Emite una respuesta RFC 9457 Problem Details consistente con `AGENTS.md §4.14`.
 */
export function orderProblemJson(
  req: NextRequest,
  status: number,
  title: string,
  detail: string,
  typeSlug: string,
  code?: string,
): NextResponse {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  return NextResponse.json(
    {
      type: `https://mocter.co/errors/${typeSlug}`,
      title,
      status,
      detail,
      ...(code ? { code } : {}),
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
 * Traduce códigos de error de dominio de `OrdersService` al código HTTP y slug RFC 9457 correspondiente.
 */
export function mapOrderDomainErrorToResponse(
  req: NextRequest,
  code: string | undefined,
  message: string,
): NextResponse {
  switch (code) {
    case "ORDER_NOT_FOUND":
      return orderProblemJson(req, 404, "Order Not Found", message, "not-found", code);
    case "FORBIDDEN_PAID_CANCELLATION":
    case "FORBIDDEN_MONETARY_RETURN":
      return orderProblemJson(req, 403, "Forbidden", message, "forbidden", code);
    case "INSUFFICIENT_STOCK":
    case "ORDER_LOCKED_AFTER_DISPATCH":
    case "INVALID_STATE_TRANSITION":
    case "REFUND_REQUIRED_FOR_PAID_CANCELLATION":
    case "REPEAT_ORDER_NO_ACTIVE_ITEMS":
      return orderProblemJson(req, 422, "Unprocessable Entity", message, "business-rule", code);
    default:
      return orderProblemJson(req, 400, "Bad Request", message, "validation-error", code);
  }
}

export const orderStatusZodEnum = z.enum(ORDER_STATUS_LIST);

export const orderItemInputSchema = z.object({
  productId: z.string().uuid().optional(),
  productName: z.string().trim().min(1, "El nombre del producto en el ítem es obligatorio.").max(200),
  productSku: z.string().trim().max(120).optional(),
  quantity: z.coerce.number().int().positive("La cantidad del ítem debe ser mayor a cero."),
  unitPriceCents: z.coerce.number().int().nonnegative("El precio unitario no puede ser negativo."),
  unitCostCents: z.coerce.number().int().nonnegative().optional(),
  selectedAttributes: z.record(z.string(), z.string()).nullable().optional(),
  tierMinQty: z.coerce.number().int().positive().optional(),
});

export const e164PhoneSchema = z
  .string()
  .trim()
  .min(8, "El teléfono del cliente debe incluir el indicativo internacional E.164.")
  .superRefine((val, ctx) => {
    const res = normalizeAndValidatePhoneE164({
      rawPhone: val,
      allowLocalWithDefaultCountry: false,
    });
    if (!res.ok) {
      ctx.addIssue({ code: "custom", message: res.error });
    }
  })
  .transform((val) => {
    const res = normalizeAndValidatePhoneE164({
      rawPhone: val,
      allowLocalWithDefaultCountry: false,
    });
    return res.ok ? res.data.e164 : val.trim();
  });

export const uuidParamSchema = z.string().uuid("El identificador del pedido debe ser un UUID válido.");
