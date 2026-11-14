import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

vi.mock("@mocter/domain", () => ({
  appLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  uploadAdminAiProviderLogo: vi.fn().mockImplementation(async (input: { fileBuffer: Buffer; originalFilename: string }) => {
    const str = input.fileBuffer.toString("utf8");
    if (str.includes("<svg")) {
      return {
        ok: false,
        error: "Formato SVG rechazado por seguridad.",
        code: "UNSUPPORTED_MEDIA_FORMAT",
      };
    }
    return {
      ok: true,
      data: {
        storageKey: "ai-providers/logos/groq/abc.png",
        logoUrl: "https://media.mocter.co/sig/rs:fit:96:96:0/plain/s3://media/ai-providers/logos/groq/abc.png@webp",
        mimeType: "image/png",
        format: "png",
        sizeBytes: input.fileBuffer.length,
      },
    };
  }),
}));

describe("SPEC-02 Fase 2 · POST /api/admin/ai/providers/logo", () => {
  it("responde 200 con storageKey y logoUrl al subir imagen PNG válida <= 2 MB", async () => {
    const form = new FormData();
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    form.append("file", new File([pngBytes], "groq.png", { type: "image/png" }));
    form.append("providerCode", "groq");

    const req = new NextRequest("http://localhost:3003/api/admin/ai/providers/logo", {
      method: "POST",
      body: form,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      data: { storageKey: string; logoUrl: string; format: string };
    };
    expect(json.ok).toBe(true);
    expect(json.data.storageKey).toBe("ai-providers/logos/groq/abc.png");
    expect(json.data.logoUrl).toContain("https://media.mocter.co/");
  });

  it("retorna 400 RFC 9457 cuando falta el campo file en multipart", async () => {
    const form = new FormData();
    form.append("providerCode", "groq");

    const req = new NextRequest("http://localhost:3003/api/admin/ai/providers/logo", {
      method: "POST",
      body: form,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
  });

  it("retorna 422 RFC 9457 cuando el archivo excede 2 MB o es SVG rechazado", async () => {
    const svgForm = new FormData();
    svgForm.append(
      "file",
      new File(["<svg><script>alert(1)</script></svg>"], "evil.svg", {
        type: "image/svg+xml",
      }),
    );

    const svgRes = await POST(
      new NextRequest("http://localhost:3003/api/admin/ai/providers/logo", {
        method: "POST",
        body: svgForm,
      }),
    );
    expect(svgRes.status).toBe(422);
    expect(svgRes.headers.get("content-type")).toContain("application/problem+json");

    const bigBytes = new Uint8Array(2 * 1024 * 1024 + 5);
    const bigForm = new FormData();
    bigForm.append("file", new File([bigBytes], "huge.png", { type: "image/png" }));

    const bigRes = await POST(
      new NextRequest("http://localhost:3003/api/admin/ai/providers/logo", {
        method: "POST",
        body: bigForm,
      }),
    );
    expect(bigRes.status).toBe(422);
    const bigJson = (await bigRes.json()) as { code: string };
    expect(bigJson.code).toBe("MEDIA_TOO_LARGE");
  });
});
