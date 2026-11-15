import { describe, expect, it } from "vitest";
import { calculateProductProfitability } from "./pricing-margin";

describe("calculateProductProfitability", () => {
  it("calculates positive profit, margin percentage over sale price, and markup over cost", () => {
    const result = calculateProductProfitability(60_000_00, 100_000_00);
    expect(result).toEqual({
      profitCents: 40_000_00,
      marginPct: 40,
      markupPct: 66.67,
      isNegative: false,
    });
  });

  it("returns null markup when cost is zero", () => {
    const result = calculateProductProfitability(0, 50_000_00);
    expect(result).toEqual({
      profitCents: 50_000_00,
      marginPct: 100,
      markupPct: null,
      isNegative: false,
    });
  });

  it("flags negative profitability when cost exceeds sale price", () => {
    const result = calculateProductProfitability(120_000_00, 90_000_00);
    expect(result).toEqual({
      profitCents: -30_000_00,
      marginPct: -33.33,
      markupPct: -25,
      isNegative: true,
    });
  });

  it("handles zero sale price safely without division by zero", () => {
    const result = calculateProductProfitability(10_000_00, 0);
    expect(result).toEqual({
      profitCents: -10_000_00,
      marginPct: 0,
      markupPct: -100,
      isNegative: true,
    });
  });
});
