import { describe, it, expect, vi } from "vitest";
import { LeadService } from "./lead.service";
import type { ILeadRepository } from "../repositories/lead.repository.interface";
import type { Lead } from "../db/schemas";

describe("LeadService", () => {
  const mockLead: Lead = {
    id: "uuid-1234",
    name: "Maria Lopez",
    email: "maria@example.com",
    phone: "+573111234567",
    message: "Deseo información",
    status: "new",
    assignedToUserId: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    updatedBy: "public_landing",
  };

  it("validates and registers a lead successfully", async () => {
    const mockRepo: ILeadRepository = {
      create: vi.fn().mockResolvedValue(mockLead),
      findById: vi.fn(),
      findByEmail: vi.fn(),
    };

    const service = new LeadService(mockRepo);
    const result = await service.registerLead({
      name: "Maria Lopez",
      email: "maria@example.com",
      phone: "+573111234567",
      message: "Deseo información",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual(mockLead);
    }
    expect(mockRepo.create).toHaveBeenCalledTimes(1);
  });

  it("returns validation error when payload is missing required fields", async () => {
    const mockRepo: ILeadRepository = {
      create: vi.fn(),
      findById: vi.fn(),
      findByEmail: vi.fn(),
    };

    const service = new LeadService(mockRepo);
    const result = await service.registerLead({
      name: "",
      email: "not-an-email",
      phone: "123", // too short
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("VALIDATION_ERROR");
      expect(result.issues).toBeDefined();
    }
    expect(mockRepo.create).not.toHaveBeenCalled();
  });

  it("returns DB_ERROR when repository throws an exception", async () => {
    const mockRepo: ILeadRepository = {
      create: vi.fn().mockRejectedValue(new Error("Connection timeout")),
      findById: vi.fn(),
      findByEmail: vi.fn(),
    };

    const service = new LeadService(mockRepo);
    const result = await service.registerLead({
      name: "Maria Lopez",
      email: "maria@example.com",
      phone: "+573111234567",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("DB_ERROR");
      expect(result.error).toBe("Database persistence failed");
    }
  });
});
