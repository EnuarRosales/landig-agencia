import { describe, it, expect, vi } from "vitest";
import {
  WhiteLabelService,
  type IWhiteLabelRepository,
} from "./white-label.service";

describe("ADM-001 T-28 · WhiteLabelService (Motor de Marca Blanca)", () => {
  const mockRepo: IWhiteLabelRepository = {
    findClientPlanWhiteLabelMode: vi.fn(),
    findClientBranding: vi.fn(),
    upsertClientBranding: vi.fn(),
    deleteClientBranding: vi.fn(),
  };

  const service = new WhiteLabelService(mockRepo);

  describe("Validación de contraste accesible (WCAG 2.2 AA)", () => {
    it("aprueba combinación de alto contraste (#FFFFFF sobre #1E3A8A azul marino)", () => {
      const res = WhiteLabelService.validateContrast("#FFFFFF", "#1E3A8A", true);
      expect(res.valid).toBe(true);
      expect(res.ratio).toBeGreaterThan(4.5);
    });

    it("rechaza combinación de bajo contraste (#FFFFFF sobre #FDE047 amarillo claro) con mensaje explícito (RF-15.4)", () => {
      const res = WhiteLabelService.validateContrast("#FFFFFF", "#FDE047", true);
      expect(res.valid).toBe(false);
      expect(res.ratio).toBeLessThan(4.5);
      expect(res.message).toContain("inferior al mínimo exigido de 4.5:1 (WCAG 2.2 AA)");
    });
  });

  describe("Control de acceso por plan (RF-15.2)", () => {
    it("rechaza la personalización si el plan tiene white_label = 'none'", async () => {
      vi.mocked(mockRepo.findClientPlanWhiteLabelMode).mockResolvedValueOnce("none");

      const res = await service.updateBranding({
        clientId: "client-free",
        brandName: "Mi Marca",
      });

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.code).toBe("FORBIDDEN_WHITE_LABEL_NOT_IN_PLAN");
    });

    it("rechaza personalización de logo o dominio si el plan solo habilita 'paleta'", async () => {
      vi.mocked(mockRepo.findClientPlanWhiteLabelMode).mockResolvedValueOnce("paleta");

      const res = await service.updateBranding({
        clientId: "client-pro",
        logoUrl: "https://empresa.com/logo.png",
      });

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.code).toBe("FORBIDDEN_FULL_WHITE_LABEL_REQUIRED");
    });

    it("permite personalizar paleta en plan 'paleta' cuando cumple el contraste accesible", async () => {
      vi.mocked(mockRepo.findClientPlanWhiteLabelMode).mockResolvedValueOnce("paleta");
      vi.mocked(mockRepo.upsertClientBranding).mockResolvedValueOnce({
        clientId: "client-pro",
        brandName: null,
        logoUrl: null,
        faviconUrl: null,
        palette: {
          primary: "#1E3A8A",
          primaryForeground: "#FFFFFF",
        },
        removeMocterBranding: false,
        customDomain: null,
        customFont: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "system",
        updatedBy: "system",
      });

      const res = await service.updateBranding({
        clientId: "client-pro",
        palette: {
          primary: "#1E3A8A",
          primaryForeground: "#FFFFFF",
        },
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.data.palette?.primary).toBe("#1E3A8A");
    });

    it("rechaza la actualización de paleta si no cumple el contraste WCAG 2.2 AA", async () => {
      vi.mocked(mockRepo.findClientPlanWhiteLabelMode).mockResolvedValueOnce("paleta");

      const res = await service.updateBranding({
        clientId: "client-pro",
        palette: {
          primary: "#FDE047",
          primaryForeground: "#FFFFFF",
        },
      });

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.code).toBe("CONTRAST_RATIO_FAILED");
    });

    it("permite personalización completa (logo, paleta, dominio) en plan 'completa'", async () => {
      vi.mocked(mockRepo.findClientPlanWhiteLabelMode).mockResolvedValueOnce("completa");
      vi.mocked(mockRepo.upsertClientBranding).mockResolvedValueOnce({
        clientId: "client-enterprise",
        brandName: "Corporación Alfa",
        logoUrl: "https://alfa.com/logo.svg",
        faviconUrl: "https://alfa.com/favicon.ico",
        palette: {
          primary: "#0F172A",
          primaryForeground: "#F8FAFC",
        },
        removeMocterBranding: true,
        customDomain: "portal.alfa.com",
        customFont: "Space Grotesk",
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "system",
        updatedBy: "system",
      });

      const res = await service.updateBranding({
        clientId: "client-enterprise",
        brandName: "Corporación Alfa",
        logoUrl: "https://alfa.com/logo.svg",
        faviconUrl: "https://alfa.com/favicon.ico",
        palette: {
          primary: "#0F172A",
          primaryForeground: "#F8FAFC",
        },
        removeMocterBranding: true,
        customDomain: "portal.alfa.com",
        customFont: "Space Grotesk",
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.data.removeMocterBranding).toBe(true);
      expect(res.data.customDomain).toBe("portal.alfa.com");
    });
  });

  describe("Restauración a default (RF-15.5)", () => {
    it("restaura la configuración a los valores por defecto en una sola acción", async () => {
      vi.mocked(mockRepo.deleteClientBranding).mockResolvedValueOnce();

      const res = await service.resetToDefault("client-enterprise");

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.data.restored).toBe(true);
      expect(mockRepo.deleteClientBranding).toHaveBeenCalledWith("client-enterprise");
    });
  });
});
