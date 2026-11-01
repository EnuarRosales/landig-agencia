/**
 * Utilidades de cálculo y validación de contraste WCAG 2.2 AA en cliente y servidor (DSN-001 §9, ADM-001 RF-15.4).
 */

export interface ContrastValidationResult {
  valid: boolean;
  ratio: number;
  requiredRatio: number;
  message?: string;
}

/**
 * Calcula la luminancia relativa WCAG 2.x de un color hexadecimal `#RRGGBB`.
 */
export function calculateRelativeLuminance(hex: string): number {
  const clean = hex.replace("#", "").trim();
  if (clean.length !== 6) return 0;
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const toLinear = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Valida el ratio de contraste WCAG 2.2 AA entre dos colores hexadecimales.
 * Exige 4.5:1 para texto normal y 3.0:1 para elementos de interfaz.
 */
export function validateContrast(
  foregroundHex: string,
  backgroundHex: string,
  isNormalText: boolean = true,
): ContrastValidationResult {
  const lum1 = calculateRelativeLuminance(foregroundHex);
  const lum2 = calculateRelativeLuminance(backgroundHex);

  const brighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  const ratio = (brighter + 0.05) / (darker + 0.05);

  const requiredRatio = isNormalText ? 4.5 : 3.0;
  const roundedRatio = Math.round(ratio * 100) / 100;

  if (ratio < requiredRatio) {
    return {
      valid: false,
      ratio: roundedRatio,
      requiredRatio,
      message: `El ratio de contraste ${roundedRatio}:1 no cumple con la norma WCAG 2.2 AA (mínimo ${requiredRatio}:1).`,
    };
  }

  return {
    valid: true,
    ratio: roundedRatio,
    requiredRatio,
  };
}
