import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combina clases CSS condicionales resolviendo conflictos de utilidades Tailwind v4.
 *
 * @param inputs - Lista de valores de clase compatibles con `clsx`.
 * @returns Cadena de clases normalizada sin colisiones.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
