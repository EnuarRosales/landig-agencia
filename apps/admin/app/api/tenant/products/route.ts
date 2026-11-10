import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { tenantWorkspaceService, appLogger } from "@mocter/domain";
import { resolveTenantSession } from "@/lib/tenant-auth";

const createProductSchema = z.object({
  name: z.string().min(2, "El nombre del producto debe tener al menos 2 caracteres."),
  description: z.string().min(5, "La descripción del producto debe tener al menos 5 caracteres."),
  priceCents: z.number().int().positive("El precio debe ser un número entero mayor a cero."),
  salePriceCents: z.number().int().positive().nullable().optional(),
  currency: z.string().min(3).max(3).optional(),
  sku: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  availability: z.enum(["in_stock", "out_of_stock", "preorder", "backorder"]).optional(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await resolveTenantSession(req);
    if (!auth.ok) {
      return auth.response;
    }

    const products = await tenantWorkspaceService.getProducts(auth.clientId);
    return NextResponse.json({ ok: true, data: products }, { status: 200 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[GET /api/tenant/products Failed] ${msg}`, error);
    return NextResponse.json(
      {
        type: "https://mocter.co/errors/internal-server-error",
        title: "Internal Server Error",
        status: 500,
        detail: msg || "Error interno al listar productos.",
      },
      { status: 500, headers: { "Content-Type": "application/problem+json" } },
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await resolveTenantSession(req);
    if (!auth.ok) {
      return auth.response;
    }

    const body = await req.json().catch(() => null);
    const parsed = createProductSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          type: "https://mocter.co/errors/validation-error",
          title: "Validation Error",
          status: 400,
          detail: parsed.error.issues[0]?.message || "Datos de producto inválidos.",
          issues: parsed.error.issues,
        },
        { status: 400, headers: { "Content-Type": "application/problem+json" } },
      );
    }

    const actor = auth.context.user?.email || auth.clientId;
    const created = await tenantWorkspaceService.createProduct(auth.clientId, parsed.data, actor);
    return NextResponse.json({ ok: true, data: created }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[POST /api/tenant/products Failed] ${msg}`, error);
    return NextResponse.json(
      {
        type: "https://mocter.co/errors/product-creation-failed",
        title: "Product Creation Failed",
        status: 400,
        detail: msg || "Error al crear el producto.",
      },
      { status: 400, headers: { "Content-Type": "application/problem+json" } },
    );
  }
}

