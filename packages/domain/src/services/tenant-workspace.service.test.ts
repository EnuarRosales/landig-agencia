import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  TenantWorkspaceService,
  validateMediaMagicBytes,
  signImgproxyPath,
  buildImgproxyUrl,
  IMGPROXY_DEFAULTS,
} from "./tenant-workspace.service";

vi.mock("../db/client", () => ({
  getDb: vi.fn(),
}));

vi.mock("../db/cell-client", () => ({
  withTenantCellTransaction: vi.fn(),
}));

import { getDb } from "../db/client";
import { withTenantCellTransaction } from "../db/cell-client";

describe("TenantWorkspaceService Unit & Media Suite", () => {
  describe("Media Security & Magic Bytes Validation (D-T2.3)", () => {
    it("should accept valid JPEG header (FF D8 FF)", () => {
      const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      const res = validateMediaMagicBytes(jpeg);
      expect(res.valid).toBe(true);
      expect(res.detectedMime).toBe("image/jpeg");
    });

    it("should accept valid PNG header (89 50 4E 47)", () => {
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
      const res = validateMediaMagicBytes(png);
      expect(res.valid).toBe(true);
      expect(res.detectedMime).toBe("image/png");
    });

    it("should accept valid WEBP header (RIFF....WEBP)", () => {
      const webp = Buffer.from([
        0x52, 0x49, 0x46, 0x46, // 'RIFF'
        0x24, 0x00, 0x00, 0x00, // size
        0x57, 0x45, 0x42, 0x50, // 'WEBP'
      ]);
      const res = validateMediaMagicBytes(webp);
      expect(res.valid).toBe(true);
      expect(res.detectedMime).toBe("image/webp");
    });

    it("should accept valid PDF header (%PDF)", () => {
      const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
      const res = validateMediaMagicBytes(pdf);
      expect(res.valid).toBe(true);
      expect(res.detectedMime).toBe("application/pdf");
    });

    it("should reject executable DOS/PE binary (MZ header)", () => {
      const exe = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03]);
      const res = validateMediaMagicBytes(exe);
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/ejecutables/i);
    });

    it("should reject ELF binary (0x7F 'ELF')", () => {
      const elf = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02]);
      const res = validateMediaMagicBytes(elf);
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/ELF/i);
    });

    it("should reject arbitrary non-media binary", () => {
      const garbage = Buffer.from([0x00, 0x11, 0x22, 0x33, 0x44]);
      const res = validateMediaMagicBytes(garbage);
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/no admitido/i);
    });

    it("should reject empty or undersized buffers (< 4 bytes)", () => {
      const empty = Buffer.alloc(2);
      const res = validateMediaMagicBytes(empty);
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/pequeño|vacío/i);
    });
  });

  describe("imgproxy HMAC-SHA256 URL Signing (D-T1.4 & D-T2.2)", () => {
    beforeEach(() => {
      vi.stubEnv("S3_BUCKET", "media");
      vi.stubEnv("IMGPROXY_KEY", "11".repeat(32));
      vi.stubEnv("IMGPROXY_SALT", "22".repeat(32));
      vi.stubEnv("IMGPROXY_PUBLIC_URL", "https://media.mocter.co");
      vi.stubEnv("IMGPROXY_BASE_URL", "http://imgproxy:8080");
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("should generate URL-safe base64 signature without +, / or =", () => {
      const path = "/resize:fill:300:300:0/plain/s3://media/products/sample.webp";
      const sig = signImgproxyPath(path);

      expect(typeof sig).toBe("string");
      expect(sig.length).toBeGreaterThan(20);
      expect(sig.includes("+")).toBe(false);
      expect(sig.includes("/")).toBe(false);
      expect(sig.includes("=")).toBe(false);
    });

    it("should build valid full imgproxy URL prioritizing IMGPROXY_PUBLIC_URL over IMGPROXY_BASE_URL", () => {
      const url = buildImgproxyUrl("products/client-1/item-123.jpg", {
        width: 600,
        height: 600,
        resizingType: "fill",
        format: "webp",
      });

      expect(url).toContain("/resize:fill:600:600:0/plain/s3://media/products/client-1/item-123.jpg@webp");
      expect(url.startsWith("https://media.mocter.co/")).toBe(true);
      expect(url.startsWith(IMGPROXY_DEFAULTS.baseUrl)).toBe(true);
    });

    it("should reflect updated IMGPROXY_KEY and IMGPROXY_SALT dynamically without hardcoded fallback", () => {
      const path = "/resize:fit:400:400:0/plain/s3://media/products/test.png@webp";
      const sigA = signImgproxyPath(path);
      vi.stubEnv("IMGPROXY_KEY", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
      const sigB = signImgproxyPath(path);

      expect(sigA).not.toBe(sigB);
    });

    it("should throw explicit error when IMGPROXY_KEY or IMGPROXY_SALT are missing", () => {
      vi.stubEnv("IMGPROXY_KEY", "");
      expect(() => signImgproxyPath("/resize:fit:400:400:0/plain/s3://media/a.png@webp")).toThrow(
        /IMGPROXY_KEY e IMGPROXY_SALT son obligatorios/,
      );
    });

    it("should throw explicit error when IMGPROXY_PUBLIC_URL and IMGPROXY_BASE_URL are missing", () => {
      vi.stubEnv("IMGPROXY_PUBLIC_URL", "");
      vi.stubEnv("IMGPROXY_BASE_URL", "");
      expect(() => buildImgproxyUrl("products/a.png")).toThrow(/IMGPROXY_PUBLIC_URL es obligatorio/);
    });

    it("should throw error when requested dimensions exceed 4096px platform limit (D-T2.2)", () => {
      expect(() => {
        buildImgproxyUrl("products/big.png", { width: 5000, height: 600 });
      }).toThrow(/4096px/);
    });
  });

  describe("TenantWorkspaceService Instance & Mock Operations", () => {
    it("should instantiate with default services", () => {
      const service = new TenantWorkspaceService();
      expect(service).toBeDefined();
    });
  });

  describe("TenantWorkspaceService.getDashboard() (SPEC-01 · logoUrl & Zero cellCode)", () => {
    function setupPortalAndCellMocks(options: {
      client?: Record<string, unknown>;
      plan?: Record<string, unknown> | null;
      branding?: Record<string, unknown> | null;
      media?: Record<string, unknown> | null;
      storageLimit?: Record<string, unknown> | null;
    }) {
      const clientRow = options.client ?? {
        id: "client-uuid-1",
        name: "Tienda Demo",
        slug: "tienda-demo",
        currency: "COP",
        planId: "plan-pro",
        logoMediaId: null,
      };

      const responses: unknown[][] = [
        [clientRow],
        options.plan === null ? [] : [options.plan ?? { name: { es: "Plan Pro" } }],
        options.branding === null ? [] : options.branding ? [options.branding] : [],
      ];

      if (!(options.branding as { logoUrl?: string } | undefined)?.logoUrl && clientRow.logoMediaId) {
        responses.push(options.media === null ? [] : options.media ? [options.media] : []);
      }

      responses.push(
        options.storageLimit === null ? [] : [options.storageLimit ?? { value: 104857600, mode: "LIMITED" }],
      );

      let callIndex = 0;
      const mockPortalDb = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => responses[callIndex++] ?? []),
            })),
          })),
        })),
      };

      vi.mocked(getDb).mockReturnValue(mockPortalDb as never);

      const cellResponses: unknown[][] = [
        [{ count: 4 }],
        [{ count: 10 }],
        [{ count: 2 }],
        [{ used: 2048 }],
        [{ botPreset: "natural_rhythm", remindersEnabled: true, faqs: [{ question: "Q", answer: "A" }] }],
      ];
      let cellIdx = 0;
      const mockTx = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => {
              const current = cellResponses[cellIdx++];
              return {
                limit: vi.fn(async () => current ?? []),
                then: (resolve: (val: unknown) => void) => resolve(current ?? []),
              };
            }),
          })),
        })),
      };

      vi.mocked(withTenantCellTransaction).mockImplementation(async (_clientId, fn) => {
        return fn(mockTx as never);
      });
    }

    beforeEach(() => {
      vi.clearAllMocks();
      vi.stubEnv("S3_BUCKET", "media");
      vi.stubEnv("IMGPROXY_KEY", "11".repeat(32));
      vi.stubEnv("IMGPROXY_SALT", "22".repeat(32));
      vi.stubEnv("IMGPROXY_PUBLIC_URL", "https://media.mocter.co");
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("resuelve logoUrl desde clientBrandings.logoUrl y omite cellCode en tenant", async () => {
      setupPortalAndCellMocks({
        branding: { logoUrl: "https://cdn.mocter.co/brands/tienda-demo.png" },
      });

      const service = new TenantWorkspaceService();
      const result = await service.getDashboard("client-uuid-1");

      expect(result.tenant.logoUrl).toBe("https://cdn.mocter.co/brands/tienda-demo.png");
      expect("cellCode" in result.tenant).toBe(false);
      expect((result.tenant as Record<string, unknown>).cellCode).toBeUndefined();
      expect(result.metrics.productsCount).toBe(4);
      expect(result.bot.faqsCount).toBe(1);
    });

    it("hace fallback a clients.logoMediaId -> mediaCatalog -> buildImgproxyUrl cuando no hay branding.logoUrl", async () => {
      setupPortalAndCellMocks({
        client: {
          id: "client-uuid-2",
          name: "Comercio Con Logo Media",
          slug: "comercio-media",
          currency: "USD",
          planId: "plan-pro",
          logoMediaId: "media-uuid-99",
        },
        branding: null,
        media: { storageKey: "logos/client-uuid-2/logo.png" },
      });

      const service = new TenantWorkspaceService();
      const result = await service.getDashboard("client-uuid-2");

      expect(result.tenant.logoUrl).not.toBeNull();
      expect(result.tenant.logoUrl).toContain("https://media.mocter.co/");
      expect(result.tenant.logoUrl).toContain("/resize:fit:200:200:0/plain/s3://media/logos/client-uuid-2/logo.png@webp");
      expect("cellCode" in result.tenant).toBe(false);
    });

    it("retorna logoUrl: null de forma segura cuando no existe branding ni logoMediaId", async () => {
      setupPortalAndCellMocks({
        branding: null,
      });

      const service = new TenantWorkspaceService();
      const result = await service.getDashboard("client-uuid-1");

      expect(result.tenant.logoUrl).toBeNull();
      expect("cellCode" in result.tenant).toBe(false);
    });

    it("retorna logoUrl: null de forma segura cuando buildImgproxyUrl falla por configuración faltante", async () => {
      vi.stubEnv("IMGPROXY_PUBLIC_URL", "");
      vi.stubEnv("IMGPROXY_BASE_URL", "");

      setupPortalAndCellMocks({
        client: {
          id: "client-uuid-3",
          name: "Comercio Sin Imgproxy",
          slug: "comercio-sin-imgproxy",
          currency: "COP",
          planId: "plan-pro",
          logoMediaId: "media-uuid-100",
        },
        branding: null,
        media: { storageKey: "logos/client-uuid-3/logo.png" },
      });

      const service = new TenantWorkspaceService();
      const result = await service.getDashboard("client-uuid-3");

      expect(result.tenant.logoUrl).toBeNull();
      expect("cellCode" in result.tenant).toBe(false);
    });
  });
});

