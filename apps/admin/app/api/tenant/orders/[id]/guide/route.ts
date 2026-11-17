import { NextRequest, NextResponse } from "next/server";
import { tenantOrdersService } from "@mocter/domain";
import { resolveTenantSession } from "@/lib/tenant-auth";
import { handle } from "@/lib/errors/route";
import {
  mapOrderDomainErrorToResponse,
  orderProblemJson,
  uuidParamSchema,
} from "../../_shared";

export const GET = handle(
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

    const sp = req.nextUrl.searchParams;
    const formatParam = sp.get("format")?.trim().toLowerCase() ?? "html";
    const sizeParam = sp.get("size")?.trim().toLowerCase() ?? "10x15";
    const advanceParam = sp.get("advance")?.trim().toLowerCase() === "true";

    if (formatParam !== "html" && formatParam !== "pdf") {
      return orderProblemJson(
        req,
        400,
        "Validation Error",
        "El formato de guía debe ser 'html' o 'pdf'.",
        "validation-error",
      );
    }

    if (sizeParam !== "10x15" && sizeParam !== "letter") {
      return orderProblemJson(
        req,
        400,
        "Validation Error",
        "El tamaño de guía debe ser '10x15' o 'letter'.",
        "validation-error",
      );
    }

    const actor = auth.context.user?.email || auth.clientId;
    const locale = auth.context.activeClient?.locale === "en" ? "en" : "es";

    const res = await tenantOrdersService.generateOrderGuide({
      clientId: auth.clientId,
      orderId: validId.data,
      actor,
      format: formatParam,
      size: sizeParam,
      advanceStatus: advanceParam,
      locale,
    });

    if (!res.ok) {
      return mapOrderDomainErrorToResponse(req, res.code, res.error);
    }

    const guide = res.data;
    const bodyPayload =
      typeof guide.body === "string" ? guide.body : new Uint8Array(guide.body);

    return new NextResponse(bodyPayload, {
      status: 200,
      headers: {
        "Content-Type": guide.contentType,
        "Content-Disposition": `inline; filename="${guide.filename}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
);
