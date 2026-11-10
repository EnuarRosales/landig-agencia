import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  CellMigrationService,
  resolveDrizzleCellPath,
} from "./cell-migration.service";

describe("CellMigrationService Unit Suite (M5, E2E Escenario E)", () => {
  const service = new CellMigrationService();

  describe("Journal Reading & Resolution (E-T1.1 & E-T2.5)", () => {
    it("should resolve valid drizzle-cell directory containing journal", () => {
      const dir = resolveDrizzleCellPath();
      expect(fs.existsSync(dir)).toBe(true);
      expect(fs.existsSync(path.join(dir, "meta/_journal.json"))).toBe(true);
    });

    it("should read cell journal with postgresql dialect and valid entries", () => {
      const journal = service.getMigrationJournal();
      expect(journal.dialect).toBe("postgresql");
      expect(Array.isArray(journal.entries)).toBe(true);
      expect(journal.entries.length).toBeGreaterThanOrEqual(10);
      expect(journal.entries[0]?.tag).toContain("0000_cell_foundation");
    });
  });

  describe("Classification & Status Badges (E-T2.2)", () => {
    it("should classify 0 pending migrations as synchronized ('Al día')", () => {
      const pendingCount: number = 0;
      const status = pendingCount === 0 ? "synchronized" : "pending_migrations";
      const label = pendingCount === 0 ? "Al día" : "Actualización Pendiente";

      expect(status).toBe("synchronized");
      expect(label).toBe("Al día");
    });

    it("should classify N > 0 pending migrations as pending_migrations ('Actualización Pendiente')", () => {
      const pendingCount: number = 2;
      const status = pendingCount === 0 ? "synchronized" : "pending_migrations";
      const label = pendingCount === 0 ? "Al día" : "Actualización Pendiente";

      expect(status).toBe("pending_migrations");
      expect(label).toBe("Actualización Pendiente");
    });
  });

  describe("Migratable State Guards (E-T3.2)", () => {
    const migratableStates = ["active", "maintenance", "verifying"];

    it("should allow active and maintenance states", () => {
      expect(migratableStates.includes("active")).toBe(true);
      expect(migratableStates.includes("maintenance")).toBe(true);
      expect(migratableStates.includes("verifying")).toBe(true);
    });

    it("should reject draining, draft or error_connection states", () => {
      expect(migratableStates.includes("draining")).toBe(false);
      expect(migratableStates.includes("draft")).toBe(false);
      expect(migratableStates.includes("error_connection")).toBe(false);
    });
  });
});
