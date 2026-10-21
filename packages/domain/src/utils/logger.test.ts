import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Logger, redactSensitiveData } from "./logger";

describe("Logger & redactSensitiveData", () => {
  it("redacts database credentials in URLs", () => {
    const rawUrl = "postgresql://mocter_admin:SuperSecretPassword123@127.0.0.1:5432/mocter_db";
    const clean = redactSensitiveData(rawUrl);
    expect(clean).toBe("postgresql://mocter_admin:[REDACTED]@127.0.0.1:5432/mocter_db");
    expect(clean).not.toContain("SuperSecretPassword123");
  });

  it("redacts bearer tokens", () => {
    const raw = "Request failed with Bearer secret-token-xyz123";
    const clean = redactSensitiveData(raw);
    expect(clean).toBe("Request failed with Bearer [REDACTED]");
  });

  describe("Logger methods", () => {
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("logs info without crashing and redacts sensitive parameters", () => {
      const logger = new Logger("TestLogger");
      logger.info("Connecting to postgresql://user:pass123@localhost/db", {
        password: "secretValue",
        safeParam: "allowed",
      });

      expect(consoleLogSpy).toHaveBeenCalled();
      const firstCallArg = consoleLogSpy.mock.calls[0][0];
      expect(firstCallArg).toContain("[INFO]");
      expect(firstCallArg).toContain("[REDACTED]");
      expect(firstCallArg).not.toContain("pass123");
    });

    it("logs error and handles Error instances", () => {
      const logger = new Logger("TestLogger");
      const testErr = new Error("Connection failed at postgresql://user:pass123@localhost/db");
      logger.error("DB error occurred", testErr);

      expect(consoleErrorSpy).toHaveBeenCalled();
      const firstArg = consoleErrorSpy.mock.calls[0][0];
      expect(firstArg).toContain("[ERROR]");
      expect(firstArg).toContain("DB error occurred");
    });
  });
});
