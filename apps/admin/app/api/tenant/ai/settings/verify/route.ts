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

const verifyBodySchema = z
  .object({
    providerCode: z
      .string()
      .trim()
      .toLowerCase()
      .regex(PROVIDER_SLUG_REGEX, "Parámetro providerCode inválido.")
      .optional(),
  })
  .optional();

function isTenantOwnerRole(role: string, effectiveRoles: string[] = []): boolean {
  const allowed = new Set(["tenant_owner", "tenancy_owner"]);
  return allowed.has(role) || effectiveRoles.some((r) => allowed.has(r));
}

function scheduleAfterLog(task: () => Promise<void>): void {
  try {
    after(async () => {
      try {
        await task();
      } catch (err: unknown) {
        appLogger.error("[TenantAiVerify] Error en tarea after()", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
  } catch {
    void task().catch(() => {});
  }
}

/**
 * Ejecuta una prueba activa de conectividad y validez sobre la API Key BYOK ya almacenada del inquilino.
 */
export const POST = handle(async (req: NextRequest) => {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const auth = await resolveTenantSession(req);
  if (!auth.ok) {
    return auth.response;
  }

  if (!isTenantOwnerRole(auth.context.role, auth.context.effectiveRoles)) {
    return NextResponse.json(
      {
        type: "https://mocter.co/errors/forbidden",
        title: "Forbidden",
        status: 403,
        detail:
          "Permiso denegado: únicamente el propietario del comercio puede verificar credenciales BYOK.",
        instance: req.nextUrl.pathname,
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

  const rawBody = await req.json().catch(() => ({}));
  const parsed = verifyBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        type: "https://mocter.co/errors/validation-error",
        title: "Validation Error",
        status: 400,
        detail: "Parámetro providerCode inválido.",
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

  const result = await tenantAiSettingsService.verifyStoredKey({
    clientId: auth.clientId,
    actorUserId: auth.context.user.id,
    actorRole: auth.context.role,
    actorEmail: auth.context.user.email,
    providerCode: parsed.data?.providerCode as SupportedLlmProviderCode | undefined,
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
        type: "https://mocter.co/errors/ai-verification-failed",
        title: "AI Key Verification Failed",
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
    appLogger.info("tenant.ai.settings.verified", {
      requestId,
      clientId: auth.clientId,
      userId: auth.context.user.id,
      providerCode: result.data.providerCode,
      latencyMs: result.data.latencyMs,
    });
  });

  return NextResponse.json(
    { ok: true, data: result.data },
    { status: 200, headers: { "x-request-id": requestId } },
  );
});
