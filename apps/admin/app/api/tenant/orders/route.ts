import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { tenantWorkspaceService, appLogger } from "@mocter/domain";
import { resolveTenantSession } from "@/lib/tenant-auth";

const createOrderSchema = z.object({
  customerName: z.string().min(2, "El nombre del cliente debe tener al menos 2 caracteres."),
  customerPhone: z.string().min(7, "El teléfono del cliente debe tener al menos 7 dígitos."),
  paymentMethod: z.string().default("transferencia"),
  totalCents: z.number().int().positive("El total debe ser mayor a cero."),
  currency: z.string().min(3).max(3).optional(),
  subtotalCents: z.number().int().positive().optional(),
  shippingCents: z.number().int().nonnegative().optional(),
  discountCents: z.number().int().nonnegative().optional(),
  notes: z.string().nullable().optional(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await resolveTenantSession(req);
    if (!auth.ok) {
      return auth.response;
    }

    const orders = await tenantWorkspaceService.getOrders(auth.clientId);
    return NextResponse.json({ ok: true, data: orders }, { status: 200 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[GET /api/tenant/orders Failed] ${msg}`, error);
    return NextResponse.json(
      {
        type: "https://mocter.co/errors/internal-server-error",
        title: "Internal Server Error",
        status: 500,
        detail: msg || "Error interno al listar pedidos.",
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
    const parsed = createOrderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          type: "https://mocter.co/errors/validation-error",
          title: "Validation Error",
          status: 400,
          detail: parsed.error.issues[0]?.message || "Datos de pedido inválidos.",
        },
        { status: 400, headers: { "Content-Type": "application/problem+json" } },
      );
    }

    const actor = auth.context.user?.email || auth.clientId;
    const created = await tenantWorkspaceService.createOrder(auth.clientId, parsed.data, actor);
    return NextResponse.json({ ok: true, data: created }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[POST /api/tenant/orders Failed] ${msg}`, error);
    return NextResponse.json(
      {
        type: "https://mocter.co/errors/order-creation-failed",
        title: "Order Creation Failed",
        status: 400,
        detail: msg || "Error al crear el pedido.",
      },
      { status: 400, headers: { "Content-Type": "application/problem+json" } },
    );
  }
}

