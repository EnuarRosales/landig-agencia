/**
 * Resultado del cálculo de rentabilidad unitaria para un producto (`SPEC-06 §2.3`, `SPEC-08`).
 */
export interface ProductProfitabilitySummary {
  /** Utilidad unitaria en centavos (`salePriceCents - costCents`). Puede ser negativa si vende bajo costo. */
  profitCents: number;
  /** Porcentaje de margen bruto sobre el precio de venta (`profitCents / salePriceCents * 100`), redondeado a 2 decimales. */
  marginPct: number;
  /** Porcentaje de incremento sobre el costo (`profitCents / costCents * 100`), o `null` cuando el costo es cero o negativo. */
  markupPct: number | null;
  /** Indica si la operación arroja pérdida (`profitCents < 0`). */
  isNegative: boolean;
}

/**
 * Calcula utilidad neta, margen sobre venta y markup sobre costo en centavos.
 *
 * Se mantiene como función pura sin dependencias de Node/BD para compartir exactitud
 * matemática entre validaciones del dominio, el onboarding y vistas de catálogo.
 */
export function calculateProductProfitability(
  costCents: number,
  salePriceCents: number,
): ProductProfitabilitySummary {
  const normalizedCost = Number.isFinite(costCents) ? Math.round(costCents) : 0;
  const normalizedSale = Number.isFinite(salePriceCents) ? Math.round(salePriceCents) : 0;
  const profitCents = normalizedSale - normalizedCost;
  const marginPct =
    normalizedSale > 0 ? Math.round((profitCents / normalizedSale) * 10000) / 100 : 0;
  const markupPct =
    normalizedCost > 0 ? Math.round((profitCents / normalizedCost) * 10000) / 100 : null;

  return {
    profitCents,
    marginPct,
    markupPct,
    isNegative: profitCents < 0,
  };
}
