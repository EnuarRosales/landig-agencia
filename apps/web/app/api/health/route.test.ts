import { describe, it, expect, vi, beforeEach } from "vitest";
import * as domain from "@mocter/domain";
import { GET } from "./route";

vi.mock("@mocter/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof domain>();
  return {
    ...actual,
    checkDatabaseConnection: vi.fn(),
  };
});

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 and healthy when database is reachable", async () => {
    vi.mocked(domain.checkDatabaseConnection).mockResolvedValue({
      ok: true,
      latencyMs: 3,
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("healthy");
    expect(data.services.database.status).toBe("up");
    expect(data.services.database.latencyMs).toBe(3);
  });

  it("returns 503 and unhealthy when database connection fails", async () => {
    vi.mocked(domain.checkDatabaseConnection).mockResolvedValue({
      ok: false,
      latencyMs: 15,
      error: "Connection timeout",
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.status).toBe("unhealthy");
    expect(data.services.database.status).toBe("down");
    expect(data.services.database.error).toBe("Connection timeout");
  });
});
