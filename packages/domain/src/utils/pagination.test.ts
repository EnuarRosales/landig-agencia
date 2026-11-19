import { describe, expect, it } from "vitest";
import { buildPaginatedResult, MAX_PAGE_LIMIT, parsePaginationQuery } from "./pagination";

describe("SPEC-17 · pagination utils", () => {
  it("normaliza valores por defecto (page=1, limit=20) y query de búsqueda", () => {
    const res = parsePaginationQuery(new URLSearchParams("q=%20cafe%20&sortBy=name&sortDir=asc"));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toEqual({
        page: 1,
        limit: 20,
        sortBy: "name",
        sortDir: "asc",
        q: "cafe",
      });
    }
  });

  it("rechaza limit mayor a 50 con error de validación", () => {
    const res = parsePaginationQuery({ limit: "500" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain(String(MAX_PAGE_LIMIT));
    }
  });

  it("rechaza sortBy fuera de la lista blanca cuando se especifica allowedSortBy", () => {
    const res = parsePaginationQuery(
      { sortBy: "secretColumn", sortDir: "desc" },
      { allowedSortBy: ["createdAt", "name"], defaultSortBy: "createdAt" },
    );
    expect(res.ok).toBe(false);
  });

  it("construye metadata de paginación consistente con totalPages >= 1", () => {
    const out = buildPaginatedResult(["a", "b"], { page: 2, limit: 10, total: 25 });
    expect(out.items).toEqual(["a", "b"]);
    expect(out.pagination).toEqual({
      page: 2,
      limit: 10,
      total: 25,
      totalPages: 3,
    });

    const empty = buildPaginatedResult([], { page: 5, limit: 20, total: 0 });
    expect(empty.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 1,
    });
  });
});
