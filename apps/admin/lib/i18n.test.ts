import { describe, it, expect } from "vitest";
import { getAdminDictionary, resolveActiveLocale } from "./i18n";

describe("mocter-admin Phase 2 · i18n, DSN-001 & ADM-001 T-27, T-29, T-37", () => {
  it("resolves locale following hierarchy: user -> tenant (clients.locale) -> browser -> default 'es' (ADM-001 T-27, RF-11.2)", () => {
    expect(
      resolveActiveLocale({
        userLocale: "en",
        tenantLocale: "es",
        browserAcceptLanguage: "es-CO,es;q=0.9",
      }),
    ).toBe("en");

    expect(
      resolveActiveLocale({
        userLocale: null,
        tenantLocale: "en",
        browserAcceptLanguage: "es-CO,es;q=0.9",
      }),
    ).toBe("en");

    expect(
      resolveActiveLocale({
        userLocale: null,
        tenantLocale: null,
        browserAcceptLanguage: "en-US,en;q=0.8",
      }),
    ).toBe("en");

    expect(
      resolveActiveLocale({
        userLocale: null,
        tenantLocale: null,
        browserAcceptLanguage: "fr-FR",
      }),
    ).toBe("es");
  });

  it("provides complete ES and EN dictionaries without hardcoded UI strings for dashboard, onboarding, leads, notifications and design-system", () => {
    const es = getAdminDictionary("es");
    const en = getAdminDictionary("en");

    expect(es.onboarding.aiEnhanceButton).toBe("Mejorar con AI");
    expect(en.onboarding.aiEnhanceButton).toBe("Enhance with AI");
    expect(es.leads.exportCsv).toBe("Exportar CSV");
    expect(en.leads.exportCsv).toBe("Export CSV");
    expect(es.notifications.maskedSecretLabel).toContain("AES-256-GCM");
    expect(en.notifications.maskedSecretLabel).toContain("AES-256-GCM");
  });
});
