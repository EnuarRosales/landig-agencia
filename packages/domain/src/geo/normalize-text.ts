/**
 * Utilidades puras de normalización textual para búsquedas y homologación geográfica.
 */

/**
 * Normaliza un texto geográfico eliminando diacríticos, signos auxiliares y espacios redundantes.
 *
 * @param value - Cadena original ingresada por usuario o adaptador externo.
 * @returns Texto en minúsculas sin tildes ni espacios múltiples.
 */
export function normalizeGeoText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.,;:/\\_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
