import { describe, it, expect, vi, afterEach } from "vitest";
import { getValidatedEnv, getValidatedMediaEnv, envSchema } from "./env";

describe("Environment Validation with Zod", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });
  it("debe validar correctamente un entorno con DATABASE_URL válida", () => {
    const config = getValidatedEnv({
      DATABASE_URL: "postgres://user:pass@localhost:5432/db",
      NODE_ENV: "test",
    });

    expect(config.DATABASE_URL).toBe("postgres://user:pass@localhost:5432/db");
    expect(config.NODE_ENV).toBe("test");
    expect(config.S3_ENDPOINT).toBe("http://seaweedfs:8333");
    expect(config.S3_REGION).toBe("us-east-1");
    expect(config.S3_BUCKET).toBe("media");
  });

  it("debe asignar development como valor por defecto de NODE_ENV", () => {
    const parsed = envSchema.parse({
      DATABASE_URL: "postgres://localhost/mydb",
    });

    expect(parsed.NODE_ENV).toBe("development");
  });

  it("debe fallar si DATABASE_URL no está presente o está vacía", () => {
    expect(() => {
      getValidatedEnv({
        DATABASE_URL: "",
      });
    }).toThrow();
  });

  it("debe rechazar llaves IMGPROXY_KEY o IMGPROXY_SALT no hexadecimales", () => {
    expect(() => {
      getValidatedEnv({
        DATABASE_URL: "postgres://localhost/mydb",
        IMGPROXY_KEY: "not-hex-key!",
      });
    }).toThrow();

    expect(() => {
      getValidatedEnv({
        DATABASE_URL: "postgres://localhost/mydb",
        IMGPROXY_SALT: "zzzz",
      });
    }).toThrow();
  });

  it("debe validar configuración multimedia estricta cuando todas las credenciales S3/imgproxy están presentes", () => {
    const media = getValidatedMediaEnv({
      S3_ENDPOINT: "http://seaweedfs:8333",
      S3_REGION: "us-east-1",
      S3_BUCKET: "media",
      S3_FORCE_PATH_STYLE: "true",
      S3_ACCESS_KEY_ID: "test-access-key",
      S3_SECRET_ACCESS_KEY: "test-secret-key",
      IMGPROXY_KEY: "4edfca071138b7c6",
      IMGPROXY_SALT: "00c3f5f13128ebfe",
      IMGPROXY_PUBLIC_URL: "https://media.mocter.co",
    });

    expect(media.S3_ENDPOINT).toBe("http://seaweedfs:8333");
    expect(media.S3_BUCKET).toBe("media");
    expect(media.IMGPROXY_PUBLIC_URL).toBe("https://media.mocter.co");
  });

  it("debe fallar getValidatedMediaEnv si faltan credenciales S3 o llaves HMAC de imgproxy", () => {
    expect(() => {
      getValidatedMediaEnv({
        S3_ENDPOINT: "http://seaweedfs:8333",
        S3_REGION: "us-east-1",
        S3_BUCKET: "media",
      });
    }).toThrow(/Media Config Error/);
  });

  it("debe omitir validación de createEnv durante phase-production-build aunque falten secretos", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    vi.stubEnv("SKIP_ENV_VALIDATION", "");
    vi.stubEnv("DATABASE_URL", "");

    const mod = await import("./env");
    expect(mod.env).toBeDefined();
  });

  it("debe exigir validación estricta en producción cuando NEXT_PHASE no es phase-production-build", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "");
    vi.stubEnv("SKIP_ENV_VALIDATION", "");
    vi.stubEnv("DATABASE_URL", "");

    await expect(import("./env")).rejects.toThrow(/Invalid environment variables/);
  });

  it("debe validar correctamente en producción cuando NEXT_PHASE no es phase-production-build y DATABASE_URL es válida", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "phase-production-server");
    vi.stubEnv("SKIP_ENV_VALIDATION", "");
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/db");

    const mod = await import("./env");
    expect(mod.env.DATABASE_URL).toBe("postgres://user:pass@localhost:5432/db");
  });

  it("debe exigir validación estricta en producción cuando SKIP_ENV_VALIDATION es 'false' o '0'", async () => {
    for (const flag of ["false", "0"]) {
      vi.resetModules();
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("NEXT_PHASE", "");
      vi.stubEnv("SKIP_ENV_VALIDATION", flag);
      vi.stubEnv("DATABASE_URL", "");

      await expect(import("./env")).rejects.toThrow(/Invalid environment variables/);
    }
  });

  it("getValidatedEnv debe tolerar ausencia de secretos en phase-production-build y fallar en runtime de producción", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    vi.stubEnv("SKIP_ENV_VALIDATION", "");
    vi.stubEnv("DATABASE_URL", "");

    const buildMod = await import("./env");
    const buildCfg = buildMod.getValidatedEnv();
    expect(buildCfg.DATABASE_URL).toContain("mocter_dummy");

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "phase-production-server");
    vi.stubEnv("SKIP_ENV_VALIDATION", "false");
    vi.stubEnv("DATABASE_URL", "");

    expect(() => buildMod.getValidatedEnv()).toThrow(/Config Error/);
  });
});
