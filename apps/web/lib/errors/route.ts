import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { isAppError } from './app-error';
import { HTTP_STATUS } from './http-status';
import { logger } from '@/lib/logger';
import { serializeError } from '@/lib/logger/serialize-error';

type Handler<C = unknown> = (req: NextRequest, ctx: C) => Promise<Response>;

/**
 * Envoltorio de seguridad y control de excepciones para Route Handlers (Regla 4.14).
 *
 * Captura excepciones no manejadas, formatea la respuesta bajo el estándar RFC 9457
 * (`application/problem+json`), registra fallos del servidor (5xx) con el logger estructurado
 * y propaga el `x-request-id` de correlación.
 *
 * @param fn - Función del endpoint HTTP a envolver.
 * @returns Función protegida compatible con las convenciones de Route Handlers de Next.js.
 */
export function handle<C = unknown>(fn: Handler<C>): Handler<C> {
  return async (req: NextRequest, ctx: C) => {
    const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
    try {
      return await fn(req, ctx);
    } catch (e: unknown) {
      // Si la excepción es una interrupción oficial de navegación de Next.js (redirect o notFound)
      if (
        e &&
        typeof e === 'object' &&
        'digest' in e &&
        typeof (e as { digest?: unknown }).digest === 'string' &&
        (e as { digest: string }).digest.startsWith('NEXT_')
      ) {
        throw e;
      }

      const known = isAppError(e);
      const code = known ? e.code : 'INTERNAL';
      const status = HTTP_STATUS[code];

      if (status >= 500) {
        logger.error({
          event: 'route.unhandled_error',
          requestId,
          path: req.nextUrl.pathname,
          err: serializeError(e),
        });
      }

      return NextResponse.json(
        {
          type: 'about:blank',
          title: code,
          status,
          detail: known && e.expose ? e.message : 'No fue posible procesar la solicitud.',
          instance: req.nextUrl.pathname,
          reference: requestId,
        },
        {
          status,
          headers: {
            'content-type': 'application/problem+json',
            'x-request-id': requestId,
          },
        },
      );
    }
  };
}
