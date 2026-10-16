import { beforeEach, describe, expect, it, vi } from "vitest";

const mockLeadSchema = vi.hoisted(() => ({
  safeParse: vi.fn(),
}));
const mockInsertLead = vi.hoisted(() => vi.fn());

vi.mock("@mocter/domain", () => ({
  leadSchema: mockLeadSchema,
  insertLead: mockInsertLead,
}));

import { submitDemoRequest, demoRequestInitialState } from "./demo-request";

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
    mockLeadSchema.safeParse.mockReturnValue({
      success: false,
      error: {
        issues: [
          { code: "too_small", path: ["name"] },
          { code: "invalid_format", path: ["email"] },
        ],
      },
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

  it("returns success when insertLead resolves", async () => {
    mockLeadSchema.safeParse.mockReturnValue({
      success: true,
      data: {
        name: "Ada",
        email: "ada@example.com",
        phone: "+57 300 000 0000",
        message: null,
      },
    });
    mockInsertLead.mockResolvedValue({
      id: "123e4567-e89b-12d3-a456-426614174000",
      name: "Ada",
      email: "ada@example.com",
      phone: "+57 300 000 0000",
      message: null,
      createdAt: new Date(),
    });

    const result = await submitDemoRequest(
      demoRequestInitialState,
      new FormData(),
    );

    expect(result.status).toBe("success");
    expect(mockInsertLead).toHaveBeenCalledTimes(1);
  });

  it("returns db reason when insertLead fails", async () => {
    mockLeadSchema.safeParse.mockReturnValue({
      success: true,
      data: {
        name: "Ada",
        email: "ada@example.com",
        phone: "+57 300 000 0000",
        message: null,
      },
    });
    mockInsertLead.mockRejectedValue(new Error("DB down"));

    const result = await submitDemoRequest(
      demoRequestInitialState,
      new FormData(),
    );

    expect(result.status).toBe("idle");
    expect(result.reason).toBe("db");
  });
});
