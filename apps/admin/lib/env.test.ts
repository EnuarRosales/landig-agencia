import { describe, it, expect, vi, afterEach } from "vitest";

describe("Admin env.ts validation behavior", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("omits validation in production during NEXT_PHASE=phase-production-build without runtime secrets", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    vi.stubEnv("SKIP_ENV_VALIDATION", "");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("IMGPROXY_KEY", "");
    vi.stubEnv("IMGPROXY_SALT", "");
    vi.stubEnv("IMGPROXY_PUBLIC_URL", "");
    vi.stubEnv("S3_ACCESS_KEY_ID", "");
    vi.stubEnv("S3_SECRET_ACCESS_KEY", "");

    const mod = await import("@/env");
    expect(mod.env).toBeDefined();
  });

  it("enforces strict runtime validation in production when NEXT_PHASE is not phase-production-build", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "");
    vi.stubEnv("SKIP_ENV_VALIDATION", "");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("IMGPROXY_KEY", "");
    vi.stubEnv("IMGPROXY_SALT", "");
    vi.stubEnv("IMGPROXY_PUBLIC_URL", "");
    vi.stubEnv("S3_ACCESS_KEY_ID", "");
    vi.stubEnv("S3_SECRET_ACCESS_KEY", "");

    await expect(import("@/env")).rejects.toThrow(/Invalid environment variables/);
  });

  it("enforces strict runtime validation in production when NEXT_PHASE=phase-production-server", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "phase-production-server");
    vi.stubEnv("SKIP_ENV_VALIDATION", "");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("IMGPROXY_KEY", "");
    vi.stubEnv("IMGPROXY_SALT", "");
    vi.stubEnv("IMGPROXY_PUBLIC_URL", "");
    vi.stubEnv("S3_ACCESS_KEY_ID", "");
    vi.stubEnv("S3_SECRET_ACCESS_KEY", "");

    await expect(import("@/env")).rejects.toThrow(/Invalid environment variables/);
  });

  it("validates strictly and succeeds in production when all required runtime variables are present", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "");
    vi.stubEnv("SKIP_ENV_VALIDATION", "");
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/mocter");
    vi.stubEnv("IMGPROXY_KEY", "4edfca071138b7c6");
    vi.stubEnv("IMGPROXY_SALT", "00c3f5f13128ebfe");
    vi.stubEnv("IMGPROXY_PUBLIC_URL", "https://media.mocter.co");
    vi.stubEnv("S3_ACCESS_KEY_ID", "access-key-test");
    vi.stubEnv("S3_SECRET_ACCESS_KEY", "secret-key-test");

    const mod = await import("@/env");
    expect(mod.env.DATABASE_URL).toBe("postgres://user:pass@localhost:5432/mocter");
    expect(mod.env.IMGPROXY_PUBLIC_URL).toBe("https://media.mocter.co");
    expect(mod.env.S3_BUCKET).toBe("media");
  });

  it("enforces strict validation in production when SKIP_ENV_VALIDATION is 'false' or '0'", async () => {
    for (const flag of ["false", "0"]) {
      vi.resetModules();
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("NEXT_PHASE", "");
      vi.stubEnv("SKIP_ENV_VALIDATION", flag);
      vi.stubEnv("DATABASE_URL", "");
      vi.stubEnv("IMGPROXY_KEY", "");
      vi.stubEnv("IMGPROXY_SALT", "");
      vi.stubEnv("IMGPROXY_PUBLIC_URL", "");
      vi.stubEnv("S3_ACCESS_KEY_ID", "");
      vi.stubEnv("S3_SECRET_ACCESS_KEY", "");

      await expect(import("@/env")).rejects.toThrow(/Invalid environment variables/);
    }
  });

  it("allows build-time consumers like config/site and /api/health to load during phase-production-build without secrets", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    vi.stubEnv("SKIP_ENV_VALIDATION", "");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("IMGPROXY_KEY", "");
    vi.stubEnv("IMGPROXY_SALT", "");
    vi.stubEnv("IMGPROXY_PUBLIC_URL", "");
    vi.stubEnv("S3_ACCESS_KEY_ID", "");
    vi.stubEnv("S3_SECRET_ACCESS_KEY", "");

    const siteMod = await import("@/config/site");
    const healthMod = await import("@/app/api/health/route");

    expect(siteMod.siteConfig.name).toBe("Mocter");
    expect(typeof healthMod.GET).toBe("function");
  }, 30_000);
});
