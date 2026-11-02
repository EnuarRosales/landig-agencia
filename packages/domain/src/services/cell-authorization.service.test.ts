import { describe, it, expect } from "vitest";
import { evaluateCellProvisionAuthorization } from "./cell-authorization.service";

describe("DAT-001 T1 · cell-authorization.service", () => {
  it("autoriza cuando el usuario es platform_owner y el rol tiene cells.provision", () => {
    const roles = ["platform_owner"];
    const perms = new Map<string, Set<string>>([
      ["platform_owner", new Set(["cells.provision"])],
    ]);

    const result = evaluateCellProvisionAuthorization(roles, perms);
    expect(result.ok).toBe(true);
  });

  it("rechaza a un usuario sin rol platform_owner aunque tenga el permiso", () => {
    const roles = ["platform_admin"];
    const perms = new Map<string, Set<string>>([
      ["platform_admin", new Set(["cells.provision"])],
    ]);

    const result = evaluateCellProvisionAuthorization(roles, perms);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Platform Owner/i);
  });

  it("rechaza si el permiso cells.provision no está concedido al platform_owner", () => {
    const roles = ["platform_owner"];
    const perms = new Map<string, Set<string>>([
      ["platform_owner", new Set(["platform.governance.manage"])],
    ]);

    const result = evaluateCellProvisionAuthorization(roles, perms);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/cells\.provision/i);
  });

  it("rechaza cuando el usuario no tiene roles", () => {
    const result = evaluateCellProvisionAuthorization([], new Map());
    expect(result.ok).toBe(false);
  });
});
