import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { tenantOrdersService } from "@mocter/domain";
import { resolveTenantSession } from "@/lib/tenant-auth";
import { handle } from "@/lib/errors/route";
import {
  mapOrderDomainErrorToResponse,
  orderProblemJson,
  uuidParamSchema,
} from "../../_shared";

const repeatOrderSchema = z
  .object({
    confirmImmediately: z.boolean().optional().default(false),
  })
  .optional()
  .default({ confirmImmediately: false });

export const POST = handle(
  async (
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ): Promise<NextResponse> => {
    const auth = await resolveTenantSession(req);
    if (!auth.ok) {
      return auth.response;
    }

    const { id } = await params;
    const validId = uuidParamSchema.safeParse(id);
    if (!validId.success) {
      return orderProblemJson(
        req,
        400,
        "Validation Error",
        validId.error.issues[0]?.message || "ID de pedido inválido.",
        "validation-error",
      );
    }

    const rawBody = await req.json().catch(() => ({}));
    const parsed = repeatOrderSchema.safeParse(rawBody ?? {});
    if (!parsed.success) {
      return orderProblemJson(
        req,
        400,
        "Validation Error",
        parsed.error.issues[0]?.message || "Parámetros inválidos.",
        "validation-error",
      );
    }

    const actor = auth.context.user?.email || auth.clientId;
    const res = await tenantOrdersService.repeatOrder(
      auth.clientId,
      validId.data,
      actor,
      parsed.data.confirmImmediately,
    );

    if (!res.ok) {
      return mapOrderDomainErrorToResponse(req, res.code, res.error);
    }

    return NextResponse.json(
      { ok: true, data: res.data },
      { status: res.data.mode === "created" ? 201 : 200 },
    );
  },
);
