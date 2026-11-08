import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchAdminCellHosts,
  createAdminCellHost,
  updateAdminCellHost,
  deleteAdminCellHost,
  createAdminCell,
} from "./admin-dashboard.service";
import * as clientModule from "../db/client";
import * as authzModule from "./cell-authorization.service";

describe("CEL-001 T01b · cell_hosts service and placement", () => {
  const actorUserId = "01930000-0000-7000-8000-000000000001";

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authzModule, "authorizeCellProvision").mockResolvedValue({ ok: true, data: undefined } as never);
  });

  it("createAdminCellHost rechaza códigos o perfiles inválidos", async () => {
    const res = await createAdminCellHost({
      code: "",
      deploymentProfile: "local_development",
      connectivityConfigRef: "local_preset",
      actorUserId,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("VALIDATION_ERROR");
    }

    const res2 = await createAdminCellHost({
      code: "host-invalid",
      deploymentProfile: "invalid_profile" as never,
      connectivityConfigRef: "preset",
      actorUserId,
    });
    expect(res2.ok).toBe(false);
    if (!res2.ok) {
      expect(res2.code).toBe("VALIDATION_ERROR");
    }
  });

  it("createAdminCell rechaza hostId si el host no está en estado 'ready' (CEL-RF-001)", async () => {
    const mockHost = {
      id: "host-uuid-maintenance",
      code: "host-maint",
      deploymentProfile: "control_plane_vps",
      status: "maintenance",
      connectivityConfigRef: "vps_preset",
    };

    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [mockHost],
          }),
        }),
      }),
    };
    vi.spyOn(clientModule, "getDb").mockReturnValue(mockDb as never);

    const res = await createAdminCell({
      code: "cell-test",
      hostId: "host-uuid-maintenance",
      topologyType: "remote_vps",
      pgbouncerHost: "pgbouncer-cell-test",
      databaseName: "pg-cell-test",
      appUrl: "http://cell-test:3000",
      actorUserId,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("HOST_NOT_READY");
      expect(res.error).toContain("ready");
    }
  });

  it("createAdminCell rechaza incompatibilidad entre topology_type y el deployment_profile del host (CEL-RF-026)", async () => {
    const mockHost = {
      id: "host-uuid-vps",
      code: "host-vps",
      deploymentProfile: "control_plane_vps",
      status: "ready",
      connectivityConfigRef: "vps_preset",
    };

    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [mockHost],
          }),
        }),
      }),
    };
    vi.spyOn(clientModule, "getDb").mockReturnValue(mockDb as never);

    const res = await createAdminCell({
      code: "cell-test",
      hostId: "host-uuid-vps",
      topologyType: "local_compose", // Requiere local_development, pero host es control_plane_vps
      pgbouncerHost: "pgbouncer-cell-test",
      databaseName: "pg-cell-test",
      appUrl: "http://cell-test:3000",
      actorUserId,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("PROFILE_MISMATCH");
    }
  });

  it("deleteAdminCellHost rechaza eliminar un host que tiene celdas asignadas", async () => {
    const mockHost = { id: "host-uuid-1", code: "host-01" };
    const mockAssignedCell = { id: "cell-uuid-1" };

    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [mockAssignedCell],
          }),
        }),
      }),
    };
    // Primer select busca el host, segundo busca las celdas
    let callCount = 0;
    vi.spyOn(clientModule, "getDb").mockReturnValue({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => {
              callCount++;
              if (callCount === 1) return [mockHost];
              return [mockAssignedCell];
            },
          }),
        }),
      }),
    } as never);

    const res = await deleteAdminCellHost("host-uuid-1", actorUserId);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("HOST_HAS_CELLS");
    }
  });
});

