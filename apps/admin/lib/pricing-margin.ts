export interface ProductProfitabilitySummary {
  profitCents: number;
  marginPct: number;
  markupPct: number | null;
  isNegative: boolean;
}

/**
 * Espejo puro para componentes cliente (`"use client"`) del cálculo de rentabilidad
 * definido en `@mocter/domain/utils/pricing-margin` (`SPEC-06 §3`).
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
