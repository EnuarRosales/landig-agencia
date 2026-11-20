import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  appLogger,
  getCommunitiesGovernanceService,
  getCommunityFeedService,
} from "@mocter/domain";
import { requirePlatformAdmin } from "@/lib/billing-route-auth";
import { handle } from "@/lib/errors/route";

const PROBLEM_CONTENT_TYPE = "application/problem+json";

function adminProblemJson(
  req: NextRequest,
  requestId: string,
  status: number,
  title: string,
  detail: string,
  code?: string,
): NextResponse {
  return NextResponse.json(
    {
      type: `https://mocter.co/errors/${code ? code.toLowerCase().replace(/_/g, "-") : "bad-request"}`,
      title,
      status,
      detail,
      ...(code ? { code } : {}),
      instance: req.nextUrl.pathname,
      reference: requestId,
    },
    {
      status,
      headers: {
        "Content-Type": PROBLEM_CONTENT_TYPE,
        "x-request-id": requestId,
      },
    },
  );
}

const adminCommunityActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("review_leader"),
    clientId: z.string().uuid("Identificador de comercio inválido."),
    decision: z.enum(["approve", "reject", "revoke", "approved", "rejected", "revoked"]),
    maxOwnedCommunities: z.number().int().min(1).max(1000).nullable().optional(),
    reviewNotes: z.string().max(1000).nullable().optional(),
  }),
  z.object({
    action: z.literal("set_org_status"),
    organizationId: z.string().uuid("Identificador de comunidad inválido."),
    status: z.enum(["active", "suspended"]),
  }),
  z.object({
    action: z.literal("update_retention_settings"),
    feedRetentionDays: z.number().int().min(1).max(3650).nullable(),
  }),
  z.object({
    action: z.literal("run_retention_purge"),
  }),
]);

/**
 * `GET /api/admin/communities` — Gobierno global de solicitudes de líderes, cupos de comunidades y directorio administrativo (`SPEC-15-D03`).
 */
export const GET = handle(async (req: NextRequest): Promise<NextResponse> => {
  const requestId = req.headers.get("x-request-id")?.trim() || crypto.randomUUID();
  await requirePlatformAdmin(req, "gestionar comunidades y líderes");

  const service = getCommunitiesGovernanceService();
  const res = await service.getAdminOverview();
  if (!res.ok) {
    return adminProblemJson(req, requestId, 500, "Internal Error", res.error, res.code);
  }

  return NextResponse.json(
    { ok: true, data: res.data },
    { status: 200, headers: { "x-request-id": requestId } },
  );
});

/**
 * `POST /api/admin/communities` — Aprueba/rechaza/revoca líderes o suspende/reactiva comunidades desde consola de plataforma (`SPEC-15-D03`).
 */
export const POST = handle(async (req: NextRequest): Promise<NextResponse> => {
  const requestId = req.headers.get("x-request-id")?.trim() || crypto.randomUUID();
  const context = await requirePlatformAdmin(req, "autorizar líderes y supervisar comunidades");

  const rawBody = await req.json().catch(() => null);
  const parsed = adminCommunityActionSchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminProblemJson(
      req,
      requestId,
      400,
      "Validation Error",
      parsed.error.issues[0]?.message || "Cuerpo de solicitud inválido.",
      "VALIDATION_ERROR",
    );
  }

  const service = getCommunitiesGovernanceService();

  if (parsed.data.action === "review_leader") {
    const mappedAction =
      parsed.data.decision === "approved" || parsed.data.decision === "approve"
        ? "approve"
        : parsed.data.decision === "rejected" || parsed.data.decision === "reject"
          ? "reject"
          : "revoke";

    const res = await service.reviewLeaderAuthorization({
      clientId: parsed.data.clientId,
      action: mappedAction,
      reviewedByUserId: context.user.id,
      maxOwnedCommunities: parsed.data.maxOwnedCommunities,
      reviewNotes: parsed.data.reviewNotes,
    });
    if (!res.ok) {
      const status = (res.code ?? "").includes("NOT_FOUND") ? 404 : 400;
      return adminProblemJson(req, requestId, status, "Operation Failed", res.error, res.code);
    }

    appLogger.info("[API /api/admin/communities] Autorización de líder revisada", {
      requestId,
      clientId: parsed.data.clientId,
      decision: parsed.data.decision,
      actorUserId: context.user.id,
    });

    return NextResponse.json(
      { ok: true, data: res.data },
      { status: 200, headers: { "x-request-id": requestId } },
    );
  }

  if (parsed.data.action === "update_retention_settings") {
    const res = await getCommunityFeedService().updateRetentionSettings({
      feedRetentionDays: parsed.data.feedRetentionDays,
      actorUserId: context.user.id,
    });
    if (!res.ok) {
      return adminProblemJson(req, requestId, 400, "Operation Failed", res.error, res.code);
    }

    appLogger.info("[API /api/admin/communities] Retención de muro actualizada", {
      requestId,
      feedRetentionDays: parsed.data.feedRetentionDays,
      actorUserId: context.user.id,
    });

    return NextResponse.json(
      { ok: true, data: res.data },
      { status: 200, headers: { "x-request-id": requestId } },
    );
  }

  if (parsed.data.action === "run_retention_purge") {
    const res = await getCommunityFeedService().purgeExpiredPosts({
      actorUserId: context.user.id,
    });
    if (!res.ok) {
      return adminProblemJson(req, requestId, 500, "Operation Failed", res.error, res.code);
    }

    appLogger.info("[API /api/admin/communities] Purga de retención ejecutada", {
      requestId,
      ...res.data,
      actorUserId: context.user.id,
    });

    return NextResponse.json(
      { ok: true, data: res.data },
      { status: 200, headers: { "x-request-id": requestId } },
    );
  }

  const res = await service.setOrganizationPlatformStatus({
    organizationId: parsed.data.organizationId,
    status: parsed.data.status,
    actorUserId: context.user.id,
  });
  if (!res.ok) {
    const status = (res.code ?? "").includes("NOT_FOUND") ? 404 : 400;
    return adminProblemJson(req, requestId, status, "Operation Failed", res.error, res.code);
  }

  appLogger.info("[API /api/admin/communities] Estado de comunidad actualizado por plataforma", {
    requestId,
    organizationId: parsed.data.organizationId,
    status: parsed.data.status,
    actorUserId: context.user.id,
  });

  return NextResponse.json(
    { ok: true, data: res.data },
    { status: 200, headers: { "x-request-id": requestId } },
  );
});
