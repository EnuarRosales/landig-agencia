import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  CommunitiesGovernanceService,
  type ICommunitiesGovernanceRepository,
} from "./communities-governance.service";
import {
  CommunityLeadershipMetricsService,
  type AttributedAdoptionRecord,
  type AttributedShareRecord,
  type ICellClientMetricsProvider,
  type ILeadershipMetricsRepository,
} from "./community-leadership-metrics.service";
import {
  computeProductSnapshotDiff,
  ProductCloningAndCommunitiesService,
  SAFE_AUTO_SYNC_ATTRIBUTES,
  type ISpec15ProductCloningStore,
  type IProductCloningRepository,
  type ProductSnapshot,
} from "./product-cloning.service";
import type {
  CloneSyncPolicy,
  ProductAdoption,
  ProductShare,
  ProductShareVersion,
} from "../db/schemas/admin/communities-and-cloning";
import type { CellProduct } from "../db/schemas/tenant/tenancy-catalog";

describe("SPEC-15 · Comunidades, Liderazgo, Multi-Comunidad, Clonación Segura y Atribución", () => {
  describe("computeProductSnapshotDiff & protección comercial (SPEC-15-D07, D08)", () => {
    it("detecta cambios pendientes solo en los atributos realmente modificados sin falsos positivos", () => {
      const prev: ProductSnapshot = {
        id: "p-1",
        name: "Chaquetas Cuero Pro",
        description: "Chaqueta impermeable de alto calibre",
        priceCents: 22000000,
        currency: "COP",
        category: "Moda",
        brand: "Vanguard",
        botMasterPrompt: "Destacar costuras selladas.",
        wholesaleCostCents: 14000000,
        suggestedPriceCents: 22000000,
        attributes: [{ name: "Talla", values: ["S", "M", "L"] }],
        media: [
          {
            mediaId: "m-1",
            storageKey: "tenants/leader/products/p-1/foto.webp",
            contentHash: "hash-a",
            mediaKind: "image",
            mimeType: "image/webp",
            sourceFormat: "webp",
            originalFilename: "foto.webp",
            sizeBytes: 12000,
            width: 800,
            height: 800,
            durationMs: null,
            storageType: "internal",
            sourceUrl: null,
            provider: null,
            isCover: true,
            altText: null,
            sortOrder: 0,
          },
        ],
      };

      // Mismos datos con orden alternativo de claves en el snapshot => 0 cambios
      expect(computeProductSnapshotDiff(prev, { ...prev })).toEqual([]);

      // Cambia descripción, botMasterPrompt y wholesaleCostCents => detecta exactamente esos 3
      const next: ProductSnapshot = {
        ...prev,
        description: "Chaqueta térmica impermeable edición 2027",
        botMasterPrompt: "Incluir tabla de medidas.",
        wholesaleCostCents: 15000000,
      };
      expect(computeProductSnapshotDiff(prev, next)).toEqual([
        "description",
        "botMasterPrompt",
        "wholesaleCostCents",
      ]);
    });
  });

  describe("CommunitiesGovernanceService · Autorización de Líder y Multi-Comunidad (SPEC-15-D01, D02, D03)", () => {
    let repo: ICommunitiesGovernanceRepository;
    let service: CommunitiesGovernanceService;

    beforeEach(() => {
      repo = {
        supportsMultiCommunity: true,
        findActiveMembership: vi.fn().mockResolvedValue(null),
        findOrganizationById: vi.fn().mockResolvedValue(null),
        createOrganization: vi.fn(),
        createJoinRequest: vi.fn(),
        findJoinRequestById: vi.fn(),
        updateJoinRequestStatus: vi.fn(),
        addMember: vi.fn(),
        createPromotion: vi.fn(),
        findPromotionById: vi.fn(),
        updatePromotionStatus: vi.fn(),
        updateMemberRole: vi.fn(),
        setMemberLeft: vi.fn(),
        getLeaderAuthorization: vi.fn().mockResolvedValue({
          id: "auth-1",
          clientId: "client-leader-1",
          status: "approved",
          maxOwnedCommunities: 2,
          proposedCommunityName: "Red Mayorista",
          businessModel: "Mayorista",
          reviewNotes: null,
          requestedAt: new Date(),
          reviewedAt: new Date(),
          requestedByUserId: "user-1",
          reviewedByUserId: "admin-1",
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: "user-1",
          updatedBy: "admin-1",
        }),
        countOwnedOrganizations: vi.fn().mockResolvedValue(2),
      };
      service = new CommunitiesGovernanceService(repo);
    });

    it("impide crear nueva comunidad si el comercio no está autorizado o alcanzó su cuota max_owned_communities", async () => {
      const blockedByQuota = await service.createOrganization({
        originatorClientId: "client-leader-1",
        createdByUserId: "user-1",
        name: "Tercera Red Mayorista",
        moderationMode: "pre",
      });

      expect(blockedByQuota.ok).toBe(false);
      if (!blockedByQuota.ok) {
        expect(blockedByQuota.code).toBe("LEADER_QUOTA_EXCEEDED");
      }

      (repo.getLeaderAuthorization as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "auth-1",
        clientId: "client-leader-1",
        status: "pending",
        maxOwnedCommunities: null,
      });

      const blockedNotApproved = await service.createOrganization({
        originatorClientId: "client-leader-1",
        createdByUserId: "user-1",
        name: "Comunidad No Aprobada",
        moderationMode: "post",
      });

      expect(blockedNotApproved.ok).toBe(false);
      if (!blockedNotApproved.ok) {
        expect(blockedNotApproved.code).toBe("LEADER_APPROVAL_REQUIRED");
      }
    });
  });

  describe("ProductCloningAndCommunitiesService · Reglas SPEC-15 end-to-end", () => {
    let store: ISpec15ProductCloningStore;
    let cloningService: ProductCloningAndCommunitiesService;
    let legacyRepo: IProductCloningRepository;

    const baseProduct: CellProduct = {
      id: "prod-src-1",
      clientId: "client-leader",
      sku: "KIT-01",
      gtin: null,
      mpn: null,
      itemGroupId: null,
      sourceSystem: "manual",
      sourceExternalId: null,
      sourceUrl: null,
      name: "Kit Facial Premium",
      description: "Rutina completa de 3 pasos",
      brand: "MocterDerma",
      kind: "physical",
      compositionType: "simple",
      condition: "new",
      availability: "in_stock",
      status: "active",
      sortOrder: 0,
      costPriceCents: 6000000,
      priceCents: 11000000,
      salePriceCents: null,
      currency: "COP",
      priceNote: null,
      category: "Belleza",
      googleProductCategory: null,
      color: null,
      size: null,
      material: null,
      gender: null,
      ageGroup: null,
      pattern: null,
      attributes: [{ name: "Presentación", values: ["Estándar"] }],
      prompt: null,
      botMasterPrompt: "Recomendar uso nocturno.",
      stockQuantity: 45,
      minStockThreshold: 5,
      lowStockAlertSentAt: null,
      keywords: [],
      mediaTerm: null,
      benefits: [],
      deliveryGroupId: null,
      freeShipping: false,
      shippingCostCents: null,
      sourceShareId: null,
      sourceVersion: null,
      deletedAt: null,
      deletedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: "user-leader",
      updatedBy: "user-leader",
    };

    const baseShare: ProductShare = {
      id: "share-1",
      organizationId: "org-1",
      sharerClientId: "client-leader",
      createdByUserId: "user-leader",
      sourceProductId: "prod-src-1",
      sourceCellId: "cell-01",
      currentVersion: 1,
      status: "active",
      moderationStatus: "approved",
      moderatedByUserId: null,
      moderatedAt: null,
      rejectionReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: "user-leader",
      updatedBy: "user-leader",
    };

    const baseSnapshot: ProductSnapshot = {
      id: "prod-src-1",
      name: "Kit Facial Premium",
      description: "Rutina completa de 3 pasos",
      priceCents: 11000000,
      suggestedPriceCents: 11500000,
      wholesaleCostCents: 6500000,
      minResalePriceCents: 9900000,
      currency: "COP",
      sku: "KIT-01",
      category: "Belleza",
      brand: "MocterDerma",
      kind: "physical",
      compositionType: "simple",
      botMasterPrompt: "Recomendar uso nocturno.",
      attributes: [{ name: "Presentación", values: ["Estándar"] }],
      media: [],
    };

    beforeEach(() => {
      legacyRepo = {
        findOrganizationMembership: vi.fn().mockResolvedValue(null),
        createProductShare: vi.fn(),
        findShareById: vi.fn().mockResolvedValue(null),
        findLatestShareVersion: vi.fn().mockResolvedValue(null),
        createShareVersion: vi.fn(),
        findAdoptionsByShareId: vi.fn().mockResolvedValue([]),
        findAdoptionById: vi.fn().mockResolvedValue(null),
        createAdoption: vi.fn(),
        cloneProductInCell: vi.fn(),
        updateProductInCell: vi.fn(),
        getSyncPolicies: vi.fn().mockResolvedValue([]),
        createSyncRun: vi.fn(),
        updateAdoptionVersion: vi.fn(),
      };

      store = {
        getOrganizationAndMembership: vi.fn().mockResolvedValue({
          org: {
            id: "org-1",
            name: "Red Belleza Latam",
            slug: "red-belleza-latam",
            status: "active",
            sharePolicy: "leaders_only",
            requireShareApproval: true,
          },
          membership: { role: "member", status: "active" },
        }),
        getActiveMembershipsForClient: vi.fn().mockResolvedValue([]),
        listClientLiveProductsWithShareState: vi.fn().mockResolvedValue({
          products: [],
          sharesByProductId: new Map(),
        }),
        buildLiveSnapshotForProduct: vi.fn().mockResolvedValue({
          product: baseProduct,
          cellId: "cell-01",
          snapshot: baseSnapshot,
        }),
        findShareByOrgAndProduct: vi.fn().mockResolvedValue(null),
        createSpec15Share: vi.fn().mockResolvedValue({
          share: baseShare,
          version: {
            id: "v1",
            shareId: "share-1",
            version: 1,
            changedAttributes: ["initial"],
            changelog: null,
            snapshot: baseSnapshot as unknown as Record<string, unknown>,
            createdAt: new Date(),
          },
        }),
        findShareWithLatestVersion: vi.fn().mockResolvedValue({
          share: baseShare,
          latestVersion: {
            id: "v1",
            shareId: "share-1",
            version: 1,
            changedAttributes: ["initial"],
            changelog: null,
            snapshot: baseSnapshot as unknown as Record<string, unknown>,
            createdAt: new Date(),
          },
          organizationName: "Red Belleza Latam",
          sharerDisplayName: "Distribuidora Origen",
        }),
        createSpec15ShareVersion: vi.fn(),
        updateShareModeration: vi.fn(),
        updateShareStatus: vi.fn(),
        listSharesForOrganizations: vi.fn().mockResolvedValue([]),
        listAdoptionsForClient: vi.fn().mockResolvedValue([]),
        findAdoptionsForShare: vi.fn().mockResolvedValue([]),
        findAdoptionWithContext: vi.fn().mockResolvedValue(null),
        getLiveProductForDiff: vi.fn().mockResolvedValue(null),
        adoptSnapshotToTenantCell: vi.fn().mockResolvedValue({
          adoptionId: "adopt-99",
          cloneProductId: "clone-99",
          cloneCellId: "cell-01",
          createdProductsCount: 1,
          copiedMediaCount: 0,
          skippedMedia: [],
          version: 1,
        }),
        syncAdoptionInTenantCell: vi.fn().mockResolvedValue({ syncedAttributes: ["description"] }),
        updateCloneSyncPolicies: vi.fn().mockResolvedValue([]),
        unlinkAdoption: vi.fn(),
        listSyncRunsForAdoptions: vi.fn().mockResolvedValue([]),
        getSyncPoliciesForAdoption: vi.fn().mockResolvedValue([]),
      };

      cloningService = new ProductCloningAndCommunitiesService(legacyRepo, store);
    });

    it("bloquea compartir si sharePolicy es leaders_only y el miembro no es líder, o si el producto ya fue clonado (RN-SPEC-15-03)", async () => {
      const blockedByPolicy = await cloningService.publishShareFromCellProduct({
        organizationId: "org-1",
        sharerClientId: "client-member-a",
        createdByUserId: "user-a",
        sourceProductId: "prod-src-1",
      });
      expect(blockedByPolicy.ok).toBe(false);
      if (!blockedByPolicy.ok) {
        expect(blockedByPolicy.code).toBe("FORBIDDEN_SHARE_POLICY_LEADERS_ONLY");
      }

      // Ahora el usuario es originador, pero el producto origen es un clon importado
      (store.getOrganizationAndMembership as ReturnType<typeof vi.fn>).mockResolvedValue({
        org: {
          id: "org-1",
          name: "Red Belleza Latam",
          slug: "red-belleza-latam",
          status: "active",
          sharePolicy: "collaborative",
          requireShareApproval: true,
        },
        membership: { role: "originator", status: "active" },
      });
      (store.buildLiveSnapshotForProduct as ReturnType<typeof vi.fn>).mockResolvedValue({
        product: { ...baseProduct, sourceShareId: "other-share", sourceVersion: 1 },
        cellId: "cell-01",
        snapshot: baseSnapshot,
      });

      const blockedReshare = await cloningService.publishShareFromCellProduct({
        organizationId: "org-1",
        sharerClientId: "client-leader",
        createdByUserId: "user-leader",
        sourceProductId: "prod-src-1",
      });
      expect(blockedReshare.ok).toBe(false);
      if (!blockedReshare.ok) {
        expect(blockedReshare.code).toBe("CANNOT_RESHARE_CLONED_PRODUCT");
      }
    });

    it("prohíbe adoptar bajo el precio mínimo de reventa, adopta con políticas auto_sync=false y rechaza auto-sync sobre precio/stock (SPEC-15-D08)", async () => {
      const belowMin = await cloningService.adoptShareToTenant({
        shareId: "share-1",
        adopterClientId: "client-member-b",
        createdByUserId: "user-b",
        customSalePriceCents: 8000000, // Menor que minResalePriceCents (9900000)
      });
      expect(belowMin.ok).toBe(false);
      if (!belowMin.ok) {
        expect(belowMin.code).toBe("PRICE_BELOW_MIN_RESALE");
      }

      const okAdopt = await cloningService.adoptShareToTenant({
        shareId: "share-1",
        adopterClientId: "client-member-b",
        createdByUserId: "user-b",
        customSalePriceCents: 12000000,
      });
      expect(okAdopt.ok).toBe(true);
      expect(store.adoptSnapshotToTenantCell).toHaveBeenCalledWith(
        expect.objectContaining({
          autoSyncAttributes: [],
          customSalePriceCents: 12000000,
          retainLink: true,
        }),
      );

      // Configurar contexto de adopción para políticas
      const adoptionRow: ProductAdoption = {
        id: "adopt-99",
        shareId: "share-1",
        adopterClientId: "client-member-b",
        createdByUserId: "user-b",
        cloneProductId: "clone-99",
        cloneCellId: "cell-01",
        adoptedVersion: 1,
        linkActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "user-b",
        updatedBy: "user-b",
      };
      (store.findAdoptionWithContext as ReturnType<typeof vi.fn>).mockResolvedValue({
        adoption: adoptionRow,
        share: baseShare,
        latestVersion: null,
        versionsSinceAdopted: [],
        organizationName: "Red Belleza Latam",
        sharerDisplayName: "Distribuidora Origen",
        policies: [] as CloneSyncPolicy[],
      });

      const forbiddenPolicy = await cloningService.updateAdoptionPolicies({
        adoptionId: "adopt-99",
        clientId: "client-member-b",
        autoSyncAttributes: ["description", "priceCents", "stockQuantity"],
      });
      expect(forbiddenPolicy.ok).toBe(false);
      if (!forbiddenPolicy.ok) {
        expect(forbiddenPolicy.code).toBe("FORBIDDEN_PROTECTED_ATTRIBUTE_AUTOSYNC");
      }

      const validPolicy = await cloningService.updateAdoptionPolicies({
        adoptionId: "adopt-99",
        clientId: "client-member-b",
        autoSyncAttributes: [SAFE_AUTO_SYNC_ATTRIBUTES[1]],
      });
      expect(validPolicy.ok).toBe(true);
    });
  });

  describe("CommunityLeadershipMetricsService · Atribución estricta por source_share_id (SPEC-15-D09)", () => {
    it("agrega ventas únicamente de los cloneProductId vinculados a shares de esa comunidad sin exponer datos privados", async () => {
      const shares: AttributedShareRecord[] = [
        {
          shareId: "share-org-1-a",
          sourceProductId: "src-a",
          currentVersion: 2,
          productName: "Tenis Running V2",
          sku: "TEN-01",
        },
      ];
      const adoptions: AttributedAdoptionRecord[] = [
        {
          adoptionId: "ad-1",
          shareId: "share-org-1-a",
          adopterClientId: "client-member-1",
          cloneProductId: "clone-p-10",
          cloneCellId: "cell-01",
          adoptedVersion: 1, // desactualizado (< 2)
        },
      ];

      const repo: ILeadershipMetricsRepository = {
        findOrganizationById: vi.fn().mockResolvedValue({
          id: "org-1",
          name: "Comunidad Calzado",
        }),
        findActiveMembership: vi.fn().mockResolvedValue(null),
        findMembershipInOrg: vi.fn().mockResolvedValue({
          organizationId: "org-1",
          role: "originator",
          status: "active",
        }),
        findActiveMembersByOrg: vi.fn().mockResolvedValue([
          {
            clientId: "client-leader",
            role: "originator",
            cellId: "cell-01",
            displayName: "Fábrica Origen",
          },
          {
            clientId: "client-member-1",
            role: "member",
            cellId: "cell-01",
            displayName: "Tienda Sur",
          },
        ]),
        findOrgSharesWithLatestVersion: vi.fn().mockResolvedValue(shares),
        findActiveAdoptionsByShareIds: vi.fn().mockResolvedValue(adoptions),
      };

      const cellProvider: ICellClientMetricsProvider = {
        getClientPerformance: vi.fn(),
        getAttributedProductsSales: vi.fn().mockResolvedValue([
          {
            productId: "clone-p-10",
            unitsSold: 14,
            revenueCents: 280000000,
            currency: "COP",
          },
        ]),
      };

      const service = new CommunityLeadershipMetricsService(repo, cellProvider);
      const res = await service.getCommunityAttributedMetrics({
        organizationId: "org-1",
        requestingClientId: "client-leader",
        userRole: "tenant_owner",
        periodType: "monthly",
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.totalActiveClones).toBe(1);
        expect(res.data.outdatedClonesCount).toBe(1);
        expect(res.data.totalUnitsSold).toBe(14);
        expect(res.data.totalRevenueCents).toBe(280000000);
        expect(res.data.topSharedProducts[0]?.productName).toBe("Tenis Running V2");
        expect(res.data.adoptersBreakdown[0]?.clientDisplayName).toBe("Tienda Sur");
      }

      // Verifica bloqueo a tenant_agent
      const deniedAgent = await service.getCommunityAttributedMetrics({
        organizationId: "org-1",
        requestingClientId: "client-leader",
        userRole: "tenant_agent",
      });
      expect(deniedAgent.ok).toBe(false);
      if (!deniedAgent.ok) {
        expect(deniedAgent.code).toBe("FORBIDDEN_AGENT_CANNOT_VIEW_AGGREGATED");
      }
    });
  });
});
