import { NextRequest, NextResponse } from "next/server";
import {
  appLogger,
  getTenantCrmService,
  type ContactSource,
  type ContactStage,
  type WhatsappWindowStatus,
} from "@mocter/domain";
import { resolveTenantSession } from "@/lib/tenant-auth";
import { handle } from "@/lib/errors/route";
import {
  createContactBodySchema,
  listContactsQuerySchema,
  mapDomainErrorToProblem,
  problemResponse,
  resolveRequestId,
} from "./_shared";

/**
 * `GET /api/tenant/contacts` — Lista paginada, filtrable y ordenable de contactos omnicanal con prioridad WhatsApp (`SPEC-09`).
 */
export const GET = handle(async (req: NextRequest) => {
  const requestId = resolveRequestId(req);
  const auth = await resolveTenantSession(req);
  if (!auth.ok) {
    return auth.response;
  }

  const rawParams = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsedQuery = listContactsQuerySchema.safeParse(rawParams);
  if (!parsedQuery.success) {
    return problemResponse(req, requestId, {
      status: 400,
      type: "https://mocter.co/errors/validation-error",
      title: "Validation Error",
      detail: parsedQuery.error.issues[0]?.message || "Parámetros de consulta inválidos.",
      issues: parsedQuery.error.issues,
    });
  }

  const q = parsedQuery.data;
  const service = getTenantCrmService();
  const listRes = await service.listContacts(auth.clientId, {
    query: q.query ?? q.q,
    stage: q.stage && q.stage !== "all" ? (q.stage as ContactStage) : undefined,
    source: q.source && q.source !== "all" ? (q.source as ContactSource) : undefined,
    channel: q.channel && q.channel !== "all" ? q.channel : undefined,
    whatsappWindow:
      q.whatsappWindow && q.whatsappWindow !== "all"
        ? (q.whatsappWindow as WhatsappWindowStatus)
        : undefined,
    minRating: q.minRating,
    page: q.page,
    limit: q.limit,
    sortBy: q.sortBy,
    sortDir: q.sortDir,
  });

  if (!listRes.ok) {
    return mapDomainErrorToProblem(req, requestId, listRes);
  }

  return NextResponse.json(
    { ok: true, data: listRes.data },
    { status: 200, headers: { "x-request-id": requestId } },
  );
});

/**
 * `POST /api/tenant/contacts` — Alta manual o multi-fuente de contacto verificando unicidad (`409`) y cuota (`SPEC-09`).
 */
export const POST = handle(async (req: NextRequest) => {
  const requestId = resolveRequestId(req);
  const auth = await resolveTenantSession(req);
  if (!auth.ok) {
    return auth.response;
  }

  const body = await req.json().catch(() => null);
  const parsed = createContactBodySchema.safeParse(body);
  if (!parsed.success) {
    return problemResponse(req, requestId, {
      status: 400,
      type: "https://mocter.co/errors/validation-error",
      title: "Validation Error",
      detail: parsed.error.issues[0]?.message || "Datos de contacto inválidos.",
      issues: parsed.error.issues,
    });
  }

  const actor = auth.context.user?.email || auth.clientId;
  const service = getTenantCrmService();
  const createdRes = await service.createContact(auth.clientId, {
    ...parsed.data,
    createdBy: actor,
  });

  if (!createdRes.ok) {
    appLogger.warn("[POST /api/tenant/contacts] Alta rechazada por regla de negocio", {
      requestId,
      clientId: auth.clientId,
      code: createdRes.code,
    });
    return mapDomainErrorToProblem(req, requestId, createdRes);
  }

  appLogger.info("[POST /api/tenant/contacts] Contacto creado", {
    requestId,
    clientId: auth.clientId,
    contactId: createdRes.data.id,
    source: createdRes.data.source,
  });

  return NextResponse.json(
    { ok: true, data: createdRes.data },
    { status: 201, headers: { "x-request-id": requestId } },
  );
});
