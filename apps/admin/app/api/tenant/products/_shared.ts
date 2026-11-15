import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  appLogger,
  getTenantProductsAndMediaService,
  MAX_PRODUCT_ATTRIBUTE_VALUES,
  MAX_PRODUCT_BOT_MASTER_PROMPT_CHARS,
  MAX_PRODUCT_DYNAMIC_ATTRIBUTES,
} from "@mocter/domain";

export const PROBLEM_CONTENT_TYPE = "application/problem+json";

export const productStatusSchema = z.enum([
  "active",
  "inactive",
  "draft",
  "published",
  "archived",
]);

export const productKindSchema = z.enum(["physical", "digital", "service"]);
export const productCompositionSchema = z.enum(["simple", "combo"]);
export const productConditionSchema = z.enum(["new", "refurbished", "used"]);
export const productAvailabilitySchema = z.enum([
  "in_stock",
  "out_of_stock",
  "preorder",
  "backorder",
]);

export const productDynamicAttributeSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "El nombre del atributo es obligatorio.")
    .max(80, "El nombre del atributo no puede superar 80 caracteres."),
  values: z
    .array(
      z
        .string()
        .trim()
        .min(1, "Los valores de atributo no pueden estar vacíos.")
        .max(120, "Cada valor de atributo no puede superar 120 caracteres."),
    )
    .min(1, "Cada atributo debe incluir al menos un valor.")
    .max(MAX_PRODUCT_ATTRIBUTE_VALUES),
});

export const productComboItemSchema = z.object({
  componentProductId: z.string().trim().min(1).max(128),
  quantity: z.number().int().min(1, "La cantidad por componente debe ser al menos 1.").max(9999),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

export const createProductSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "El nombre del producto debe tener al menos 2 caracteres.")
    .max(200),
  description: z
    .string()
    .trim()
    .min(5, "La descripción del producto debe tener al menos 5 caracteres.")
    .max(5000),
  sku: z.string().trim().max(80).nullable().optional(),
  category: z.string().trim().max(120).nullable().optional(),
  brand: z.string().trim().max(120).nullable().optional(),
  kind: productKindSchema.default("physical"),
  compositionType: productCompositionSchema.default("simple"),
  condition: productConditionSchema.default("new"),
  availability: productAvailabilitySchema.default("in_stock"),
  status: productStatusSchema.default("active"),
  currency: z.string().trim().min(3).max(3).optional(),
  costPriceCents: z
    .number()
    .int()
    .min(0, "El costo no puede ser negativo.")
    .default(0),
  priceCents: z
    .number()
    .int()
    .positive("El precio de venta debe ser un número entero mayor a cero."),
  salePriceCents: z
    .number()
    .int()
    .positive("El precio promocional debe ser mayor a cero.")
    .nullable()
    .optional(),
  stockQuantity: z
    .number()
    .int()
    .min(0, "El stock no puede ser negativo.")
    .nullable()
    .optional(),
  minStockThreshold: z
    .number()
    .int()
    .min(0, "El umbral de stock mínimo no puede ser negativo.")
    .nullable()
    .optional(),
  botMasterPrompt: z
    .string()
    .max(
      MAX_PRODUCT_BOT_MASTER_PROMPT_CHARS,
      `El Prompt Maestro no puede superar los ${MAX_PRODUCT_BOT_MASTER_PROMPT_CHARS} caracteres.`,
    )
    .optional(),
  attributes: z
    .array(productDynamicAttributeSchema)
    .max(
      MAX_PRODUCT_DYNAMIC_ATTRIBUTES,
      `Máximo ${MAX_PRODUCT_DYNAMIC_ATTRIBUTES} grupos de atributos por producto.`,
    )
    .optional(),
  comboItems: z.array(productComboItemSchema).max(50).optional(),
});

export const updateProductSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  description: z.string().trim().min(5).max(5000).optional(),
  sku: z.string().trim().max(80).nullable().optional(),
  category: z.string().trim().max(120).nullable().optional(),
  brand: z.string().trim().max(120).nullable().optional(),
  kind: productKindSchema.optional(),
  compositionType: productCompositionSchema.optional(),
  condition: productConditionSchema.optional(),
  availability: productAvailabilitySchema.optional(),
  status: productStatusSchema.optional(),
  currency: z.string().trim().min(3).max(3).optional(),
  costPriceCents: z.number().int().min(0).optional(),
  priceCents: z.number().int().positive().optional(),
  salePriceCents: z.number().int().positive().nullable().optional(),
  stockQuantity: z.number().int().min(0).nullable().optional(),
  minStockThreshold: z.number().int().min(0).nullable().optional(),
  botMasterPrompt: z.string().max(MAX_PRODUCT_BOT_MASTER_PROMPT_CHARS).optional(),
  attributes: z.array(productDynamicAttributeSchema).max(MAX_PRODUCT_DYNAMIC_ATTRIBUTES).optional(),
  comboItems: z.array(productComboItemSchema).max(50).optional(),
});

export const updateProductStatusSchema = z.object({
  status: productStatusSchema,
});

export const listCatalogQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.enum(["all", "active", "inactive", "draft", "published", "archived"]).optional(),
  kind: z.enum(["all", "physical", "digital", "service"]).optional(),
  compositionType: z.enum(["all", "simple", "combo"]).optional(),
  lowStock: z
    .enum(["true", "false", "1", "0"])
    .transform((v) => v === "true" || v === "1")
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["createdAt", "name", "priceCents", "stock", "status"]).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

/**
 * Extrae o genera un `requestId` estable para trazabilidad end-to-end.
 */
export function resolveRequestId(req: NextRequest): string {
  return req.headers?.get("x-request-id") ?? crypto.randomUUID();
}

/**
 * Construye una respuesta RFC 9457 (`application/problem+json`) consistente con `AGENTS.md §4.14`.
 */
export function problemResponse(
  req: NextRequest,
  requestId: string,
  params: {
    status: number;
    type: string;
    title: string;
    detail: string;
    code?: string;
    issues?: z.ZodIssue[];
  },
): NextResponse {
  return NextResponse.json(
    {
      type: params.type,
      title: params.title,
      status: params.status,
      detail: params.detail,
      instance: req.nextUrl?.pathname ?? "/api/tenant/products",
      reference: requestId,
      ...(params.code ? { code: params.code } : {}),
      ...(params.issues ? { issues: params.issues } : {}),
    },
    {
      status: params.status,
      headers: {
        "Content-Type": PROBLEM_CONTENT_TYPE,
        "x-request-id": requestId,
      },
    },
  );
}

/**
 * Traduce un error de dominio `Result.err` a una respuesta RFC 9457 sin filtrar detalles internos.
 */
export function mapDomainErrorToProblem(
  req: NextRequest,
  requestId: string,
  res: { error: string; code?: string },
): NextResponse {
  const code = res.code ?? "VALIDATION";

  if (code === "PRODUCT_USED_IN_COMBO") {
    return problemResponse(req, requestId, {
      status: 409,
      type: "https://mocter.co/errors/product-in-use",
      title: "Conflict",
      detail: res.error,
      code,
    });
  }

  if (
    code === "PRODUCT_NOT_FOUND" ||
    code === "NOT_FOUND" ||
    code === "MEDIA_LINK_NOT_FOUND" ||
    code === "MEDIA_NOT_FOUND"
  ) {
    return problemResponse(req, requestId, {
      status: 404,
      type: "https://mocter.co/errors/not-found",
      title: "Not Found",
      detail: res.error,
      code,
    });
  }

  if (code === "STORAGE_QUOTA_EXCEEDED" || code.startsWith("QUOTA_EXCEEDED")) {
    return problemResponse(req, requestId, {
      status: 422,
      type: "https://mocter.co/errors/quota-exceeded",
      title: "Quota Exceeded",
      detail: res.error,
      code,
    });
  }

  if (code === "STORAGE_UNAVAILABLE") {
    return problemResponse(req, requestId, {
      status: 503,
      type: "https://mocter.co/errors/media-storage-unavailable",
      title: "Service Unavailable",
      detail:
        "No pudimos almacenar tu archivo en este momento. Intenta nuevamente en unos segundos.",
      code,
    });
  }

  if (code === "FORBIDDEN") {
    return problemResponse(req, requestId, {
      status: 403,
      type: "https://mocter.co/errors/forbidden",
      title: "Forbidden",
      detail: res.error,
      code,
    });
  }

  return problemResponse(req, requestId, {
    status: 400,
    type: "https://mocter.co/errors/validation-error",
    title: "Validation Error",
    detail: res.error,
    code,
  });
}

/**
 * Determina si el usuario autenticado posee permiso de eliminación de productos (`SPEC-08 D-06`).
 */
export function canDeleteProducts(context: {
  role?: string | null;
  effectiveRoles?: string[] | null;
}): boolean {
  if (context.role === "tenant_owner") return true;
  if (Array.isArray(context.effectiveRoles) && context.effectiveRoles.includes("tenant_owner")) {
    return true;
  }
  return false;
}

/**
 * Ejecuta la evaluación de stock bajo y su envío de notificación de manera no bloqueante mediante `after()`.
 */
export function scheduleLowStockEvaluationAfter(
  clientId: string,
  productId: string,
  actor: string,
): void {
  const runTask = async () => {
    try {
      const service = getTenantProductsAndMediaService();
      const evalRes = await service.evaluateLowStockAfterStockMutation(clientId, productId, actor);
      if (evalRes.ok && evalRes.data.triggered && evalRes.data.dispatch) {
        await evalRes.data.dispatch();
      }
    } catch (err) {
      appLogger.error("[LowStockAfter] Fallo no bloqueante evaluando alerta de stock bajo", err, {
        clientId,
        productId,
      });
    }
  };

  try {
    after(runTask);
  } catch {
    void runTask();
  }
}
