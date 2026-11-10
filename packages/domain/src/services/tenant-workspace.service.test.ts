import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  TenantWorkspaceService,
  validateMediaMagicBytes,
  signImgproxyPath,
  buildImgproxyUrl,
  IMGPROXY_DEFAULTS,
} from "./tenant-workspace.service";

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
    it("should generate URL-safe base64 signature without +, / or =", () => {
      const path = "/resize:fill:300:300:0/plain/s3://media/products/sample.webp";
      const sig = signImgproxyPath(path);

      expect(typeof sig).toBe("string");
      expect(sig.length).toBeGreaterThan(20);
      expect(sig.includes("+")).toBe(false);
      expect(sig.includes("/")).toBe(false);
      expect(sig.includes("=")).toBe(false);
    });

    it("should build valid full imgproxy URL with dimensions and format", () => {
      const url = buildImgproxyUrl("products/client-1/item-123.jpg", {
        width: 600,
        height: 600,
        resizingType: "fill",
        format: "webp",
      });

      expect(url).toContain("/resize:fill:600:600:0/plain/s3://media/products/client-1/item-123.jpg@webp");
      expect(url.startsWith(IMGPROXY_DEFAULTS.baseUrl)).toBe(true);
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
});

