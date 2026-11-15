import { NextRequest, NextResponse } from "next/server";
import { getTenantCrmService } from "@mocter/domain";
import { resolveTenantSession } from "@/lib/tenant-auth";
import { handle } from "@/lib/errors/route";
import {
  mapDomainErrorToProblem,
  problemResponse,
  rateContactBodySchema,
  resolveRequestId,
} from "@/app/api/tenant/contacts/_shared";

/**
 * `POST /api/tenant/contacts/[id]/ratings` — Registra una calificación histórica de 1 a 5 estrellas (`SPEC-09`).
 */
export const POST = handle(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const requestId = resolveRequestId(req);
    const auth = await resolveTenantSession(req);
    if (!auth.ok) {
      return auth.response;
    }

    const { id } = await params;
    const body = await req.json().catch(() => null);
    const parsed = rateContactBodySchema.safeParse(body);
    if (!parsed.success) {
      return problemResponse(req, requestId, {
        status: 400,
        type: "https://mocter.co/errors/validation-error",
        title: "Validation Error",
        detail: parsed.error.issues[0]?.message || "Calificación inválida.",
        issues: parsed.error.issues,
      });
    }

    const service = getTenantCrmService();
    const ratingRes = await service.rateContact(auth.clientId, id, {
      stars: parsed.data.stars,
      comment: parsed.data.comment ?? null,
      ratedByUserId: auth.context.user?.id ?? null,
      ratedByName: auth.context.user?.displayName || auth.context.user?.email || "Operador",
    });

    if (!ratingRes.ok) {
      return mapDomainErrorToProblem(req, requestId, ratingRes);
    }

    return NextResponse.json(
      { ok: true, data: ratingRes.data },
      { status: 201, headers: { "x-request-id": requestId } },
    );
  },
);
