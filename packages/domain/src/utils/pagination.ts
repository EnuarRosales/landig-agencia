import { z } from "zod";

/**
 * Límites canónicos de paginación transversal (`SPEC-17 §8 RN-SPEC-17-03`, `§9.2`).
 */
export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 50;

/**
 * Dirección admitida de ordenamiento en listados tabulares.
 */
export type PaginationSortDir = "asc" | "desc";

/**
 * Parámetros normalizados de consulta paginada, filtrada y ordenada (`SPEC-17 §9.2`).
 */
export interface NormalizedPaginationQuery {
  page: number;
  limit: number;
  sortBy?: string;
  sortDir?: PaginationSortDir;
  q?: string;
}

/**
 * Metadatos estándar de paginación retornados en listados del Backoffice (`SPEC-17 §9.2`).
 */
export interface PaginationMetaDto {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Envelope estándar de respuesta paginada (`SPEC-17 §9.2`).
 */
export interface PaginatedResultDto<T> {
  items: T[];
  pagination: PaginationMetaDto;
}

/**
 * Esquema Zod compartido para validar parámetros de paginación y búsqueda en API (`limit <= 50`).
 */
export const paginationQuerySchema = z.object({
  page: z.coerce
    .number()
    .int("El parámetro page debe ser un entero.")
    .min(1, "El parámetro page debe ser mayor o igual a 1.")
    .default(DEFAULT_PAGE),
  limit: z.coerce
    .number()
    .int("El parámetro limit debe ser un entero.")
    .min(1, "El parámetro limit debe ser mayor o igual a 1.")
    .max(
      MAX_PAGE_LIMIT,
      `El parámetro limit no puede exceder ${MAX_PAGE_LIMIT} registros por página.`,
    )
    .default(DEFAULT_PAGE_LIMIT),
  sortBy: z.string().trim().min(1).max(64).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
  q: z.string().trim().max(200).optional(),
});

/**
 * Resultado discriminado del parseo seguro de query params de paginación.
 */
export type ParsePaginationResult =
  | { ok: true; data: NormalizedPaginationQuery }
  | { ok: false; error: string; issues: z.ZodIssue[] };

/**
 * Valida y normaliza los parámetros estándar de paginación, búsqueda y ordenamiento (`SPEC-17 §9.2`).
 *
 * @param rawQuery - Mapa plano de parámetros o `URLSearchParams`.
 * @param options - Restricciones opcionales de campos ordenables y límite por defecto.
 * @returns Objeto discriminado con `page`, `limit <= 50`, `sortBy`, `sortDir` y `q` o errores Zod.
 */
export function parsePaginationQuery(
  rawQuery: URLSearchParams | Record<string, string | string[] | undefined>,
  options?: {
    allowedSortBy?: readonly string[];
    defaultSortBy?: string;
    defaultSortDir?: PaginationSortDir;
    defaultLimit?: number;
  },
): ParsePaginationResult {
  const record: Record<string, string | undefined> = {};

  if (rawQuery instanceof URLSearchParams) {
    for (const key of ["page", "limit", "sortBy", "sortDir", "q"] as const) {
      const val = rawQuery.get(key);
      if (val !== null && val.trim() !== "") {
        record[key] = val.trim();
      }
    }
  } else {
    for (const key of ["page", "limit", "sortBy", "sortDir", "q"] as const) {
      const raw = rawQuery[key];
      const val = Array.isArray(raw) ? raw[0] : raw;
      if (typeof val === "string" && val.trim() !== "") {
        record[key] = val.trim();
      }
    }
  }

  if (record.limit === undefined && options?.defaultLimit !== undefined) {
    record.limit = String(options.defaultLimit);
  }

  const parsed = paginationQuerySchema.safeParse(record);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message || "Parámetros de paginación inválidos.",
      issues: parsed.error.issues,
    };
  }

  let resolvedSortBy = parsed.data.sortBy ?? options?.defaultSortBy;
  if (
    resolvedSortBy &&
    options?.allowedSortBy &&
    !options.allowedSortBy.includes(resolvedSortBy)
  ) {
    return {
      ok: false,
      error: `El campo de ordenamiento '${resolvedSortBy}' no es válido.`,
      issues: [
        {
          code: "custom",
          path: ["sortBy"],
          message: `El campo de ordenamiento '${resolvedSortBy}' no es válido.`,
        },
      ],
    };
  }

  const resolvedSortDir: PaginationSortDir | undefined =
    parsed.data.sortDir ?? (resolvedSortBy ? options?.defaultSortDir ?? "desc" : undefined);

  return {
    ok: true,
    data: {
      page: parsed.data.page,
      limit: parsed.data.limit,
      ...(resolvedSortBy ? { sortBy: resolvedSortBy } : {}),
      ...(resolvedSortDir ? { sortDir: resolvedSortDir } : {}),
      ...(parsed.data.q ? { q: parsed.data.q } : {}),
    },
  };
}

/**
 * Construye el envelope paginado estándar (`items` + `pagination`) a partir de los resultados consultados.
 *
 * @param items - Colección de elementos pertenecientes a la página actual.
 * @param params - Parámetros efectivos `page`, `limit` y `total` de registros coincidentes.
 * @returns Envelope compatible con todos los listados `GET /api/tenant/*` (`SPEC-17 §9.2`).
 */
export function buildPaginatedResult<T>(
  items: T[],
  params: { page: number; limit: number; total: number },
): PaginatedResultDto<T> {
  const safeLimit = Math.min(MAX_PAGE_LIMIT, Math.max(1, Math.trunc(params.limit || DEFAULT_PAGE_LIMIT)));
  const safeTotal = Math.max(0, Math.trunc(params.total || 0));
  const totalPages = Math.max(1, Math.ceil(safeTotal / safeLimit));
  const safePage = Math.min(totalPages, Math.max(1, Math.trunc(params.page || DEFAULT_PAGE)));

  return {
    items,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total: safeTotal,
      totalPages,
    },
  };
}
