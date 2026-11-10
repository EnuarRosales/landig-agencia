import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { tenantWorkspaceService, appLogger } from "@mocter/domain";
import { resolveTenantSession } from "@/lib/tenant-auth";

const updateOrderStatusSchema = z.object({
  status: z.enum([
    "registered",
    "confirmed",
    "preparing",
    "shipped",
    "delivered",
    "cancelled",
    "returned",
  ]),
});

export async function PATCH(
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
    const parsed = updateOrderStatusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          type: "https://mocter.co/errors/validation-error",
          title: "Validation Error",
          status: 400,
          detail: "Estado de pedido inválido.",
        },
        { status: 400, headers: { "Content-Type": "application/problem+json" } },
      );
    }

    const actor = auth.context.user?.email || auth.clientId;
    const success = await tenantWorkspaceService.updateOrderStatus(
      auth.clientId,
      id,
      parsed.data.status,
      actor,
    );

    if (!success) {
      return NextResponse.json(
        {
          type: "https://mocter.co/errors/not-found",
          title: "Order Not Found",
          status: 404,
          detail: `Pedido con ID ${id} no encontrado.`,
        },
        { status: 404, headers: { "Content-Type": "application/problem+json" } },
      );
    }

    return NextResponse.json({ ok: true, status: parsed.data.status }, { status: 200 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[PATCH /api/tenant/orders/:id Failed] ${msg}`, error);
    return NextResponse.json(
      {
        type: "https://mocter.co/errors/internal-server-error",
        title: "Internal Server Error",
        status: 500,
        detail: msg || "Error interno al actualizar el estado del pedido.",
      },
      { status: 500, headers: { "Content-Type": "application/problem+json" } },
    );
  }
}

