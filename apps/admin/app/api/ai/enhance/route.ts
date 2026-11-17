import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  appLogger,
  createDefaultAiAssistService,
  defaultAiUsageEventRecorder,
  resolveAuthenticatedPortalContext,
  type AiAssistService,
  type AuthenticatedPortalContext,
  type SupportedLlmProviderCode,
} from "@mocter/domain";
import { env } from "@/env";
import { handle } from "@/lib/errors/route";

const enhanceRequestSchema = z.object({
  fieldKey: z.string().min(1, "fieldKey es obligatorio"),
  draft: z.string().min(1, "El borrador no puede estar vacío"),
  locale: z.enum(["es", "en"]).default("es"),
  context: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Sesión mínima autorizada para invocar la mejora asistida por AI (comercio, onboarding o administrador SaaS).
 */
export interface EnhanceAuthSession {
  userId: string;
  clientId: string | null;
  scope: "tenant" | "onboarding_prospect" | "platform";
  role: string;
}

/**
 * Dependencias inyectables opcionales para composición y pruebas unitarias del handler.
 */
export interface EnhanceRouteDeps {
  getAiAssistService?: () => AiAssistService;
  resolveSession?: (req: NextRequest) => Promise<EnhanceAuthSession | null>;
  recordUsage?: typeof defaultAiUsageEventRecorder.record;
  scheduleAfter?: (task: () => Promise<void>) => void;
}

/**
 * Ejecuta una tarea asíncrona en Next.js `after()` con respaldo seguro en entorno de pruebas.
 *
 * @param task - Función asíncrona de auditoría y registro no bloqueante.
 */
function defaultScheduleAfter(task: () => Promise<void>): void {
  try {
    after(async () => {
      try {
        await task();
      } catch (err: unknown) {
        appLogger.error("[ApiEnhance] Error en tarea diferida after()", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
  } catch {
    void task().catch((err: unknown) => {
      appLogger.error("[ApiEnhance] Error en auditoría de respaldo fuera de request scope", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }
}

/**
 * Resuelve la sesión autenticada desde cookie `mocter_sid` admitiendo `tenant` y `onboarding_prospect`.
 *
 * @param req - Solicitud HTTP entrante.
 * @returns Sesión autoritativa o `null` si no existe sesión válida.
 */
async function defaultResolveSession(req: NextRequest): Promise<EnhanceAuthSession | null> {
  const isProduction = env.NODE_ENV === "production";
  const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
  const sid = (req.cookies.get(sidCookieName)?.value || req.cookies.get("mocter_sid")?.value)?.trim();

  if (!sid) {
    return null;
  }

  const context: AuthenticatedPortalContext | null =
    await resolveAuthenticatedPortalContext(sid);
  if (!context || !context.user) {
    return null;
  }

  if (context.scope === "platform") {
    const isPlatformAdmin =
      context.role === "platform_owner" ||
      context.role === "platform_admin" ||
      Boolean(context.effectiveRoles?.includes("platform_owner")) ||
      Boolean(context.effectiveRoles?.includes("platform_admin"));
    if (!isPlatformAdmin) {
      return null;
    }
    return {
      userId: context.user.id,
      clientId: null,
      scope: "platform",
      role: context.role,
    };
  }

  if (context.scope !== "tenant" && context.scope !== "onboarding_prospect") {
    return null;
  }

  return {
    userId: context.user.id,
    clientId: context.activeClient?.id ?? context.activeClientId ?? null,
    scope: context.scope,
    role: context.role,
  };
}

function mapEnhanceErrorStatus(code?: string): { status: number; title: string; type: string } {
  switch (code) {
    case "EMPTY_DRAFT":
    case "FIELD_NOT_ASSISTED":
      return {
        status: 400,
        title: "Validation Error",
        type: "https://mocter.co/errors/validation-error",
      };
    case "RATE_LIMIT_EXCEEDED":
    case "AI_RATE_LIMIT_EXCEEDED":
    case "AI_PROVIDER_RATE_LIMIT":
      return {
        status: 429,
        title: "Too Many Requests",
        type: "https://mocter.co/errors/rate-limit-exceeded",
      };
    case "AI_UPSTREAM_ERROR":
    case "INFERENCE_ERROR":
      return {
        status: 502,
        title: "Bad Gateway",
        type: "https://mocter.co/errors/ai-upstream-error",
      };
    case "AI_BYOK_REQUIRED":
    case "AI_PLATFORM_KEY_MISSING":
    case "AI_KEY_INVALID":
    case "AI_MASTER_PROMPT_MISSING":
    default:
      return {
        status: 422,
        title: "AI Inference Blocked",
        type: "https://mocter.co/errors/ai-assist-blocked",
      };
  }
}

/**
 * Construye el Route Handler `POST /api/ai/enhance` siguiendo SPEC-02, RFC 9457 y auditoría con `after()`.
 *
 * @param deps - Dependencias inyectables opcionales para composición o pruebas aisladas.
 * @returns Manejador HTTP envuelto en `handle()`.
 */
export function createEnhanceRouteHandler(deps?: EnhanceRouteDeps) {
  const resolveSession = deps?.resolveSession ?? defaultResolveSession;
  const recordUsage =
    deps?.recordUsage ?? ((ev) => defaultAiUsageEventRecorder.record(ev));
  const scheduleAfter = deps?.scheduleAfter ?? defaultScheduleAfter;
  const getService =
    deps?.getAiAssistService ??
    (() =>
      createDefaultAiAssistService({
        usageRecorder: {
          record: async (ev) => {
            scheduleAfter(async () => {
              await recordUsage(ev);
            });
          },
        },
      }));

  return handle(async (req: NextRequest) => {
    const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
    const session = await resolveSession(req);

    if (!session) {
      return NextResponse.json(
        {
          type: "https://mocter.co/errors/unauthorized",
          title: "Unauthorized",
          status: 401,
          detail: "Debes iniciar sesión para usar la asistencia con Inteligencia Artificial.",
          instance: req.nextUrl.pathname,
          reference: requestId,
        },
        {
          status: 401,
          headers: {
            "content-type": "application/problem+json",
            "x-request-id": requestId,
          },
        },
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = enhanceRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          type: "https://mocter.co/errors/validation-error",
          title: "Validation Error",
          status: 400,
          detail:
            parsed.error.issues[0]?.message ??
            "La carga útil de la solicitud no cumple con los tipos requeridos.",
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

    const input = parsed.data;
    const aiAssistService = getService();

    const result = await aiAssistService.enhanceText({
      clientId: session.clientId,
      userId: session.userId,
      isPlatformScope: session.scope === "platform",
      fieldKey: input.fieldKey,
      draft: input.draft,
      locale: input.locale,
      context: input.context,
      requestId,
    });

    if (!result.ok) {
      const mapped = mapEnhanceErrorStatus(result.code);
      const normalizedCode =
        result.code === "RATE_LIMIT_EXCEEDED" ? "AI_RATE_LIMIT_EXCEEDED" : result.code;
      appLogger.warn("[POST /api/ai/enhance] Inferencia rechazada", {
        requestId,
        clientId: session.clientId,
        userId: session.userId,
        fieldKey: input.fieldKey,
        errorCode: normalizedCode,
        status: mapped.status,
      });

      const responseHeaders: Record<string, string> = {
        "content-type": "application/problem+json",
        "x-request-id": requestId,
      };
      if (mapped.status === 429) {
        const retryMatch = result.error.match(/(\d+)\s*segundos?/i);
        responseHeaders["retry-after"] = retryMatch?.[1] ?? "60";
      }

      return NextResponse.json(
        {
          type: mapped.type,
          title: mapped.title,
          status: mapped.status,
          detail: result.error,
          code: normalizedCode,
          instance: req.nextUrl.pathname,
          reference: requestId,
        },
        {
          status: mapped.status,
          headers: responseHeaders,
        },
      );
    }

    const data = result.data;

    scheduleAfter(async () => {
      if (!data.usageRecorded && data.providerId && data.modelId && data.billingMode) {
        await recordUsage({
          clientId: session.clientId,
          providerId: data.providerId,
          modelId: data.modelId,
          mode: data.billingMode,
          purpose: data.credentialSource === "platform_trial" ? "trial" : "assist",
          inputTokens: data.inputTokens,
          outputTokens: data.outputTokens,
          fieldKey: data.fieldKey,
          requestId,
          latencyMs: data.latencyMs,
          status: "success",
        });
      }

      appLogger.info("ai.enhance.completed", {
        requestId,
        clientId: session.clientId,
        userId: session.userId,
        fieldKey: data.fieldKey,
        promptVersion: data.promptVersion,
        provider: (data.providerUsed as SupportedLlmProviderCode | undefined) ?? "unknown",
        model: data.modelUsed,
        credentialSource: data.credentialSource ?? "byok",
        failoverUsed: Boolean(data.failoverUsed),
        inputTokens: data.inputTokens,
        outputTokens: data.outputTokens,
        latencyMs: data.latencyMs ?? 0,
      });
    });

    const mode: "trial" | "byok" =
      data.credentialSource === "platform_trial" ? "trial" : "byok";

    return NextResponse.json(
      {
        ok: true,
        data: {
          fieldKey: data.fieldKey,
          promptVersion: data.promptVersion,
          draft: data.draft,
          suggestion: data.suggestion,
          inputTokens: data.inputTokens,
          outputTokens: data.outputTokens,
          mode,
          providerCode: data.providerUsed,
          modelUsed: data.modelUsed,
          providerUsed: data.providerUsed,
          credentialSource: data.credentialSource,
          failoverUsed: Boolean(data.failoverUsed),
          requestId,
        },
      },
      {
        status: 200,
        headers: { "x-request-id": requestId },
      },
    );
  });
}

/**
 * Endpoint productivo `POST /api/ai/enhance` para mejorar borradores de formularios con AI real.
 */
export const POST = createEnhanceRouteHandler();
