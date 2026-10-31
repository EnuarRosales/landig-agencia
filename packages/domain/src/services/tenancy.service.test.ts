import { describe, it, expect, vi, beforeEach } from "vitest";
import { TenancyService } from "./tenancy.service";
import type { IClientsRepository } from "../repositories/clients.repository.interface";
import type { IAuthRepository } from "../repositories/auth.repository.interface";
import type { IPlansRepository } from "../repositories/plans.repository.interface";
import type { User, Plan, Cell, Client, ClientPlan, ClientRouting } from "../db/schemas";

const NOW = new Date("2026-10-30T12:00:00Z");

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "019a0000-0000-7000-8000-000000000001",
    email: "owner@comercio.co",
    emailVerifiedAt: NOW,
    passwordHash: "$argon2id$v=19$m=19456,t=2,p=1$salt$hash",
    passwordUpdatedAt: NOW,
    totpSecretCiphertext: null,
    totpKeyId: null,
    totpEnabledAt: null,
    totpPendingSecretCiphertext: null,
    totpPendingKeyId: null,
    totpPendingCreatedAt: null,
    totpLastUsedStep: null,
    identityLocation: "router",
    activeClientId: null,
    status: "active",
    displayName: "Dueño Comercio",
    avatarUrl: null,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: "self",
    updatedBy: "self",
    ...overrides,
  };
}

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: "019a0000-0000-7000-8000-000000000100",
    code: "free",
    name: { es: "Gratis", en: "Free" },
    description: { es: "Plan inicial", en: "Starter plan" },
    status: "active",
    isPublic: true,
    isPopular: false,
    sortOrder: 0,
    trialDays: 14,
    graceDays: 7,
    billingCycles: ["monthly", "annual"],
    priceMonthlyCents: 0,
    priceAnnualCents: 0,
    currency: "COP",
    marketingFeatures: { es: [], en: [] },
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: "system",
    updatedBy: "system",
    ...overrides,
  };
}

function makeCell(overrides: Partial<Cell> = {}): Cell {
  return {
    id: "019a0000-0000-7000-8000-000000000200",
    code: "cell-01",
    tier: "standard",
    status: "active",
    pgbouncerHost: "pgbouncer-cell-01",
    pgbouncerPort: 6432,
    databaseName: "mocter_cell_01",
    maxClients: 100,
    currentClients: 12,
    region: "us-east-1",
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: "system",
    updatedBy: "system",
    ...overrides,
  };
}

describe("TenancyService · ADM-001 T-05 & T-06", () => {
  let mockClientsRepo: {
    [K in keyof IClientsRepository]: ReturnType<typeof vi.fn>;
  };
  let mockAuthRepo: {
    [K in keyof Pick<
      IAuthRepository,
      "findUserById" | "findUserByEmail" | "createUserWithConsent"
    >]: ReturnType<typeof vi.fn>;
  };
  let mockPlansRepo: {
    [K in keyof IPlansRepository]: ReturnType<typeof vi.fn>;
  };
  let service: TenancyService;

  beforeEach(() => {
    mockClientsRepo = {
      findById: vi.fn().mockResolvedValue(null),
      findBySlug: vi.fn().mockResolvedValue(null),
      findLiveByOwnerUserId: vi.fn().mockResolvedValue(null),
      findRoutingByClientId: vi.fn().mockResolvedValue(null),
      findAvailableCell: vi.fn().mockResolvedValue(makeCell()),
      provisionTenantInRouter: vi.fn().mockImplementation(async (input) => {
        const client: Client = {
          id: "019a0000-0000-7000-8000-000000000300",
          ownerUserId: input.client.ownerUserId,
          slug: input.client.slug,
          displayName: input.client.displayName,
          contactEmail: input.client.contactEmail,
          phone: input.client.phone ?? null,
          websiteUrl: input.client.websiteUrl ?? null,
          lifecycleStatus: input.client.lifecycleStatus ?? "alta",
          locale: input.client.locale ?? "es",
          currency: input.client.currency ?? "COP",
          planId: input.client.planId,
          quotaVersion: input.client.quotaVersion ?? 1,
          taxId: input.client.taxId ?? null,
          country: input.client.country ?? null,
          state: input.client.state ?? null,
          city: input.client.city ?? null,
          addressLine: input.client.addressLine ?? null,
          postalCode: input.client.postalCode ?? null,
          industry: input.client.industry ?? null,
          timezone: input.client.timezone ?? "America/Bogota",
          logoMediaId: input.client.logoMediaId ?? null,
          socialLinks: input.client.socialLinks ?? {},
          createdAt: NOW,
          updatedAt: NOW,
          createdBy: input.actor,
          updatedBy: input.actor,
        };
        const clientPlan: ClientPlan = {
          id: "019a0000-0000-7000-8000-000000000400",
          clientId: client.id,
          planId: client.planId,
          source: input.planSource,
          validFrom: NOW,
          validTo: null,
          assignedByUserId: input.assignedByUserId,
          createdAt: NOW,
          updatedAt: NOW,
          createdBy: input.actor,
          updatedBy: input.actor,
        };
        const routing: ClientRouting = {
          id: "019a0000-0000-7000-8000-000000000500",
          clientId: client.id,
          cellId: input.cellId,
          routingStatus: "active",
          routingVersion: 1,
          createdAt: NOW,
          updatedAt: NOW,
          createdBy: input.actor,
          updatedBy: input.actor,
        };
        return { client, clientPlan, routing };
      }),
    };

    mockAuthRepo = {
      findUserById: vi.fn().mockResolvedValue(makeUser()),
      findUserByEmail: vi.fn().mockResolvedValue(null),
      createUserWithConsent: vi.fn().mockImplementation(async (params) => ({
        user: makeUser({
          id: "019a0000-0000-7000-8000-000000000099",
          email: params.email,
          displayName: params.displayName ?? null,
          emailVerifiedAt: null,
          activeClientId: null,
        }),
        consent: {
          id: "019a0000-0000-7000-8000-000000000098",
          userId: "019a0000-0000-7000-8000-000000000099",
          purpose: "privacy_and_terms",
          policyVersion: params.policyVersion,
          acceptedAt: NOW,
          channel: params.channel,
          ipHash: null,
          userAgent: null,
          revokedAt: null,
          createdAt: NOW,
          updatedAt: NOW,
          createdBy: params.createdBy ?? "self",
          updatedBy: params.createdBy ?? "self",
        },
      })),
    };

    mockPlansRepo = {
      getPublicPlans: vi.fn().mockResolvedValue([makePlan()]),
      findByCode: vi.fn().mockResolvedValue(makePlan()),
      findById: vi.fn().mockResolvedValue(makePlan()),
    };

    service = new TenancyService(
      mockClientsRepo,
      mockAuthRepo as unknown as IAuthRepository,
      mockPlansRepo,
    );
  });

  it("rejects creating a client without owner_user_id (ADM-001 T-06, RF-01.6)", async () => {
    const result = await service.createTenantForSelfService({
      ownerUserId: "   ",
      displayName: "Café El Dorado",
      slug: "cafe-el-dorado",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("OWNER_USER_ID_REQUIRED");
    }
    expect(mockClientsRepo.provisionTenantInRouter).not.toHaveBeenCalled();
  });

  it("rejects self-service tenant creation if owner email is not verified (ADM-001 T-05, RF-14.6)", async () => {
    mockAuthRepo.findUserById.mockResolvedValueOnce(
      makeUser({ emailVerifiedAt: null }),
    );

    const result = await service.createTenantForSelfService({
      ownerUserId: "019a0000-0000-7000-8000-000000000001",
      displayName: "Café El Dorado",
      slug: "cafe-el-dorado",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("OWNER_EMAIL_NOT_VERIFIED");
    }
  });

  it("rejects creating a second live tenant when user already owns one (clients_one_live_owner, ADM-001 T-06)", async () => {
    mockClientsRepo.findLiveByOwnerUserId.mockResolvedValueOnce({
      id: "019a0000-0000-7000-8000-000000000399",
      ownerUserId: "019a0000-0000-7000-8000-000000000001",
      lifecycleStatus: "activo",
    } as Client);

    const result = await service.createTenantForSelfService({
      ownerUserId: "019a0000-0000-7000-8000-000000000001",
      displayName: "Segundo Negocio",
      slug: "segundo-negocio",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("OWNER_ALREADY_OWNS_LIVE_TENANT");
    }
    expect(mockClientsRepo.provisionTenantInRouter).not.toHaveBeenCalled();
  });

  it("rejects tenant creation when user already has an active_client_id membership (ADM-001 D-15, T-06)", async () => {
    mockAuthRepo.findUserById.mockResolvedValueOnce(
      makeUser({ activeClientId: "019a0000-0000-7000-8000-000000000777" }),
    );

    const result = await service.createTenantForSelfService({
      ownerUserId: "019a0000-0000-7000-8000-000000000001",
      displayName: "Otro Negocio",
      slug: "otro-negocio",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("OWNER_ALREADY_HAS_ACTIVE_MEMBERSHIP");
    }
  });

  it("completes tenant provisioning without phone, NIT (tax_id) or address (ADM-001 T-06, RF-01.11)", async () => {
    const result = await service.createTenantForSelfService({
      ownerUserId: "019a0000-0000-7000-8000-000000000001",
      displayName: "Panadería Artesanal",
      slug: "panaderia-artesanal",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const value = result.data;
    expect(value.client.ownerUserId).toBe("019a0000-0000-7000-8000-000000000001");
    expect(value.client.phone).toBeNull();
    expect(value.client.taxId).toBeNull();
    expect(value.client.country).toBeNull();
    expect(value.client.city).toBeNull();
    expect(value.client.addressLine).toBeNull();
    expect(value.client.locale).toBe("es");
    expect(value.client.currency).toBe("COP");
    expect(value.client.timezone).toBe("America/Bogota");
    expect(value.clientPlan.source).toBe("self_service");
    expect(value.routing.cellId).toBe("019a0000-0000-7000-8000-000000000200");
    expect(value.owner.activeClientId).toBe(value.client.id);
  });

  it("manual sales provisioning creates a new user and links the tenant in the same operation (ADM-001 §6.3, T-06)", async () => {
    const growthPlan = makePlan({
      id: "019a0000-0000-7000-8000-000000000102",
      code: "growth",
    });
    mockPlansRepo.findByCode.mockResolvedValueOnce(growthPlan);

    const result = await service.provisionTenantByManualSales({
      ownerEmail: "NuevoCliente@Empresa.co",
      ownerDisplayName: "Ana Gómez",
      displayName: "Empresa SAS",
      slug: "empresa-sas",
      planIdOrCode: "growth",
      salesActorUserId: "019a0000-0000-7000-8000-000000000900",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const value = result.data;
    expect(value.ownerCreated).toBe(true);
    expect(mockAuthRepo.createUserWithConsent).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "nuevocliente@empresa.co",
        channel: "manual_sales",
      }),
    );
    expect(value.client.ownerUserId).toBe(value.owner.id);
    expect(value.client.planId).toBe(growthPlan.id);
    expect(value.clientPlan.source).toBe("manual");
    expect(value.owner.activeClientId).toBe(value.client.id);
  });

  it("manual sales provisioning links an existing user without duplicating identity (ADM-001 §6.3, T-06)", async () => {
    const existingUser = makeUser({
      id: "019a0000-0000-7000-8000-000000000055",
      email: "existente@empresa.co",
      activeClientId: null,
    });
    mockAuthRepo.findUserByEmail.mockResolvedValueOnce(existingUser);

    const result = await service.provisionTenantByManualSales({
      ownerEmail: "existente@empresa.co",
      displayName: "Comercio Existente",
      slug: "comercio-existente",
      planIdOrCode: "free",
      salesActorUserId: "019a0000-0000-7000-8000-000000000900",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const value = result.data;
    expect(value.ownerCreated).toBe(false);
    expect(mockAuthRepo.createUserWithConsent).not.toHaveBeenCalled();
    expect(value.client.ownerUserId).toBe(existingUser.id);
  });
});
