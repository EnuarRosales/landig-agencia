import { describe, expect, it } from "vitest";
import { PeriodResolver } from "./period-resolver";

describe("REP-001 T-03 · PeriodResolver", () => {
  it("resuelve período diario con límites exactos y período previo correspondiente", () => {
    const res = PeriodResolver.resolve("daily");
    expect(res.periodType).toBe("daily");
    expect(res.current.start.getHours()).toBe(0);
    expect(res.current.end.getHours()).toBe(23);

    const diffDays =
      (res.current.start.getTime() - res.previous.start.getTime()) / (1000 * 60 * 60 * 24);
    expect(Math.round(diffDays)).toBe(1);
  });

  it("resuelve período mensual de primer a último día del mes", () => {
    const res = PeriodResolver.resolve("monthly");
    expect(res.current.start.getDate()).toBe(1);

    // El día previo debe ser el mes anterior
    expect(res.previous.start.getDate()).toBe(1);
    expect(res.previous.end.getDate()).toBeGreaterThanOrEqual(28);
  });

  it("rechaza rango personalizado si start_date es posterior a end_date", () => {
    expect(() =>
      PeriodResolver.resolve("custom", {
        startDate: "2026-10-31",
        endDate: "2026-10-01",
      }),
    ).toThrow("La fecha inicial no puede ser posterior a la fecha final");
  });

  it("calcula delta porcentual correctamente", () => {
    expect(PeriodResolver.calculateDelta(150, 100)).toBe(50);
    expect(PeriodResolver.calculateDelta(80, 100)).toBe(-20);
    expect(PeriodResolver.calculateDelta(10, 0)).toBe(100);
    expect(PeriodResolver.calculateDelta(0, 0)).toBe(0);
  });
});

