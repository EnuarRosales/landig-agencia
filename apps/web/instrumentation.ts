import type { Instrumentation } from 'next';

/**
 * Inicialización única por instancia de servidor Next.js 16 (Regla 4.13).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Inicializar sonda periódica liviana de 60s si está habilitada o en producción (CEL-RF-014)
    if (process.env.ENABLE_CELL_PROBE === "true") {
      const { startCellPeriodicProbe } = await import("@mocter/domain");
      startCellPeriodicProbe(60_000);
    }
  }
}

/**
 * Captura unificada de errores no controlados de servidor (render, route, action, proxy).
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }

  const [{ logger }, { serializeError }] = await Promise.all([
    import('@/lib/logger'),
    import('@/lib/logger/serialize-error'),
  ]);

  const rawRequestId = request.headers['x-request-id'];
  const requestId = Array.isArray(rawRequestId)
    ? rawRequestId[0]
    : rawRequestId ?? crypto.randomUUID();

  logger.error({
    event: 'request.unhandled_error',
    requestId,
    err: serializeError(error),
    method: request.method,
    path: request.path,
    routerKind: context.routerKind,
    routePath: context.routePath,
    routeType: context.routeType,
    renderSource: context.renderSource,
    revalidateReason: context.revalidateReason,
  });
};
