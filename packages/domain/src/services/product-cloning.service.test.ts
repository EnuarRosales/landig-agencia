import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  ProductCloningAndCommunitiesService,
  type IProductCloningRepository,
  type ProductSnapshot,
} from "./product-cloning.service";
import type {
  ProductShare,
  ProductShareVersion,
  ProductAdoption,
  CloneSyncPolicy,
} from "../db/schemas/admin/communities-and-cloning";

describe("ADM-001 T-16, T-17, T-18 · ProductCloningAndCommunitiesService", () => {
  let mockRepo: IProductCloningRepository;
  let service: ProductCloningAndCommunitiesService;

  const mockSnapshot: ProductSnapshot = {
    id: "p-orig-100",
    name: "Vestido Gala Elegance",
    description: "Vestido largo de seda para eventos",
    priceCents: 15000000,
    currency: "COP",
    sku: "VEST-001",
    mediaIds: ["media-img-1", "media-img-2"],
  };

  const mockShare: ProductShare = {
    id: "share-uuid-1",
    organizationId: "org-uuid-1",
    sharerClientId: "client-origin-1",
    createdByUserId: "user-1",
    sourceProductId: "p-orig-100",
    sourceCellId: "cell-01",
    currentVersion: 1,
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "user-1",
    updatedBy: "user-1",
  };

  const mockShareVersion: ProductShareVersion = {
    id: "ver-uuid-1",
    shareId: "share-uuid-1",
    version: 1,
    changedAttributes: [],
    snapshot: mockSnapshot as any,
    createdAt: new Date(),
  };

  const mockAdoption: ProductAdoption = {
    id: "adopt-uuid-1",
    shareId: "share-uuid-1",
    adopterClientId: "client-adopter-2",
    createdByUserId: "user-2",
    cloneProductId: "p-clone-999",
    cloneCellId: "cell-02",
    adoptedVersion: 1,
    linkActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "user-2",
    updatedBy: "user-2",
  };

  const mockPolicies: CloneSyncPolicy[] = [
    {
      id: "policy-1",
      adoptionId: "adopt-uuid-1",
      attributeKey: "priceCents",
      autoSync: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: "user-2",
      updatedBy: "user-2",
    },
    {
      id: "policy-2",
      adoptionId: "adopt-uuid-1",
      attributeKey: "description",
      autoSync: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: "user-2",
      updatedBy: "user-2",
    },
  ];

  beforeEach(() => {
    mockRepo = {
      findOrganizationMembership: vi.fn().mockResolvedValue({ role: "member", status: "active" }),
      createProductShare: vi.fn().mockResolvedValue({
        share: mockShare,
        version: mockShareVersion,
      }),
      findShareById: vi.fn().mockResolvedValue(mockShare),
      findLatestShareVersion: vi.fn().mockResolvedValue(mockShareVersion),
      createShareVersion: vi.fn().mockResolvedValue({
        ...mockShareVersion,
        version: 2,
        changedAttributes: ["priceCents"],
      }),
      findAdoptionsByShareId: vi.fn().mockResolvedValue([mockAdoption]),
      findAdoptionById: vi.fn().mockResolvedValue(mockAdoption),
      createAdoption: vi.fn().mockResolvedValue({
        adoption: mockAdoption,
        policies: mockPolicies,
      }),
      cloneProductInCell: vi.fn().mockResolvedValue({ cloneProductId: "p-clone-999" }),
      updateProductInCell: vi.fn().mockResolvedValue(true),
      getSyncPolicies: vi.fn().mockResolvedValue(mockPolicies),
      createSyncRun: vi.fn().mockResolvedValue({
        id: "run-1",
        adoptionId: "adopt-uuid-1",
        version: 2,
        mode: "auto",
        attributes: ["priceCents"],
        status: "success",
        error: null,
        createdAt: new Date(),
      }),
      updateAdoptionVersion: vi.fn().mockResolvedValue(undefined),
    };

    service = new ProductCloningAndCommunitiesService(mockRepo);
  });

  describe("T-16 · Publicación de propuestas de producto", () => {
    it("publica exitosamente un producto con su snapshot y versión inicial 1", async () => {
      const res = await service.publishProductShare({
        organizationId: "org-uuid-1",
        sharerClientId: "client-origin-1",
        createdByUserId: "user-1",
        sourceProductId: "p-orig-100",
        sourceCellId: "cell-01",
        productSnapshot: mockSnapshot,
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(res.data.shareId).toBe("share-uuid-1");
      expect(res.data.version).toBe(1);
      expect(mockRepo.createProductShare).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: "org-uuid-1",
          sourceProductId: "p-orig-100",
        }),
      );
    });

    it("rechaza la publicación si el inquilino no es miembro activo de la comunidad", async () => {
      mockRepo.findOrganizationMembership = vi.fn().mockResolvedValue(null);

      const res = await service.publishProductShare({
        organizationId: "org-uuid-1",
        sharerClientId: "client-stranger",
        createdByUserId: "user-1",
        sourceProductId: "p-orig-100",
        sourceCellId: "cell-01",
        productSnapshot: mockSnapshot,
      });

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.code).toBe("UNAUTHORIZED_COMMUNITY_MEMBER");
    });
  });

  describe("T-17 · Adopción y clonación de productos", () => {
    it("clona el producto en la celda del adoptante con ID nuevo y registra la adopción", async () => {
      const res = await service.adoptProduct({
        shareId: "share-uuid-1",
        adopterClientId: "client-adopter-2",
        createdByUserId: "user-2",
        targetCellId: "cell-02",
        includeMedia: true,
        retainLink: true,
        autoSyncAttributes: ["priceCents"],
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(res.data.cloneProductId).toBe("p-clone-999");
      expect(res.data.adoptionId).toBe("adopt-uuid-1");

      expect(mockRepo.cloneProductInCell).toHaveBeenCalledWith(
        "cell-02",
        "client-adopter-2",
        expect.objectContaining({ name: "Vestido Gala Elegance" }),
        true,
      );
    });

    it("permite clonar sin conservar el vínculo de adopción (clon independiente)", async () => {
      const res = await service.adoptProduct({
        shareId: "share-uuid-1",
        adopterClientId: "client-adopter-2",
        createdByUserId: "user-2",
        targetCellId: "cell-02",
        includeMedia: false,
        retainLink: false,
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(res.data.cloneProductId).toBe("p-clone-999");
      expect(res.data.adoptionId).toBeUndefined();
      expect(mockRepo.createAdoption).not.toHaveBeenCalled();
    });
  });

  describe("T-18 · Actualización de versión y sincronización de atributos", () => {
    it("dispara sincronización automática solo para los atributos configurados con autoSync", async () => {
      const updatedSnapshot: ProductSnapshot = {
        ...mockSnapshot,
        priceCents: 17500000, // Modificado (en política autoSync: true)
        description: "Nueva descripción con descuento", // Modificado (en política autoSync: false)
      };

      const res = await service.updateShareVersion(
        "share-uuid-1",
        updatedSnapshot,
        ["priceCents", "description"],
      );

      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(res.data.newVersion).toBe(2);
      expect(res.data.autoSyncedAdoptionsCount).toBe(1);

      // Solo se actualizó priceCents en el clon porque description tenía autoSync=false
      expect(mockRepo.updateProductInCell).toHaveBeenCalledWith(
        "cell-02",
        "client-adopter-2",
        "p-clone-999",
        { priceCents: 17500000 },
      );

      expect(mockRepo.createSyncRun).toHaveBeenCalledWith(
        expect.objectContaining({
          adoptionId: "adopt-uuid-1",
          version: 2,
          mode: "auto",
          attributes: ["priceCents"],
          status: "success",
        }),
      );
    });

    it("ejecuta sincronización manual solicitada explícitamente por el adoptante", async () => {
      const res = await service.syncAdoptedProduct({
        adoptionId: "adopt-uuid-1",
        mode: "manual",
        targetAttributes: ["description"],
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(res.data.syncedAttributes).toEqual(["description"]);
      expect(mockRepo.updateProductInCell).toHaveBeenCalledWith(
        "cell-02",
        "client-adopter-2",
        "p-clone-999",
        expect.objectContaining({ description: "Vestido largo de seda para eventos" }),
      );
    });
  });
});

