import type { ErrorCode } from './result';

/**
 * Mapeo canónico entre códigos de error de la plataforma y códigos de estado HTTP (RFC 9457).
 */
export const HTTP_STATUS: Readonly<Record<ErrorCode, number>> = {
  VALIDATION: 400,
  BUSINESS_RULE: 422,
  CONFLICT: 409,
  NOT_FOUND: 404,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  RATE_LIMITED: 429,
  UNAVAILABLE: 503,
  INTERNAL: 500,
};
