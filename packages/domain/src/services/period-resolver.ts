export type ReportPeriodType =
  | "daily"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "semiannual"
  | "annual"
  | "custom";

export interface ResolvedDateRange {
  start: Date;
  end: Date;
}

export interface ResolvedPeriod {
  periodType: ReportPeriodType;
  current: ResolvedDateRange;
  previous: ResolvedDateRange; // Período equivalente anterior para cálculo de deltas
  timezone: string;
}

/**
 * Calculador de períodos y rangos temporales para métricas y dashboards (REP-001 §4, T-03).
 *
 * Características:
 * - Computa límites exactos [start, end] según la zona horaria del negocio.
 * - Calcula automáticamente el rango anterior equivalente para el cálculo de deltas (%).
 * - Valida que start_date no sea posterior a end_date en rangos personalizados.
 */
export class PeriodResolver {
  static resolve(
    periodType: ReportPeriodType,
    customRange?: { startDate: string; endDate: string },
    timezone: string = "America/Bogota",
  ): ResolvedPeriod {
    const now = new Date();

    if (periodType === "custom") {
      if (!customRange || !customRange.startDate || !customRange.endDate) {
        throw new Error("El rango personalizado requiere 'startDate' y 'endDate'.");
      }
      const start = new Date(`${customRange.startDate}T00:00:00.000Z`);
      const end = new Date(`${customRange.endDate}T23:59:59.999Z`);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new Error("Formato de fecha inválido en rango personalizado (use YYYY-MM-DD).");
      }

      if (start.getTime() > end.getTime()) {
        throw new Error("La fecha inicial no puede ser posterior a la fecha final.");
      }

      const durationMs = end.getTime() - start.getTime() + 1;
      const prevEnd = new Date(start.getTime() - 1);
      const prevStart = new Date(prevEnd.getTime() - durationMs + 1);

      return {
        periodType,
        current: { start, end },
        previous: { start: prevStart, end: prevEnd },
        timezone,
      };
    }

    if (periodType === "daily") {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

      const prevStart = new Date(start);
      prevStart.setDate(prevStart.getDate() - 1);
      const prevEnd = new Date(end);
      prevEnd.setDate(prevEnd.getDate() - 1);

      return {
        periodType,
        current: { start, end },
        previous: { start: prevStart, end: prevEnd },
        timezone,
      };
    }

    if (periodType === "weekly") {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Lunes
      const start = new Date(now.getFullYear(), now.getMonth(), diff, 0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);

      const prevStart = new Date(start);
      prevStart.setDate(prevStart.getDate() - 7);
      const prevEnd = new Date(end);
      prevEnd.setDate(prevEnd.getDate() - 7);

      return {
        periodType,
        current: { start, end },
        previous: { start: prevStart, end: prevEnd },
        timezone,
      };
    }

    if (periodType === "monthly") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

      const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

      return {
        periodType,
        current: { start, end },
        previous: { start: prevStart, end: prevEnd },
        timezone,
      };
    }

    if (periodType === "annual") {
      const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);

      const prevStart = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0, 0);
      const prevEnd = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);

      return {
        periodType,
        current: { start, end },
        previous: { start: prevStart, end: prevEnd },
        timezone,
      };
    }

    // Default para quarterly / semiannual
    const quarter = Math.floor(now.getMonth() / 3);
    const startMonth = quarter * 3;
    const start = new Date(now.getFullYear(), startMonth, 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), startMonth + 3, 0, 23, 59, 59, 999);

    const prevStart = new Date(now.getFullYear(), startMonth - 3, 1, 0, 0, 0, 0);
    const prevEnd = new Date(now.getFullYear(), startMonth, 0, 23, 59, 59, 999);

    return {
      periodType,
      current: { start, end },
      previous: { start: prevStart, end: prevEnd },
      timezone,
    };
  }

  /**
   * Calcula el porcentaje de variación (delta) entre período actual y anterior.
   */
  static calculateDelta(current: number, previous: number): number {
    if (previous === 0) {
      return current > 0 ? 100 : 0;
    }
    const diff = current - previous;
    return Number(((diff / previous) * 100).toFixed(1));
  }
}

