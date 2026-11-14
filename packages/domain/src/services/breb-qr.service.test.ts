import { describe, expect, it } from "vitest";
import { BreBQrService, computeEmvCrc16Ccitt, type BreBChannelConfig } from "./breb-qr.service";

const validConfig: BreBChannelConfig = {
  isEnabled: true,
  supportedCountries: ["CO"],
  breBKeyType: "email",
  breBKeyValue: "pagos@mocter.co",
  breBRecipientName: "MOCTER SAS",
};

describe("SPEC-04 T-02 · BreBQrService", () => {
  const service = new BreBQrService();

  it("construye payload EMVCo dinámico con monto exacto en COP, moneda ISO 170, CRC válido y SVG con fondo blanco", () => {
    const result = service.buildDynamicBreBPaymentPayload({
      config: validConfig,
      country: "CO",
      currency: "COP",
      amountCents: 14900000, // 149.000 COP
      invoiceNumber: "INV-2026-0001",
      referenceCode: "MOC-0001",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { payload, qrSvg, qrSvgDataUrl, amountCents, currency } = result.data;

    expect(currency).toBe("COP");
    expect(amountCents).toBe(14900000);
    // Point of initiation = 12 (dinámico), moneda COP = 170, país = CO, monto = 149000
    expect(payload).toContain("010212");
    expect(payload).toContain("5303170");
    expect(payload).toContain("5406149000");
    expect(payload).toContain("5802CO");
    expect(payload).toContain("CO.COM.BANREP.BREB");
    expect(payload).toContain("0115pagos@mocter.co");
    expect(payload).not.toContain("0105email");

    // Verificación exacta del CRC-16/CCITT-FALSE en el tag 6304XXXX
    const payloadWithoutCrc = payload.slice(0, -4);
    const trailingCrc = payload.slice(-4);
    expect(payloadWithoutCrc.endsWith("6304")).toBe(true);
    expect(computeEmvCrc16Ccitt(payloadWithoutCrc)).toBe(trailingCrc);

    // SVG con fondo blanco (#FFFFFF) y Data URL válida
    expect(qrSvg).toContain('<rect width="100%" height="100%" fill="#FFFFFF"/>');
    expect(qrSvgDataUrl.startsWith("data:image/svg+xml;base64,")).toBe(true);
  });

  it("codifica el número de celular en Tag 26 sub-etiqueta 01 y nunca el texto del tipo de llave (phone)", () => {
    const result = service.buildDynamicBreBPaymentPayload({
      config: {
        isEnabled: true,
        supportedCountries: ["CO"],
        breBKeyType: "phone",
        breBKeyValue: "3208292559",
        breBRecipientName: "ALEJANDRO HERRERA MONTILLA",
      },
      country: "CO",
      currency: "COP",
      amountCents: 12000000,
      invoiceNumber: "INV-2026-0099",
      referenceCode: "MOC-0099",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.payload).toContain("26360018CO.COM.BANREP.BREB01103208292559");
    expect(result.data.payload).not.toContain("0105phone");
    expect(result.data.payload).toContain("5406120000");
    expect(result.data.amountFormattedCop).toContain("120.000");
    expect(computeEmvCrc16Ccitt(result.data.payload.slice(0, -4))).toBe(result.data.payload.slice(-4));
  });

  it("rechaza comercios fuera de Colombia o facturación distinta a COP con BRE_B_COLOMBIA_ONLY", () => {
    const resCountry = service.buildDynamicBreBPaymentPayload({
      config: validConfig,
      country: "US",
      currency: "COP",
      amountCents: 5000000,
      invoiceNumber: "INV-1",
    });
    expect(resCountry.ok).toBe(false);
    if (!resCountry.ok) expect(resCountry.code).toBe("BRE_B_COLOMBIA_ONLY");

    const resCurrency = service.buildDynamicBreBPaymentPayload({
      config: validConfig,
      country: "CO",
      currency: "USD",
      amountCents: 5000000,
      invoiceNumber: "INV-1",
    });
    expect(resCurrency.ok).toBe(false);
    if (!resCurrency.ok) expect(resCurrency.code).toBe("BRE_B_COLOMBIA_ONLY");
  });

  it("rechaza canal deshabilitado con GATEWAY_DISABLED", () => {
    const res = service.buildDynamicBreBPaymentPayload({
      config: { ...validConfig, isEnabled: false },
      country: "CO",
      currency: "COP",
      amountCents: 5000000,
      invoiceNumber: "INV-2",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("GATEWAY_DISABLED");
  });

  it("rechaza configuración incompleta con BRE_B_NOT_CONFIGURED", () => {
    const res = service.buildDynamicBreBPaymentPayload({
      config: { ...validConfig, breBKeyValue: null },
      country: "CO",
      currency: "COP",
      amountCents: 5000000,
      invoiceNumber: "INV-3",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("BRE_B_NOT_CONFIGURED");
  });

  it("rechaza montos inválidos con INVALID_AMOUNT", () => {
    const res = service.buildDynamicBreBPaymentPayload({
      config: validConfig,
      country: "CO",
      currency: "COP",
      amountCents: 0,
      invoiceNumber: "INV-4",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("INVALID_AMOUNT");
  });
});
