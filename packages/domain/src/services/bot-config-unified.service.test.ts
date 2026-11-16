import { describe, expect, it } from "vitest";
import {
  BOT_DEFAULT_LABELS_SEED,
  buildDefaultBusinessHours,
  buildDefaultTenantBotMessages,
} from "./bot-catalog.seed";
import { serializeShippingPolicyForPrompt } from "./prompt-composer";

describe("SPEC-10 + SPEC-20 · Seeds y serialización unificada del bot", () => {
  it("genera exactamente los 6 mensajes predeterminados en es/en con variables internacionales", () => {
    const esMessages = buildDefaultTenantBotMessages("es");
    const enMessages = buildDefaultTenantBotMessages("en");

    const keys = Object.keys(esMessages).sort();
    expect(keys).toEqual([
      "delivery_issue",
      "dispatch_tracking",
      "handoff",
      "order_confirmation",
      "out_of_hours",
      "welcome",
    ]);

    expect(esMessages.order_confirmation.body).toContain("{{customer_phone}}");
    expect(esMessages.order_confirmation.body).toContain("{{shipping_summary}}");
    expect(esMessages.welcome.enabled).toBe(true);
    expect(enMessages.out_of_hours.body).toContain("{{business_name}}");
  });

  it("deriva horario laboral por defecto con la zona horaria IANA según país ISO", () => {
    const arHours = buildDefaultBusinessHours({ countryCode: "AR" });
    expect(arHours.timezone).toBe("America/Argentina/Buenos_Aires");
    expect(arHours.enabled).toBe(false);
    expect(arHours.schedule.mon.closed).toBe(false);
    expect(arHours.schedule.sun.closed).toBe(true);
  });

  it("incluye las 11 etiquetas semilla combinando 5 funcionales (SPEC-19) y 6 operativas (SPEC-10)", () => {
    expect(BOT_DEFAULT_LABELS_SEED).toHaveLength(11);
    const functional = BOT_DEFAULT_LABELS_SEED.filter((l) => l.category === "functional");
    const operational = BOT_DEFAULT_LABELS_SEED.filter((l) => l.category === "operational");
    expect(functional).toHaveLength(5);
    expect(operational).toHaveLength(6);
    expect(functional.map((l) => l.title)).toContain("compra-realizada");
    expect(operational.map((l) => l.title)).toContain("nuevo_pedido");
  });

  it("serializa TenantShippingPolicy JSONB al texto de prompt en es y en (Q2)", () => {
    const serializedEs = serializeShippingPolicyForPrompt(
      {
        freeShipping: false,
        defaultCostCents: 1500000,
        policyText: "Entregas en 24-48h en ciudades principales.",
        deliveryRules: [{ regionCode: "CO-ANT", city: "Medellín", days: "24h" }],
      },
      "COP",
      "es",
    );
    expect(serializedEs).toContain("Entregas en 24-48h");
    expect(serializedEs).toContain("Medellín, CO-ANT: 24h");

    const serializedFreeEn = serializeShippingPolicyForPrompt(
      {
        freeShipping: true,
        policyText: "Nationwide insured shipping.",
      },
      "USD",
      "en",
    );
    expect(serializedFreeEn).toContain("Free shipping");
    expect(serializedFreeEn).toContain("Nationwide insured shipping.");
  });
});
