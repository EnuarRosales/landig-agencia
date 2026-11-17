import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { tenantOrdersService } from "@mocter/domain";
import { resolveTenantSession } from "@/lib/tenant-auth";
import { handle } from "@/lib/errors/route";
import { mapOrderDomainErrorToResponse, orderProblemJson } from "../_shared";

const createCarrierSchema = z.object({
  name: z.string().trim().min(2, "El nombre de la transportadora debe tener al menos 2 caracteres.").max(100),
  trackingUrlTemplate: z.string().trim().max(500).nullable().optional(),
});

export const GET = handle(async (req: NextRequest): Promise<NextResponse> => {
  const auth = await resolveTenantSession(req);
  if (!auth.ok) {
    return auth.response;
  }

  const res = await tenantOrdersService.listShippingCarriers(auth.clientId);
  if (!res.ok) {
    return mapOrderDomainErrorToResponse(req, res.code, res.error);
  }

  return NextResponse.json({ ok: true, data: res.data }, { status: 200 });
});

export const POST = handle(async (req: NextRequest): Promise<NextResponse> => {
  const auth = await resolveTenantSession(req);
  if (!auth.ok) {
    return auth.response;
  }

  const body = await req.json().catch(() => null);
  const parsed = createCarrierSchema.safeParse(body);
  if (!parsed.success) {
    return orderProblemJson(
      req,
      400,
      "Validation Error",
      parsed.error.issues[0]?.message || "Datos de transportadora inválidos.",
      "validation-error",
    );
  }

  const actor = auth.context.user?.email || auth.clientId;
  const res = await tenantOrdersService.createShippingCarrier(auth.clientId, {
    ...parsed.data,
    actor,
  });

  if (!res.ok) {
    return mapOrderDomainErrorToResponse(req, res.code, res.error);
  }

  return NextResponse.json({ ok: true, data: res.data }, { status: 201 });
});
