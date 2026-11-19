import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  appLogger,
  resolveAuthenticatedPortalContext,
  resolveLocaleHierarchy,
  updateTenantUserPreferredLocale,
} from "@mocter/domain";
import { env } from "@/env";
import { handle } from "@/lib/errors/route";
import { problemResponse, readSessionToken } from "@/lib/billing-route-auth";

const updateLocaleSchema = z.object({
  locale: z
    .enum(["es", "en"], {
      message: "El idioma debe ser 'es' o 'en' (o null para usar el idioma del comercio).",
    })
    .nullable(),
});

/**
 * `PATCH /api/tenant/locale` · Actualiza la preferencia personal de idioma del usuario
 * (`cell_users.preferred_locale` + cookie `mocter_locale`) sin alterar `clients.locale` (`SPEC-17 §9.1`).
 */
export const PATCH = handle(async (req: NextRequest): Promise<NextResponse> => {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const sid = (await readSessionToken(req))?.trim();

  if (!sid) {
    return problemResponse(401, "Unauthorized", "Sesión no iniciada o token inexistente.", {
      typeSlug: "unauthorized",
    });
  }

  const context = await resolveAuthenticatedPortalContext(sid, {
    browserAcceptLanguage: req.headers.get("accept-language"),
    cookieLocale: req.cookies.get("mocter_locale")?.value ?? null,
  });

  if (!context || !context.user) {
    return problemResponse(401, "Unauthorized", "Sesión inválida o expirada.", {
      typeSlug: "unauthorized",
    });
  }

  const body = await req.json().catch(() => null);
  const parsed = updateLocaleSchema.safeParse(body);

  if (!parsed.success) {
    return problemResponse(
      400,
      "Validation Error",
      parsed.error.issues[0]?.message || "Parámetro de idioma inválido.",
      {
        typeSlug: "validation-error",
        code: "INVALID_LOCALE",
        errors: parsed.error.issues,
      },
    );
  }

  const requestedLocale = parsed.data.locale;

  if (context.activeClientId) {
    const updateRes = await updateTenantUserPreferredLocale({
      clientId: context.activeClientId,
      userId: context.user.id,
      locale: requestedLocale,
      actor: context.user.email,
    });

    if (!updateRes.ok) {
      return problemResponse(500, "Locale Update Error", updateRes.error, {
        typeSlug: "locale-update-error",
        code: updateRes.code,
      });
    }
  }

  const effectiveLocale = resolveLocaleHierarchy({
    userPreferredLocale: requestedLocale,
    tenantLocale: context.activeClient?.locale ?? null,
    browserAcceptLanguage: req.headers.get("accept-language"),
  });

  appLogger.info("tenant.locale.updated", {
    requestId,
    clientId: context.activeClientId,
    userId: context.user.id,
    role: context.role,
    preferredLocale: requestedLocale,
    effectiveLocale,
  });

  const response = NextResponse.json(
    {
      ok: true,
      data: {
        locale: effectiveLocale,
        preferredLocale: requestedLocale,
      },
    },
    {
      status: 200,
      headers: {
        "x-request-id": requestId,
        "x-mocter-locale": effectiveLocale,
      },
    },
  );

  if (requestedLocale === null) {
    response.cookies.delete("mocter_locale");
  } else {
    response.cookies.set("mocter_locale", requestedLocale, {
      path: "/",
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  return response;
});
