import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  uploadAdminAiProviderLogo,
  createAdminAiProvider,
  createAdminAiModel,
  saveAdminPlatformTrialKey,
  updateAdminPlatformKeySettings,
  setAdminPlatformKeyPriority,
} from "./admin-dashboard.service";
import type { S3StorageService } from "./s3-storage.service";

const VALID_PNG_HEADER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89,
]);

describe("SPEC-02 Fase 2 · Gobernanza AI Admin (Logos, Proveedores, Modelos y Llaves)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sube logotipo PNG válido <= 2 MB a SeaweedFS vía uploadAdminAiProviderLogo", async () => {
    const mockS3 = {
      putObject: vi.fn(async () => ({ ok: true })),
    } as unknown as S3StorageService;

    const res = await uploadAdminAiProviderLogo(
      {
        fileBuffer: VALID_PNG_HEADER,
        originalFilename: "groq-logo.png",
        providerCode: "groq",
        actorUserId: "owner-1",
      },
      { s3Storage: mockS3 },
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.storageKey).toMatch(/^ai-providers\/logos\/groq\/.*\.png$/);
      expect(res.data.mimeType).toBe("image/png");
      expect(res.data.format).toBe("png");
    }
    expect(mockS3.putObject).toHaveBeenCalledTimes(1);
  });

  it("rechaza archivo vacío o mayor a 2 MB en uploadAdminAiProviderLogo", async () => {
    const mockS3 = {
      putObject: vi.fn(async () => ({ ok: true })),
    } as unknown as S3StorageService;

    const emptyRes = await uploadAdminAiProviderLogo(
      {
        fileBuffer: Buffer.alloc(0),
        originalFilename: "empty.png",
      },
      { s3Storage: mockS3 },
    );
    expect(emptyRes.ok).toBe(false);
    if (!emptyRes.ok) {
      expect(emptyRes.code).toBe("MEDIA_EMPTY");
    }

    const oversized = Buffer.concat([VALID_PNG_HEADER, Buffer.alloc(2 * 1024 * 1024 + 10)]);
    const bigRes = await uploadAdminAiProviderLogo(
      {
        fileBuffer: oversized,
        originalFilename: "huge.png",
      },
      { s3Storage: mockS3 },
    );
    expect(bigRes.ok).toBe(false);
    if (!bigRes.ok) {
      expect(bigRes.code).toBe("MEDIA_TOO_LARGE");
    }
    expect(mockS3.putObject).not.toHaveBeenCalled();
  });

  it("rechaza SVG y GIF animados por seguridad en uploadAdminAiProviderLogo", async () => {
    const mockS3 = {
      putObject: vi.fn(async () => ({ ok: true })),
    } as unknown as S3StorageService;

    const svgBuffer = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>");
    const svgRes = await uploadAdminAiProviderLogo(
      {
        fileBuffer: svgBuffer,
        originalFilename: "evil.svg",
      },
      { s3Storage: mockS3 },
    );
    expect(svgRes.ok).toBe(false);

    const gifBuffer = Buffer.from("GIF89a\x01\x00\x01\x00\x00\x00\x00;");
    const gifRes = await uploadAdminAiProviderLogo(
      {
        fileBuffer: gifBuffer,
        originalFilename: "anim.gif",
      },
      { s3Storage: mockS3 },
    );
    expect(gifRes.ok).toBe(false);
    expect(mockS3.putObject).not.toHaveBeenCalled();
  });

  it("valida slug regex, dialecto y URL base en createAdminAiProvider antes de persistir", async () => {
    const badSlug = await createAdminAiProvider({
      code: "Invalid Slug!",
      name: "Bad",
      apiDialect: "openai_compatible",
      baseUrl: "https://api.example.com/v1",
    });
    expect(badSlug.ok).toBe(false);
    if (!badSlug.ok) expect(badSlug.code).toBe("VALIDATION_ERROR");

    const badUrl = await createAdminAiProvider({
      code: "groq",
      name: "Groq",
      apiDialect: "openai_compatible",
      baseUrl: "ftp://insecure.example.com",
    });
    expect(badUrl.ok).toBe(false);
    if (!badUrl.ok) expect(badUrl.code).toBe("VALIDATION_ERROR");
  });

  it("valida rango de temperatura (0..2) y maxTokens (64..8192) en createAdminAiModel y llaves de plataforma", async () => {
    const badModelTemp = await createAdminAiModel({
      providerId: "prov-1",
      modelId: "llama-3.3-70b",
      displayName: "Llama 3.3 70B",
      defaultTemperature: 2.5,
      defaultMaxTokens: 1000,
    });
    expect(badModelTemp.ok).toBe(false);
    if (!badModelTemp.ok) expect(badModelTemp.code).toBe("VALIDATION_ERROR");

    const badModelTokens = await createAdminAiModel({
      providerId: "prov-1",
      modelId: "llama-3.3-70b",
      displayName: "Llama 3.3 70B",
      defaultTemperature: 0.7,
      defaultMaxTokens: 32,
    });
    expect(badModelTokens.ok).toBe(false);
    if (!badModelTokens.ok) expect(badModelTokens.code).toBe("VALIDATION_ERROR");

    const badKeyTemp = await saveAdminPlatformTrialKey({
      providerCode: "openai",
      apiKey: "sk-valid-key-1234",
      temperature: -0.2,
    });
    expect(badKeyTemp.ok).toBe(false);
    if (!badKeyTemp.ok) expect(badKeyTemp.code).toBe("VALIDATION_ERROR");

    const badSettingsTokens = await updateAdminPlatformKeySettings({
      platformKeyId: "pk-1",
      maxTokens: 16000,
    });
    expect(badSettingsTokens.ok).toBe(false);
    if (!badSettingsTokens.ok) expect(badSettingsTokens.code).toBe("VALIDATION_ERROR");

    const badPriority = await setAdminPlatformKeyPriority({
      platformKeyId: "pk-1",
      priorityRole: "tertiary" as unknown as "primary",
    });
    expect(badPriority.ok).toBe(false);
    if (!badPriority.ok) expect(badPriority.code).toBe("VALIDATION_ERROR");

    const badSavePriority = await saveAdminPlatformTrialKey({
      providerCode: "openai",
      apiKey: "sk-valid-key-1234",
      priorityRole: "tertiary" as unknown as "primary",
    });
    expect(badSavePriority.ok).toBe(false);
    if (!badSavePriority.ok) expect(badSavePriority.code).toBe("VALIDATION_ERROR");
  });

  it("acepta logotipo AVIF válido <= 2 MB vía uploadAdminAiProviderLogo", async () => {
    const mockS3 = {
      putObject: vi.fn(async () => ({ ok: true })),
    } as unknown as S3StorageService;

    const avifHeader = Buffer.from([
      0x00, 0x00, 0x00, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66,
      0x00, 0x00, 0x00, 0x00, 0x61, 0x76, 0x69, 0x66, 0x6d, 0x69, 0x66, 0x31,
    ]);

    const res = await uploadAdminAiProviderLogo(
      {
        fileBuffer: avifHeader,
        originalFilename: "groq.avif",
        providerCode: "groq",
      },
      { s3Storage: mockS3 },
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.format).toBe("avif");
      expect(res.data.mimeType).toBe("image/avif");
      expect(res.data.storageKey).toMatch(/^ai-providers\/logos\/groq\/.*\.avif$/);
    }
  });
});
