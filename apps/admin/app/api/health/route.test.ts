import { describe, it, expect, vi, beforeEach } from "vitest";

const { checkConnectivityMock } = vi.hoisted(() => ({
  checkConnectivityMock: vi.fn(),
}));

vi.mock("@mocter/domain", () => ({
  S3StorageService: class {
    checkConnectivity = checkConnectivityMock;
  },
}));

import { GET } from "./route";

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with status ok and mediaStorage ok when S3 is reachable", async () => {
    checkConnectivityMock.mockResolvedValueOnce("ok");

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ status: "ok", mediaStorage: "ok" });
  });

  it("returns 200 non-blocking with mediaStorage degraded when S3 is unreachable", async () => {
    checkConnectivityMock.mockResolvedValueOnce("degraded");

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ status: "ok", mediaStorage: "degraded" });
  });
});
