import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { tenantWorkspaceService, appLogger } from "@mocter/domain";
import { resolveTenantSession } from "@/lib/tenant-auth";

const updateProductSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().min(5).optional(),
  priceCents: z.number().int().positive().optional(),
  salePriceCents: z.number().int().positive().nullable().optional(),
  currency: z.string().min(3).max(3).optional(),
  sku: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  availability: z.enum(["in_stock", "out_of_stock", "preorder", "backorder"]).optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth = await resolveTenantSession(req);
    if (!auth.ok) {
      return auth.response;
    }

    const { id } = await params;
    const body = await req.json().catch(() => null);
    const parsed = updateProductSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          type: "https://mocter.co/errors/validation-error",
          title: "Validation Error",
          status: 400,
          detail: parsed.error.issues[0]?.message || "Datos de actualización inválidos.",
        },
        { status: 400, headers: { "Content-Type": "application/problem+json" } },
      );
    }

    const actor = auth.context.user?.email || auth.clientId;
    const updated = await tenantWorkspaceService.updateProduct(auth.clientId, id, parsed.data, actor);

    if (!updated) {
      return NextResponse.json(
        {
          type: "https://mocter.co/errors/not-found",
          title: "Product Not Found",
          status: 404,
          detail: `Producto con ID ${id} no encontrado en este comercio.`,
        },
        { status: 404, headers: { "Content-Type": "application/problem+json" } },
      );
    }

    return NextResponse.json({ ok: true, data: updated }, { status: 200 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[PUT /api/tenant/products/:id Failed] ${msg}`, error);
    return NextResponse.json(
      {
        type: "https://mocter.co/errors/internal-server-error",
        title: "Internal Server Error",
        status: 500,
        detail: msg || "Error interno al actualizar el producto.",
      },
      { status: 500, headers: { "Content-Type": "application/problem+json" } },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth = await resolveTenantSession(req);
    if (!auth.ok) {
      return auth.response;
    }

    const { id } = await params;
    const actor = auth.context.user?.email || auth.clientId;
    const deleted = await tenantWorkspaceService.deleteProduct(auth.clientId, id, actor);

    if (!deleted) {
      return NextResponse.json(
        {
          type: "https://mocter.co/errors/not-found",
          title: "Product Not Found",
          status: 404,
          detail: `Producto con ID ${id} no encontrado en este comercio.`,
        },
        { status: 404, headers: { "Content-Type": "application/problem+json" } },
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[DELETE /api/tenant/products/:id Failed] ${msg}`, error);
    return NextResponse.json(
      {
        type: "https://mocter.co/errors/internal-server-error",
        title: "Internal Server Error",
        status: 500,
        detail: msg || "Error interno al eliminar el producto.",
      },
      { status: 500, headers: { "Content-Type": "application/problem+json" } },
    );
  }
}

