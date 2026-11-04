import { describe, it, expect } from "vitest";
import {
  validatePlanLimits,
  validatePlanCapabilities,
  PLAN_DIMENSION_NAMES_ES,
} from "./admin-dashboard.service";

describe("T3 · Admin Plan Validation & Business Rules (S1–S6, S10)", () => {
  describe("validatePlanLimits", () => {
    it("acepta configuración válida con límites finitos e ilimitados", () => {
      const result = validatePlanLimits({
        products: { mode: "LIMITED", value: 500 },
        contacts: { mode: "UNLIMITED", value: null },
        images_per_product: { mode: "LIMITED", value: 10 },
        videos_per_product: { mode: "LIMITED", value: 0 },
      });

      expect(result.ok).toBe(true);
    });

    it("acepta cuota cero como límite finito válido sin interpretarlo como ilimitado (CA-004, RN-003)", () => {
      const result = validatePlanLimits({
        videos_per_product: { mode: "LIMITED", value: 0 },
      });

      expect(result.ok).toBe(true);
    });

    it("rechaza modo LIMITED con valor null (S2, S10)", () => {
      const result = validatePlanLimits({
        products: { mode: "LIMITED", value: null },
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(
          "Ingresa la cantidad permitida para Productos o selecciona Ilimitado.",
        );
        expect(result.code).toBe("LIMIT_VALUE_REQUIRED");
      }
    });

    it("rechaza modo LIMITED con cantidad negativa (S10)", () => {
      const result = validatePlanLimits({
        products: { mode: "LIMITED", value: -5 },
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("La cantidad de Productos debe ser mayor o igual a cero.");
        expect(result.code).toBe("NEGATIVE_LIMIT_VALUE");
      }
    });

    it("rechaza retención de conversaciones menor al piso legal de 30 días (ADM-001 RF-04.5)", () => {
      const result = validatePlanLimits({
        chat_retention_days: { mode: "LIMITED", value: 15 },
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(
          "La retención de conversaciones debe ser de al menos 30 días conforme a la normativa legal.",
        );
        expect(result.code).toBe("CHAT_RETENTION_BELOW_LEGAL_FLOOR");
      }
    });

    it("acepta retención de conversaciones conforme al piso legal o ilimitada", () => {
      const resultFinite = validatePlanLimits({
        chat_retention_days: { mode: "LIMITED", value: 30 },
      });
      expect(resultFinite.ok).toBe(true);

      const resultUnlimited = validatePlanLimits({
        chat_retention_days: { mode: "UNLIMITED", value: null },
      });
      expect(resultUnlimited.ok).toBe(true);
    });

    it("rechaza modo LIMITED con cantidad decimal en contadores (S10)", () => {
      const result = validatePlanLimits({
        tenant_users: { mode: "LIMITED", value: 3.5 },
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("La cantidad de Usuarios por inquilino debe ser un número entero.");
        expect(result.code).toBe("DECIMAL_LIMIT_VALUE");
      }
    });

    it("rechaza modo UNLIMITED con valor numérico no nulo (S2, S10)", () => {
      const result = validatePlanLimits({
        contacts: { mode: "UNLIMITED", value: 100 },
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(
          "Revisa la configuración de Contactos: un límite ilimitado no debe tener una cantidad.",
        );
        expect(result.code).toBe("UNLIMITED_WITH_VALUE");
      }
    });

    it("rechaza cuando el límite finito de agentes supera el de usuarios (S4)", () => {
      const result = validatePlanLimits({
        tenant_users: { mode: "LIMITED", value: 5 },
        chatwoot_agents: { mode: "LIMITED", value: 10 },
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(
          "El límite de agentes no podrá superar el de usuarios cuando ambos sean finitos.",
        );
        expect(result.code).toBe("AGENTS_EXCEED_USERS");
      }
    });

    it("permite agentes menores o iguales a usuarios cuando ambos son finitos", () => {
      const result = validatePlanLimits({
        tenant_users: { mode: "LIMITED", value: 10 },
        chatwoot_agents: { mode: "LIMITED", value: 5 },
      });

      expect(result.ok).toBe(true);
    });
  });

  describe("validatePlanCapabilities", () => {
    it("acepta capacidades comerciales válidas habilitadas", () => {
      const result = validatePlanCapabilities({
        channel_whatsapp: true,
        channel_email: true,
        agent_management: true,
        crm: true,
      });

      expect(result.ok).toBe(true);
    });

    it("rechaza capacidad desconocida o no presente en el catálogo (S10)", () => {
      const result = validatePlanCapabilities({
        unknown_fancy_feature: true,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(
          "La capacidad unknown_fancy_feature no está disponible en la edición o versión instalada.",
        );
        expect(result.code).toBe("CAPABILITY_UNSUPPORTED");
      }
    });

    it("rechaza Captain Classifier como capacidad comercial (S5)", () => {
      const result = validatePlanCapabilities({
        captain_classifier: true,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(
          "La capacidad Captain Classifier no está disponible en la edición o versión instalada.",
        );
        expect(result.code).toBe("CAPABILITY_CAPTAIN_CLASSIFIER_DISABLED");
      }
    });

    it("rechaza Chatwoot V4 como beneficio comercial del plan (S5)", () => {
      const result = validatePlanCapabilities({
        chatwoot_v4: true,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(
          "Chatwoot V4 es una configuración técnica de la instalación, no un beneficio comercial del plan.",
        );
        expect(result.code).toBe("CAPABILITY_CHATWOOT_V4_TECHNICAL");
      }
    });

    it("rechaza Captain Tasks hasta validación funcional (S5)", () => {
      const result = validatePlanCapabilities({
        captain_tasks: true,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(
          "La capacidad Captain Tasks permanece pendiente de validación funcional en Community.",
        );
        expect(result.code).toBe("CAPABILITY_CAPTAIN_TASKS_UNVALIDATED");
      }
    });

    it("ignora capacidades deshabilitadas aunque sean restringidas", () => {
      const result = validatePlanCapabilities({
        captain_classifier: false,
        chatwoot_v4: false,
        captain_tasks: false,
      });

      expect(result.ok).toBe(true);
    });
  });

  describe("PLAN_DIMENSION_NAMES_ES", () => {
    it("cubre todas las 11 dimensiones canónicas", () => {
      expect(PLAN_DIMENSION_NAMES_ES.products).toBe("Productos");
      expect(PLAN_DIMENSION_NAMES_ES.images_per_product).toBe("Imágenes por producto");
      expect(PLAN_DIMENSION_NAMES_ES.videos_per_product).toBe("Videos por producto");
      expect(PLAN_DIMENSION_NAMES_ES.pdfs_per_product).toBe("Archivos PDF por producto");
      expect(PLAN_DIMENSION_NAMES_ES.contacts).toBe("Contactos");
      expect(PLAN_DIMENSION_NAMES_ES.tenant_users).toBe("Usuarios por inquilino");
      expect(PLAN_DIMENSION_NAMES_ES.storage_bytes).toBe("Almacenamiento por inquilino");
      expect(PLAN_DIMENSION_NAMES_ES.chat_retention_days).toBe("Retención de conversaciones");
      expect(PLAN_DIMENSION_NAMES_ES.chatwoot_agents).toBe("Agentes de atención");
      expect(PLAN_DIMENSION_NAMES_ES.chatwoot_inboxes).toBe("Bandejas de entrada");
      expect(PLAN_DIMENSION_NAMES_ES.chatwoot_outbound_emails).toBe("Correos salientes");
    });
  });
});
