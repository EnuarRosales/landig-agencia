/**
 * Deterministic test fixtures for Mocter E2E scenarios.
 */

export const fixtures = {
  // Existing tenant under reconciliation
  synergiaMarket: {
    id: "01a1bc84-cc30-73b6-bc84-1f0cda5a9661",
    slug: "synergia-market",
    displayName: "Synergia Market",
    ownerEmail: "synergiamarket25@gmail.com",
    cellCode: "cell-01",
    cellId: "6ae5619b-7ca3-4764-baae-1b8950a8e534",
    initialStatus: "alta",
    expectedRole: "tenant_owner",
  },

  // Platform operator fixture
  platformOwner: {
    email: "platform.owner@mocter.co",
    role: "platform_owner",
    scope: "platform",
    expectedRoute: "/admin",
    shellComponent: "AdminShell",
  },

  // Prospect self-service fixture
  prospectUser: {
    email: "prospect.selfservice@testmocter.com",
    scope: "onboarding_prospect",
    expectedRoute: "/onboarding",
    shellComponent: "TenantOnboardingWizard",
  },

  // Two independent tenants for cross-tenant isolation testing
  tenantAlpha: {
    id: "01932b1a-0001-7000-8000-000000000001",
    slug: "tenant-alpha",
    displayName: "Tenant Alpha Electronics",
    email: "owner@tenant-alpha.com",
  },
  tenantBeta: {
    id: "01932b1a-0002-7000-8000-000000000002",
    slug: "tenant-beta",
    displayName: "Tenant Beta Fashion",
    email: "owner@tenant-beta.com",
  },

  // Sample product payload for onboarding step 2
  sampleProduct: {
    title: "Camisa Oxford Premium",
    priceCents: 120000, // $120.000 COP
    currency: "COP",
    kind: "physical",
    description: "Camisa de algodón egipcio con corte regular, cuello abotonado y acabados reforzados.",
    stock: 25,
  },

  // Sample bot preset payload for onboarding step 3
  sampleBotPreset: {
    preset: "retail_ecommerce",
    paymentMethods: ["wompi", "contraentrega", "transferencia_bancaria"],
    shippingPolicy: "Despachos a todo el país en 24-48 horas hábiles vía Coordinadora.",
    warrantyPolicy: "Garantía de 30 días por defectos de fábrica.",
    closingMessage: "¡Gracias por comunicarte con nosotros! Un asesor te responderá enseguida.",
  },
};
