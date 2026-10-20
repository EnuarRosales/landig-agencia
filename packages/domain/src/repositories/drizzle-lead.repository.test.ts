import { describe, it, expect, vi } from "vitest";
import { DrizzleLeadRepository } from "./drizzle-lead.repository";
import type { Lead } from "../db/schema";

describe("DrizzleLeadRepository", () => {
  const mockLead: Lead = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    name: "Carlos Developer",
    email: "carlos@example.com",
    phone: "+573001234567",
    message: "Hola",
    createdAt: new Date(),
  };

  it("creates a lead successfully", async () => {
    const mockDb = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockLead]),
        }),
      }),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repo = new DrizzleLeadRepository(() => mockDb as any);
    const result = await repo.create({
      name: "Carlos Developer",
      email: "carlos@example.com",
      phone: "+573001234567",
      message: "Hola",
    });

    expect(result).toEqual(mockLead);
    expect(mockDb.insert).toHaveBeenCalled();
  });

  it("throws when insert returns no rows", async () => {
    const mockDb = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repo = new DrizzleLeadRepository(() => mockDb as any);
    await expect(
      repo.create({
        name: "Carlos Developer",
        email: "carlos@example.com",
        phone: "+573001234567",
        message: null,
      }),
    ).rejects.toThrow("insert returned no rows");
  });
});
