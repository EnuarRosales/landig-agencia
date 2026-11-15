import { NextRequest, NextResponse } from "next/server";
import { getTenantCrmService } from "@mocter/domain";
import { resolveTenantSession } from "@/lib/tenant-auth";
import { handle } from "@/lib/errors/route";
import {
  mapDomainErrorToProblem,
  problemResponse,
  resolveRequestId,
  updateStageBodySchema,
} from "@/app/api/tenant/contacts/_shared";

/**
 * `PATCH /api/tenant/contacts/[id]/stage` — Avanza o cambia la etapa de prospección y registra conversión a cliente (`SPEC-09`).
 */
export const PATCH = handle(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const requestId = resolveRequestId(req);
    const auth = await resolveTenantSession(req);
    if (!auth.ok) {
      return auth.response;
    }

    const { id } = await params;
    const body = await req.json().catch(() => null);
    const parsed = updateStageBodySchema.safeParse(body);
    if (!parsed.success) {
      return problemResponse(req, requestId, {
        status: 400,
        type: "https://mocter.co/errors/validation-error",
        title: "Validation Error",
        detail: parsed.error.issues[0]?.message || "Etapa de prospección inválida.",
        issues: parsed.error.issues,
      });
    }

    const actor = auth.context.user?.email || auth.clientId;
    const service = getTenantCrmService();
    const stageRes = await service.updateStage(
      auth.clientId,
      id,
      parsed.data.stage,
      actor,
      parsed.data.notes,
    );

    if (!stageRes.ok) {
      return mapDomainErrorToProblem(req, requestId, stageRes);
    }

    return NextResponse.json(
      { ok: true, data: stageRes.data },
      { status: 200, headers: { "x-request-id": requestId } },
    );
  },
);
