import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  appLogger,
  tenantAiSettingsService,
  type SupportedLlmProviderCode,
} from "@mocter/domain";
import { handle } from "@/lib/errors/route";
import { resolveTenantSession } from "@/lib/tenant-auth";

const PROVIDER_SLUG_REGEX = /^[a-z0-9_-]{2,40}$/;

const saveSettingsSchema = z.object({
  providerCode: z
    .string()
    .trim()
    .toLowerCase()
    .regex(PROVIDER_SLUG_REGEX, "El código de proveedor no es válido."),
  modelId: z.string().min(1).optional().nullable(),
  apiKey: z.string().min(8, "La API Key debe tener al menos 8 caracteres.").optional().nullable(),
  temperature: z.coerce.number().min(0).max(2).optional(),
  maxTokens: z.coerce.number().int().min(64).max(32768).optional(),
  priorityRole: z.enum(["primary", "secondary", "standby"]).optional(),
  verifyImmediately: z.boolean().default(true),
});

function isTenantOwnerRole(role: string, effectiveRoles: string[] = []): boolean {
  const allowed = new Set(["tenant_owner", "tenancy_owner"]);
  return allowed.has(role) || effectiveRoles.some((r) => allowed.has(r));
}

function forbiddenOwnerResponse(pathname: string, requestId: string): NextResponse {
  return NextResponse.json(
    {
      type: "https://mocter.co/errors/forbidden",
      title: "Forbidden",
      status: 403,
      detail:
        "Permiso denegado: únicamente el propietario del comercio puede consultar o administrar llaves BYOK.",
      instance: pathname,
      reference: requestId,
    },
    {
      status: 403,
      headers: {
        "content-type": "application/problem+json",
        "x-request-id": requestId,
      },
    },
  );
}

function scheduleAfterLog(task: () => Promise<void>): void {
  try {
    after(async () => {
      try {
        await task();
      } catch (err: unknown) {
        appLogger.error("[TenantAiSettings] Error en tarea after()", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
  } catch {
    void task().catch(() => {});
  }
}

/**
 * Obtiene la configuración AI/BYOK del inquilino con claves enmascaradas (`apiKeyLast4`) y catálogo de proveedores/modelos.
 */
export const GET = handle(async (req: NextRequest) => {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const auth = await resolveTenantSession(req);
  if (!auth.ok) {
    return auth.response;
  }

  if (!isTenantOwnerRole(auth.context.role, auth.context.effectiveRoles)) {
    return forbiddenOwnerResponse(req.nextUrl.pathname, requestId);
  }

  const res = await tenantAiSettingsService.getSettingsOverview(auth.clientId);
  if (!res.ok) {
    return NextResponse.json(
      {
        type: "https://mocter.co/errors/ai-settings-error",
        title: "AI Settings Error",
        status: 422,
        detail: res.error,
        code: res.code,
        instance: req.nextUrl.pathname,
        reference: requestId,
      },
      {
        status: 422,
        headers: {
          "content-type": "application/problem+json",
          "x-request-id": requestId,
        },
      },
    );
  }

  return NextResponse.json(
    { ok: true, data: res.data },
    { status: 200, headers: { "x-request-id": requestId } },
  );
});

/**
 * Guarda o rota la API Key BYOK cifrada en AES-256-GCM y las preferencias de modelo del inquilino.
 */
export const PUT = handle(async (req: NextRequest) => {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const auth = await resolveTenantSession(req);
  if (!auth.ok) {
    return auth.response;
  }

  if (!isTenantOwnerRole(auth.context.role, auth.context.effectiveRoles)) {
    return forbiddenOwnerResponse(req.nextUrl.pathname, requestId);
  }

  const body = await req.json().catch(() => null);
  const parsed = saveSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        type: "https://mocter.co/errors/validation-error",
        title: "Validation Error",
        status: 400,
        detail: parsed.error.issues[0]?.message ?? "Datos de configuración AI inválidos.",
        errors: parsed.error.issues,
        instance: req.nextUrl.pathname,
        reference: requestId,
      },
      {
        status: 400,
        headers: {
          "content-type": "application/problem+json",
          "x-request-id": requestId,
        },
      },
    );
  }

  const result = await tenantAiSettingsService.saveSettings({
    clientId: auth.clientId,
    actorUserId: auth.context.user.id,
    actorRole: auth.context.role,
    actorEmail: auth.context.user.email,
    providerCode: parsed.data.providerCode,
    modelId: parsed.data.modelId,
    apiKey: parsed.data.apiKey,
    temperature: parsed.data.temperature,
    maxTokens: parsed.data.maxTokens,
    priorityRole: parsed.data.priorityRole,
    verifyImmediately: parsed.data.verifyImmediately,
  });

  if (!result.ok) {
    const status =
      result.code === "AI_PROVIDER_RATE_LIMIT"
        ? 429
        : result.code === "AI_UPSTREAM_ERROR"
          ? 502
          : 422;
    return NextResponse.json(
      {
        type: "https://mocter.co/errors/ai-settings-error",
        title: "AI Settings Error",
        status,
        detail: result.error,
        code: result.code,
        instance: req.nextUrl.pathname,
        reference: requestId,
      },
      {
        status,
        headers: {
          "content-type": "application/problem+json",
          "x-request-id": requestId,
        },
      },
    );
  }

  scheduleAfterLog(async () => {
    appLogger.info("tenant.ai.settings.updated", {
      requestId,
      clientId: auth.clientId,
      userId: auth.context.user.id,
      providerCode: result.data.providerCode,
      modelCode: result.data.selectedModelCode,
    });
  });

  return NextResponse.json(
    { ok: true, data: result.data },
    { status: 200, headers: { "x-request-id": requestId } },
  );
});

/**
 * Revoca mediante soft-delete la credencial BYOK del proveedor indicado o de todos los proveedores activos del inquilino.
 */
export const DELETE = handle(async (req: NextRequest) => {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const auth = await resolveTenantSession(req);
  if (!auth.ok) {
    return auth.response;
  }

  if (!isTenantOwnerRole(auth.context.role, auth.context.effectiveRoles)) {
    return forbiddenOwnerResponse(req.nextUrl.pathname, requestId);
  }

  const queryProvider = req.nextUrl.searchParams.get("providerCode");
  const body = await req.json().catch(() => ({}));
  const rawProvider =
    queryProvider ??
    (body && typeof body === "object" && "providerCode" in body
      ? (body as { providerCode?: unknown }).providerCode
      : undefined);

  let providerCode: SupportedLlmProviderCode | undefined;
  if (rawProvider !== undefined && rawProvider !== null && rawProvider !== "") {
    const parsedProv = z
      .string()
      .trim()
      .toLowerCase()
      .regex(PROVIDER_SLUG_REGEX, "El parámetro providerCode no es válido.")
      .safeParse(rawProvider);
    if (!parsedProv.success) {
      return NextResponse.json(
        {
          type: "https://mocter.co/errors/validation-error",
          title: "Validation Error",
          status: 400,
          detail: "El parámetro providerCode no es válido.",
          instance: req.nextUrl.pathname,
          reference: requestId,
        },
        {
          status: 400,
          headers: {
            "content-type": "application/problem+json",
            "x-request-id": requestId,
          },
        },
      );
    }
    providerCode = parsedProv.data;
  }

  const result = await tenantAiSettingsService.revokeSettings({
    clientId: auth.clientId,
    actorUserId: auth.context.user.id,
    actorRole: auth.context.role,
    actorEmail: auth.context.user.email,
    providerCode,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        type: "https://mocter.co/errors/ai-settings-error",
        title: "AI Settings Error",
        status: 422,
        detail: result.error,
        code: result.code,
        instance: req.nextUrl.pathname,
        reference: requestId,
      },
      {
        status: 422,
        headers: {
          "content-type": "application/problem+json",
          "x-request-id": requestId,
        },
      },
    );
  }

  scheduleAfterLog(async () => {
    appLogger.info("tenant.ai.settings.revoked", {
      requestId,
      clientId: auth.clientId,
      userId: auth.context.user.id,
      providerCode: providerCode ?? "all",
    });
  });

  return NextResponse.json(
    { ok: true, data: result.data },
    { status: 200, headers: { "x-request-id": requestId } },
  );
});
