import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRegisterLead = vi.hoisted(() => vi.fn());

vi.mock("@mocter/domain", () => ({
  leadService: {
    registerLead: mockRegisterLead,
  },
}));

import { submitDemoRequest } from "./demo-request";
import { demoRequestInitialState } from "./types";

describe("submitDemoRequest (Server Action)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns initial state", () => {
    expect(demoRequestInitialState).toEqual({
      status: "idle",
      fieldErrors: {},
    });
  });

  it("returns field errors when validation fails", async () => {
    mockRegisterLead.mockResolvedValue({
      ok: false,
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      issues: [
        { code: "too_small", path: ["name"] },
        { code: "invalid_format", path: ["email"] },
      ],
    });

    const result = await submitDemoRequest(
      demoRequestInitialState,
      new FormData(),
    );

    expect(result.status).toBe("idle");
    expect(result.fieldErrors).toEqual({
      name: "required",
      email: "email",
    });
  });

  it("returns success when registerLead resolves", async () => {
    mockRegisterLead.mockResolvedValue({
      ok: true,
      data: {
        id: "123e4567-e89b-12d3-a456-426614174000",
        name: "Ada",
        email: "ada@example.com",
        phone: "+57 300 000 0000",
        message: null,
        createdAt: new Date(),
      },
    });

    const result = await submitDemoRequest(
      demoRequestInitialState,
      new FormData(),
    );

    expect(result.status).toBe("success");
    expect(mockRegisterLead).toHaveBeenCalledTimes(1);
  });

  it("returns db reason when registerLead fails with DB error", async () => {
    mockRegisterLead.mockResolvedValue({
      ok: false,
      error: "Database persistence failed",
      code: "DB_ERROR",
    });

    const result = await submitDemoRequest(
      demoRequestInitialState,
      new FormData(),
    );

    expect(result.status).toBe("idle");
    expect(result.reason).toBe("db");
  });
});
