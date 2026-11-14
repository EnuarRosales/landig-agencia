import { describe, it, expect, vi, beforeEach } from "vitest";
import { ok } from "../types/result";
import {
  TenantProfileService,
  MAX_TENANT_LOGO_BYTES,
  type ITenantProfileRepository,
  type ITenantLogoStorage,
  type StoredClientProfileRow,
} from "./tenant-profile.service";

function createInMemoryProfileRepo(initial?: Partial<StoredClientProfileRow>) {
  const row: StoredClientProfileRow = {
    id: "client-1",
    slug: "tienda-andes",
    displayName: "Tienda Andes",
    commercialEmail: null,
    contactEmail: "admin@tiendaandes.co",
    phone: "+573001112233",
    websiteUrl: null,
    locale: "es",
    currency: "COP",
    timezone: "America/Bogota",
    country: "CO",
    state: "Antioquia",
    city: "Medellín",
    addressLine: "Cra 43A # 1-50",
    postalCode: "050021",
    industry: "retail",
    taxId: "900123456-7",
    logoMediaId: null,
    socialLinks: {},
    ...initial,
  };

  const mediaKeys = new Map<string, string>();
  const auditEntries: Array<Record<string, unknown>> = [];

  const repo: ITenantProfileRepository & {
    row: StoredClientProfileRow;
    mediaKeys: Map<string, string>;
    auditEntries: Array<Record<string, unknown>>;
  } = {
    row,
    mediaKeys,
    auditEntries,
    async getClientById(clientId) {
      return clientId === row.id ? { ...row } : null;
    },
    async getBrandingLogoUrl() {
      return null;
    },
    async getMediaStorageKey(mediaId) {
      return mediaKeys.get(mediaId) ?? null;
    },
    async getCellPaymentSummary() {
      return ["Nequi", "Contraentrega"];
    },
    async updateClient(clientId, patch) {
      if (clientId !== row.id) return null;
      Object.assign(row, patch);
      return { ...row };
    },
    async upsertLogoMediaCatalog(params) {
      const id = "019a0000-0000-7000-8000-000000000123";
      mediaKeys.set(id, params.storageKey);
      return { id };
    },
    async recordAudit(entry) {
      auditEntries.push(entry);
    },
  };

  return repo;
}

describe("SPEC-05 · TenantProfileService", () => {
  let repo: ReturnType<typeof createInMemoryProfileRepo>;
  let storage: ITenantLogoStorage;
  let service: TenantProfileService;

  beforeEach(() => {
    repo = createInMemoryProfileRepo();
    storage = {
      putObject: vi.fn(async (key) => ok({ key })),
      signLogoUrl: vi.fn((key) => `https://img.mocter.co/signed/256/${key}`),
    };
    service = new TenantProfileService(repo, storage);
  });

  it("actualiza commercialEmail (normalizado), websiteUrl, locale y redes sociales para tenant_owner", async () => {
    const res = await service.updateTenantProfile(
      "client-1",
      "tenant_owner",
      {
        displayName: "Comercializadora Andes SAS",
        commercialEmail: "Ventas@Andes.co",
        websiteUrl: "https://tiendaandes.co",
        locale: "en",
        socialLinks: {
          instagram: "https://instagram.com/andes",
          whatsapp: "+573001112233",
          facebook: "",
        },
      },
      { userId: "u-1", actorEmail: "owner@andes.co" },
    );

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.commercialEmail).toBe("ventas@andes.co");
    expect(res.data.websiteUrl).toBe("https://tiendaandes.co");
    expect(res.data.locale).toBe("en");
    expect(res.data.socialLinks).toEqual({
      instagram: "https://instagram.com/andes",
      whatsapp: "+573001112233",
    });
    expect(repo.auditEntries).toHaveLength(1);
    expect(repo.auditEntries[0]?.action).toBe("tenant.profile.updated");
  });

  it("rechaza con FORBIDDEN cuando tenant_agent intenta mutar el perfil", async () => {
    const res = await service.updateTenantProfile("client-1", "tenant_agent", {
      displayName: "Intento Ilegal",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("FORBIDDEN");
  });

  it("impide modificar el slug público tras el onboarding", async () => {
    const res = await service.updateTenantProfile("client-1", "tenancy_owner", {
      slug: "otro-slug",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("SLUG_READ_ONLY");
  });

  it("valida formato de sitio web y correo comercial", async () => {
    const badWeb = await service.updateTenantProfile("client-1", "tenant_owner", {
      websiteUrl: "tiendacafe.co",
    });
    expect(badWeb.ok).toBe(false);

    const badEmail = await service.updateTenantProfile("client-1", "tenant_owner", {
      commercialEmail: "no-es-correo",
    });
    expect(badEmail.ok).toBe(false);
  });

  it("sube logotipo PNG válido (<= 5 MiB) exento de cuota y resuelve URL firmada", async () => {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const res = await service.uploadTenantLogo("client-1", "tenant_owner", {
      buffer: pngHeader,
      originalFilename: "logo.png",
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.logoMediaId).toBe("019a0000-0000-7000-8000-000000000123");
    expect(res.data.logoResolvedUrl).toContain("logos/client-1/");
    expect(storage.putObject).toHaveBeenCalledTimes(1);

    const profile = await service.getTenantProfile("client-1");
    expect(profile.ok).toBe(true);
    if (profile.ok) {
      expect(profile.data.logoResolvedUrl).toContain("logos/client-1/");
    }
  });

  it("rechaza SVG o archivos mayores a 5 MiB al subir logotipo", async () => {
    const svgBuffer = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>", "utf8");
    const svgRes = await service.uploadTenantLogo("client-1", "tenant_owner", {
      buffer: svgBuffer,
      originalFilename: "logo.svg",
    });
    expect(svgRes.ok).toBe(false);
    if (!svgRes.ok) expect(svgRes.code).toBe("VALIDATION_ERROR");

    const hugeBuffer = Buffer.alloc(MAX_TENANT_LOGO_BYTES + 1, 0);
    const sizeRes = await service.uploadTenantLogo("client-1", "tenant_owner", {
      buffer: hugeBuffer,
      originalFilename: "huge.png",
    });
    expect(sizeRes.ok).toBe(false);
    if (!sizeRes.ok) expect(sizeRes.code).toBe("VALIDATION_ERROR");
  });

  it("permite quitar el logotipo dejando logoMediaId y logoResolvedUrl en null", async () => {
    repo.row.logoMediaId = "019a0000-0000-7000-8000-000000000123";
    const removed = await service.removeTenantLogo("client-1", "tenant_owner");
    expect(removed.ok).toBe(true);
    expect(repo.row.logoMediaId).toBeNull();
  });
});
