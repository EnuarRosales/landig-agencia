import { describe, expect, it } from "vitest";

import { leadSchema, type LeadInput } from "./validation.js";

const validLead = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  phone: "+34 600 123 456",
  message: "Me interesa una demo",
};

describe("leadSchema", () => {
  it("accepts a complete valid lead and returns it unchanged", () => {
    const result = leadSchema.safeParse(validLead);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data).toEqual(validLead);
  });

  it("normalizes an absent message to null", () => {
    const result = leadSchema.safeParse({
      name: "Grace Hopper",
      email: "grace@example.com",
      phone: "600 123 456",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.message).toBeNull();
  });

  it("accepts an explicit null message as null", () => {
    const result = leadSchema.safeParse({ ...validLead, message: null });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.message).toBeNull();
  });

  it("accepts names up to 120 characters and rejects longer names", () => {
    expect(leadSchema.safeParse({ ...validLead, name: "a".repeat(120) }).success).toBe(true);
    expect(leadSchema.safeParse({ ...validLead, name: "a".repeat(121) }).success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = leadSchema.safeParse({ ...validLead, email: "not-an-email" });

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error.issues.some((issue) => issue.path.join(".") === "email")).toBe(true);
  });

  it("rejects phone numbers shorter than 7 characters", () => {
    const result = leadSchema.safeParse({ ...validLead, phone: "12345" });

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error.issues.some((issue) => issue.path.join(".") === "phone")).toBe(true);
  });

  it("rejects phone numbers longer than 20 characters", () => {
    const longPhone = "600 123 456 789 012 34"; // 22 digits including spaces

    const result = leadSchema.safeParse({ ...validLead, phone: longPhone });

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error.issues.some((issue) => issue.path.join(".") === "phone")).toBe(true);
  });

  it("rejects phone numbers containing non-phone characters", () => {
    const result = leadSchema.safeParse({ ...validLead, phone: "call me!!" });

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error.issues.some((issue) => issue.path.join(".") === "phone")).toBe(true);
  });

  it("accepts messages up to 2000 characters and rejects longer messages", () => {
    const longMessageEven = "a".repeat(2000);
    const longMessageOdd = "a".repeat(2001);

    expect(leadSchema.safeParse({ ...validLead, message: longMessageEven }).success).toBe(true);
    expect(leadSchema.safeParse({ ...validLead, message: longMessageOdd }).success).toBe(false);
  });

  it("rejects missing required fields", () => {
    const { name: _name, ...leadWithoutName } = validLead;
    const { phone: _phone, ...leadWithoutPhone } = validLead;

    expect(leadSchema.safeParse(leadWithoutName).success).toBe(false);
    expect(leadSchema.safeParse(leadWithoutPhone).success).toBe(false);
    expect(leadSchema.safeParse({ ...validLead, email: undefined }).success).toBe(false);
  });

  it("returns a LeadInput typed value from parse", () => {
    const input: LeadInput = leadSchema.parse(validLead);

    expect(input.name).toBe(validLead.name);
    expect(input.email).toBe(validLead.email);
    expect(typeof input.phone).toBe("string");
    expect(input.message).toBe("Me interesa una demo");
  });
});
