import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

export const PROBLEM_CONTENT_TYPE = "application/problem+json";

export const promotionScopeTypeSchema = z.enum(["all_catalog", "category", "product"]);
export const promotionDiscountTypeSchema = z.enum(["percentage", "fixed_amount", "fixed_price"]);
export const promotionLifecycleStatusSchema = z.enum([
  "all",
  "active",
  "scheduled",
  "paused",
  "expired",
  "depleted",
]);

export const listPromotionsQuerySchema = z.object({
  q: z.string().trim().max(140).optional(),
  status: promotionLifecycleStatusSchema.optional(),
  scopeType: z.enum(["all", "all_catalog", "category", "product"]).optional(),
  page: z.coerce.number().int().min(1).max(1000).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  sortBy: z
    .enum(["createdAt", "startsAt", "endsAt", "name", "discountedUnitsSold"])
    .optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
});

export const upsertPromotionSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "El nombre de la promoción debe tener al menos 2 caracteres.")
    .max(140, "El nombre de la promoción no puede superar 140 caracteres."),
  description: z
    .string()
    .trim()
    .max(1500, "El argumento comercial no puede superar 1,500 caracteres.")
    .nullable()
    .optional(),
  scopeType: promotionScopeTypeSchema,
  discountType: promotionDiscountTypeSchema,
  discountValue: z
    .number()
    .int("El valor del descuento debe ser un entero.")
    .positive("El valor del descuento debe ser mayor a cero."),
  startsAt: z.string().trim().min(1, "La fecha de inicio es obligatoria."),
  endsAt: z.string().trim().nullable().optional(),
  maxDiscountedUnits: z
    .number()
    .int("El cupo máximo debe ser un número entero.")
    .positive("El cupo máximo debe ser mayor a cero.")
    .nullable()
    .optional(),
  isActive: z.boolean().optional(),
  productIds: z.array(z.string().trim().min(1).max(128)).max(500).optional(),
  categories: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
});

export const togglePromotionStatusSchema = z.object({
  isActive: z.boolean(),
});

/**
 * Extrae o genera un `x-request-id` correlacionado para los Route Handlers de promociones (`AGENTS.md §4.13`).
 */
export function resolveRequestId(req: NextRequest): string {
  const existing = req.headers.get("x-request-id")?.trim();
  if (existing && existing.length > 0) return existing;
  return crypto.randomUUID();
}

/**
 * Evalúa si la sesión de inquilino actual tiene privilegios para eliminar promociones (`SPEC-18 §6`).
 */
export function canDeletePromotions(context: {
  role?: string | null;
  effectiveRoles?: string[];
}): boolean {
  const roles = new Set<string>(
    [context.role, ...(context.effectiveRoles ?? [])]
      .filter((r): r is string => Boolean(r))
      .map((r) => r.trim().toLowerCase()),
  );
  return (
    roles.has("tenant_owner") ||
    roles.has("tenancy_owner") ||
    roles.has("platform_owner") ||
    roles.has("platform_admin")
  );
}

/**
 * Construye una respuesta de error compatible con RFC 9457 (`application/problem+json`, `AGENTS.md §4.14`).
 */
export function problemResponse(
  req: NextRequest,
  requestId: string,
  payload: {
    status: number;
    type: string;
    title: string;
    detail: string;
    code?: string;
    issues?: unknown;
  },
): NextResponse {
  return NextResponse.json(
    {
      type: payload.type,
      title: payload.title,
      status: payload.status,
      detail: payload.detail,
      instance: req.nextUrl.pathname,
      requestId,
      ...(payload.code ? { code: payload.code } : {}),
      ...(payload.issues ? { issues: payload.issues } : {}),
    },
    {
      status: payload.status,
      headers: {
        "content-type": PROBLEM_CONTENT_TYPE,
        "x-request-id": requestId,
      },
    },
  );
}

/**
 * Mapea errores tipados de `TenantPromotionsService` hacia RFC 9457 con códigos HTTP semánticos.
 */
export function mapPromotionDomainErrorToProblem(
  req: NextRequest,
  requestId: string,
  result: { error: string; code?: string },
): NextResponse {
  const code = result.code ?? "PROMOTION_ERROR";
  if (code === "PROMOTION_NOT_FOUND") {
    return problemResponse(req, requestId, {
      status: 404,
      type: "https://mocter.co/errors/not-found",
      title: "Not Found",
      detail: result.error,
      code,
    });
  }
  if (code === "FORBIDDEN") {
    return problemResponse(req, requestId, {
      status: 403,
      type: "https://mocter.co/errors/forbidden",
      title: "Forbidden",
      detail: result.error,
      code,
    });
  }
  return problemResponse(req, requestId, {
    status: 422,
    type: "https://mocter.co/errors/unprocessable-entity",
    title: "Unprocessable Entity",
    detail: result.error,
    code,
  });
}
