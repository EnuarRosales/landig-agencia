import { describe, it, expect, beforeEach, vi } from "vitest";
import { CellPoolError } from "../db/cell-client";
import type { CellTenantPaymentChannel } from "../db/schemas/tenant/orders";
import { appLogger } from "../utils/logger";
import {
  TenantPaymentChannelsService,
  type ITenantPaymentChannelsRepository,
} from "./tenant-payment-channels.service";

function createInMemoryChannelsRepo() {
  const channels = new Map<string, CellTenantPaymentChannel>();
  const usedOrderChannels = new Set<string>();

  const repo: ITenantPaymentChannelsRepository & {
    usedOrderChannels: Set<string>;
  } = {
    usedOrderChannels,
    async listByClient(clientId) {
      return [...channels.values()]
        .filter((c) => c.clientId === clientId)
        .sort((a, b) => a.sortOrder - b.sortOrder);
    },
    async getById(clientId, channelId) {
      const row = channels.get(channelId);
      return row && row.clientId === clientId ? row : null;
    },
    async create(clientId, input, actor) {
      const id = `019a0000-0000-7000-8005-${String(channels.size + 1).padStart(12, "0")}`;
      const now = new Date();
      const row: CellTenantPaymentChannel = {
        id,
        clientId,
        channelCode: input.channelCode,
        displayName: input.displayName,
        accountIdentifier: input.accountIdentifier ?? null,
        accountHolderName: input.accountHolderName ?? null,
        instructions: input.instructions ?? null,
        isActive: input.isActive,
        sortOrder: input.sortOrder,
        createdAt: now,
        updatedAt: now,
        createdBy: actor,
        updatedBy: actor,
      };
      channels.set(id, row);
      return row;
    },
    async update(clientId, channelId, input, actor) {
      const existing = channels.get(channelId);
      if (!existing || existing.clientId !== clientId) return null;
      const updated: CellTenantPaymentChannel = {
        ...existing,
        ...input,
        updatedAt: new Date(),
        updatedBy: actor,
      };
      channels.set(channelId, updated);
      return updated;
    },
    async isChannelUsedInOrders(_clientId, channel) {
      return usedOrderChannels.has(channel.id);
    },
    async deleteAndSyncSummary(clientId, channelId) {
      const existing = channels.get(channelId);
      if (!existing || existing.clientId !== clientId) return false;
      channels.delete(channelId);
      return true;
    },
  };

  return repo;
}

describe("SPEC-05 · TenantPaymentChannelsService", () => {
  let repo: ReturnType<typeof createInMemoryChannelsRepo>;
  let service: TenantPaymentChannelsService;

  beforeEach(() => {
    repo = createInMemoryChannelsRepo();
    service = new TenantPaymentChannelsService(repo);
  });

  it("crea, edita y lista canales informativos de pago para tenant_owner", async () => {
    const created = await service.createChannel(
      "client-1",
      "tenant_owner",
      {
        channelCode: "nequi",
        displayName: "Nequi Empresarial",
        accountIdentifier: "3105551234",
        accountHolderName: "Tienda Café SAS",
        instructions: "Envía tu captura al WhatsApp.",
      },
      "owner@cafe.co",
    );

    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const updated = await service.updateChannel(
      "client-1",
      "tenant_owner",
      created.data.id,
      { isActive: false },
      "owner@cafe.co",
    );
    expect(updated.ok).toBe(true);
    if (updated.ok) {
      expect(updated.data.isActive).toBe(false);
    }

    const list = await service.listChannels("client-1");
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.data).toHaveLength(1);
    }
  });

  it("prohíbe capturar credenciales sensibles como CVV o contraseñas", async () => {
    const res = await service.createChannel(
      "client-1",
      "tenant_owner",
      {
        channelCode: "other",
        displayName: "Tarjeta Corporativa",
        instructions: "Ingresar CVV del cliente",
      },
      "owner@cafe.co",
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("SENSITIVE_CREDENTIAL_FORBIDDEN");
    }
  });

  it("impide que tenant_agent cree, edite o elimine canales", async () => {
    const res = await service.createChannel(
      "client-1",
      "tenant_agent",
      {
        channelCode: "daviplata",
        displayName: "Daviplata",
      },
      "agent@cafe.co",
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("FORBIDDEN");
    }
  });

  it("retorna CHANNEL_USED_IN_ORDERS al intentar borrar un canal referenciado en pedidos históricos", async () => {
    const created = await service.createChannel(
      "client-1",
      "tenant_owner",
      {
        channelCode: "bancolombia",
        displayName: "Bancolombia Ahorros",
        accountIdentifier: "123-456789-01",
      },
      "owner@cafe.co",
    );
    if (!created.ok) throw new Error("Setup failed");

    repo.usedOrderChannels.add(created.data.id);

    const del = await service.deleteChannel(
      "client-1",
      "tenant_owner",
      created.data.id,
      "owner@cafe.co",
    );
    expect(del.ok).toBe(false);
    if (!del.ok) {
      expect(del.code).toBe("CHANNEL_USED_IN_ORDERS");
    }
  });

  it("elimina físicamente un canal sin pedidos asociados", async () => {
    const created = await service.createChannel(
      "client-1",
      "tenant_owner",
      {
        channelCode: "bre_b",
        displayName: "Bre-B Comercio",
        accountIdentifier: "3009998877",
      },
      "owner@cafe.co",
    );
    if (!created.ok) throw new Error("Setup failed");

    const del = await service.deleteChannel(
      "client-1",
      "tenant_owner",
      created.data.id,
      "owner@cafe.co",
    );
    expect(del.ok).toBe(true);
  });

  it("retorna CELL_UNAVAILABLE y registra warning sin lanzar excepción ni console.error cuando la celda no está disponible", async () => {
    const warnSpy = vi.spyOn(appLogger, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(appLogger, "error").mockImplementation(() => {});
    vi.spyOn(repo, "listByClient").mockRejectedValueOnce(
      new CellPoolError('La celda cell-01 (501f) se encuentra en estado "error_connection".'),
    );

    const res = await service.listChannels("client-1");

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("CELL_UNAVAILABLE");
    }
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("retorna DB_ERROR y registra el error con la firma correcta cuando ocurre un fallo inesperado de persistencia", async () => {
    const errorSpy = vi.spyOn(appLogger, "error").mockImplementation(() => {});
    const dbError = new Error("Connection reset");
    vi.spyOn(repo, "listByClient").mockRejectedValueOnce(dbError);

    const res = await service.listChannels("client-1");

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("DB_ERROR");
    }
    expect(errorSpy).toHaveBeenCalledWith(
      "[TenantPaymentChannelsService.listChannels] Error inesperado",
      dbError,
      { clientId: "client-1" },
    );

    errorSpy.mockRestore();
  });
});
