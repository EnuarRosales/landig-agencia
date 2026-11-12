import { NextResponse, type NextRequest } from "next/server";
import { appLogger } from "@mocter/domain";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "HttpError";
  }
}

interface ErrorWithStatus {
  status?: number;
  digest?: string;
  message?: string;
}

/**
 * Envoltorio canónico para Route Handlers conforme a RFC 9457 Problem Details (AGENTS.md §4.14).
 */
export function handle<C = unknown>(
  fn: (req: NextRequest, ctx: C) => Promise<Response>,
): (req: NextRequest, ctx?: C) => Promise<Response> {
  return async (req: NextRequest, ctx?: C) => {
    const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
    try {
      return await fn(req, ctx as C);
    } catch (e: unknown) {
      // Re-lanzar redirecciones internas de Next.js si ocurriesen
      const errObj = typeof e === "object" && e !== null ? (e as ErrorWithStatus) : null;
      const digest = errObj?.digest;
      const isNextControl = typeof digest === "string" && digest.startsWith("NEXT_");

      if (isNextControl) {
        throw e;
      }

      const msg = e instanceof Error ? e.message : "Error interno al procesar la solicitud.";
      const status = typeof errObj?.status === "number" ? errObj.status : 500;

      if (status >= 500) {
        appLogger.error(`[Route Error] ${msg}`, e, {
          requestId,
          path: req.nextUrl.pathname,
        });
      } else {
        appLogger.warn(`[Route Warning] ${msg}`, {
          requestId,
          path: req.nextUrl.pathname,
          status,
        });
      }

      return NextResponse.json(
        {
          type: "about:blank",
          title:
            status === 400
              ? "BAD_REQUEST"
              : status === 401
                ? "UNAUTHORIZED"
                : status === 403
                  ? "FORBIDDEN"
                  : status === 404
                    ? "NOT_FOUND"
                    : "INTERNAL_ERROR",
          status,
          detail: msg,
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
  };
}
