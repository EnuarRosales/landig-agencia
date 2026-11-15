import { NextRequest, NextResponse } from "next/server";
import { getTenantCrmService } from "@mocter/domain";
import { resolveTenantSession } from "@/lib/tenant-auth";
import { handle } from "@/lib/errors/route";
import { mapDomainErrorToProblem, resolveRequestId } from "@/app/api/tenant/contacts/_shared";

/**
 * `PATCH /api/tenant/contacts/[id]/consents/[consentId]/revoke` — Revoca un consentimiento Ley 1581 vigente (`SPEC-09`).
 */
export const PATCH = handle(
  async (
    req: NextRequest,
    { params }: { params: Promise<{ id: string; consentId: string }> },
  ) => {
    const requestId = resolveRequestId(req);
    const auth = await resolveTenantSession(req);
    if (!auth.ok) {
      return auth.response;
    }

    const { consentId } = await params;
    const actor = auth.context.user?.email || auth.clientId;
    const service = getTenantCrmService();
    const revokedRes = await service.revokeConsent(auth.clientId, consentId, actor);

    if (!revokedRes.ok) {
      return mapDomainErrorToProblem(req, requestId, revokedRes);
    }

    return NextResponse.json(
      { ok: true, data: revokedRes.data },
      { status: 200, headers: { "x-request-id": requestId } },
    );
  },
);
