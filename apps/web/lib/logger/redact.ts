/**
 * Rutas de propiedades de objetos JSON que deben ser censuradas antes de ser emitidas (Regla 4.13).
 */
export const REDACT_PATHS: readonly string[] = [
  'password',
  '*.password',
  'currentPassword',
  'newPassword',
  'token',
  '*.token',
  'accessToken',
  'refreshToken',
  'authorization',
  'headers.authorization',
  'headers.cookie',
  'cookie',
  '*.secret',
  'secret',
  'pepper',
  'creditCard',
  'cardNumber',
  'cvv',
];
