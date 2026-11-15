import { NextRequest, NextResponse } from "next/server";
import { getTenantCrmService } from "@mocter/domain";
import { resolveTenantSession } from "@/lib/tenant-auth";
import { handle } from "@/lib/errors/route";
import {
  mapDomainErrorToProblem,
  problemResponse,
  recordConsentBodySchema,
  resolveRequestId,
} from "@/app/api/tenant/contacts/_shared";

/**
 * `POST /api/tenant/contacts/[id]/consents` — Otorga consentimiento explícito Ley 1581 desde el workspace (`SPEC-09`).
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
    const parsed = recordConsentBodySchema.safeParse(body);
    if (!parsed.success) {
      return problemResponse(req, requestId, {
        status: 400,
        type: "https://mocter.co/errors/validation-error",
        title: "Validation Error",
        detail: parsed.error.issues[0]?.message || "Datos de consentimiento inválidos.",
        issues: parsed.error.issues,
      });
    }

    const actor = auth.context.user?.email || auth.clientId;
    const service = getTenantCrmService();
    const consentRes = await service.recordConsent(auth.clientId, {
      prospectId: id,
      purpose: parsed.data.purpose,
      channel: parsed.data.channel,
      evidenceRef: parsed.data.evidenceRef ?? null,
      policyVersion: parsed.data.policyVersion,
      createdBy: actor,
    });

    if (!consentRes.ok) {
      return mapDomainErrorToProblem(req, requestId, consentRes);
    }

    return NextResponse.json(
      { ok: true, data: consentRes.data },
      { status: 201, headers: { "x-request-id": requestId } },
    );
  },
);
