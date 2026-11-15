import { and, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { ok, err, type Result } from "../types/result";
import { appLogger } from "../utils/logger";
import { getDb } from "../db/client";
import { clients } from "../db/schemas/admin/clients";
import { planCapabilityValues } from "../db/schemas/admin/chatwoot-capabilities";
import {
  clientFeatureOverrides,
  planFeatureValues,
} from "../db/schemas/admin/plan-catalogs";
import {
  clientBrandings,
  type BrandingPaletteTokens,
  type ClientBranding,
} from "../db/schemas/admin/client-brandings";

export type WhiteLabelCapabilityMode = "none" | "paleta" | "completa";

export const ALLOWED_WHITE_LABEL_FONTS = [
  "Inter",
  "Geist",
  "Space Grotesk",
  "Plus Jakarta Sans",
  "DM Sans",
] as const;

export type AllowedWhiteLabelFont = (typeof ALLOWED_WHITE_LABEL_FONTS)[number];

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;
const FQDN_REGEX = /^(?!localhost$)(?!(?:\d{1,3}\.){3}\d{1,3}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

export interface IWhiteLabelRepository {
  findClientPlanWhiteLabelMode(clientId: string): Promise<WhiteLabelCapabilityMode>;
  findClientBranding(clientId: string): Promise<ClientBranding | null>;
  findClientIdByCustomDomain?(domain: string): Promise<string | null>;
  upsertClientBranding(data: {
    clientId: string;
    brandName?: string | null;
    logoUrl?: string | null;
    faviconUrl?: string | null;
    palette?: BrandingPaletteTokens | null;
    removeMocterBranding?: boolean;
    customDomain?: string | null;
    customFont?: string | null;
  }): Promise<ClientBranding>;
  deleteClientBranding(clientId: string): Promise<void>;
}

export interface ContrastValidationResult {
  valid: boolean;
  ratio: number;
  requiredRatio: number;
  message?: string;
}

/**
 * Servicio del motor de marca blanca (white-labeling)
 * (ADM-001 T-28, RF-15, DSN-001 §7, §9).
 */
export class WhiteLabelService {
  constructor (private readonly repo: IWhiteLabelRepository) { }

  /**
   * Valida el ratio de contraste WCAG 2.2 AA entre dos colores hexadecimales (ADM-001 RF-15.4, DSN-001 §9).
   * Exige 4.5:1 para texto normal y 3:1 para elementos de interfaz.
   */
  static validateContrast(
    foregroundHex: string,
    backgroundHex: string,
    isNormalText: boolean = true,
  ): ContrastValidationResult {
    const lum1 = this.calculateRelativeLuminance(foregroundHex);
    const lum2 = this.calculateRelativeLuminance(backgroundHex);

    const brighter = Math.max(lum1, lum2);
    const darker = Math.min(lum1, lum2);
    const ratio = (brighter + 0.05) / (darker + 0.05);

    const requiredRatio = isNormalText ? 4.5 : 3.0;
    const roundedRatio = Math.round(ratio * 100) / 100;

    if (ratio < requiredRatio) {
      return {
        valid: false,
        ratio: roundedRatio,
        requiredRatio,
        message: `El contraste entre ${foregroundHex} y ${backgroundHex} es de ${roundedRatio}:1, inferior al mínimo exigido de ${requiredRatio}:1 (WCAG 2.2 AA).`,
      };
    }

    return {
      valid: true,
      ratio: roundedRatio,
      requiredRatio,
    };
  }

  /**
   * Calcula la luminancia relativa según la fórmula W3C / WCAG.
   */
  static calculateRelativeLuminance(hex: string): number {
    const cleanHex = hex.replace("#", "");
    if (cleanHex.length !== 6) {
      throw new Error(`Formato de color hexadecimal inválido: ${hex}`);
    }

    const r = parseInt(cleanHex.slice(0, 2), 16) / 255;
    const g = parseInt(cleanHex.slice(2, 4), 16) / 255;
    const b = parseInt(cleanHex.slice(4, 6), 16) / 255;

    const sRGB = [r, g, b].map((val) =>
      val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4),
    );

    return 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
  }

  /**
   * Verifica que el dominio tenga formato FQDN válido sin esquema ni puertos locales (`AGENTS.md §4.16`).
   */
  static isValidFqdn(domain: string): boolean {
    const clean = domain.trim().toLowerCase();
    if (!clean || clean.length > 255) return false;
    return FQDN_REGEX.test(clean);
  }

  /**
   * Verifica formato hexadecimal de 6 dígitos (`#RRGGBB`).
   */
  static isValidHexColor(hex: string): boolean {
    return HEX_COLOR_REGEX.test(hex.trim());
  }

  /**
   * Calcula un tono hover levemente oscurecido (~12%) para `--dsn-accent-hover`.
   */
  static computeHoverHex(hex: string): string {
    const clean = hex.replace("#", "").trim();
    if (!/^[0-9A-Fa-f]{6}$/.test(clean)) return hex;
    const factor = 0.88;
    const r = Math.max(0, Math.min(255, Math.round(parseInt(clean.slice(0, 2), 16) * factor)));
    const g = Math.max(0, Math.min(255, Math.round(parseInt(clean.slice(2, 4), 16) * factor)));
    const b = Math.max(0, Math.min(255, Math.round(parseInt(clean.slice(4, 6), 16) * factor)));
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  }

  /**
   * Deriva únicamente las variables CSS de marca seguras para el Backoffice (`/workspace/*`),
   * respetando el modo Claro/Oscuro seleccionado por el usuario (`D-SPEC-07-02`).
   */
  static buildBackofficeCssTokens(
    palette?: BrandingPaletteTokens | null,
  ): Record<string, string> | null {
    if (!palette) return null;
    const accent = palette.accent || palette.primary;
    const accentFg = palette.accentForeground || palette.primaryForeground;
    if (!accent || !WhiteLabelService.isValidHexColor(accent)) {
      return null;
    }

    const tokens: Record<string, string> = {
      "--dsn-accent": accent,
      "--dsn-accent-hover": WhiteLabelService.computeHoverHex(accent),
    };

    if (accentFg && WhiteLabelService.isValidHexColor(accentFg)) {
      tokens["--dsn-accent-fg"] = accentFg;
    }

    return tokens;
  }

  /**
   * Consulta el nivel de capacidad de marca blanca vigente para el inquilino.
   */
  async getCapabilityMode(clientId: string): Promise<WhiteLabelCapabilityMode> {
    return this.repo.findClientPlanWhiteLabelMode(clientId);
  }

  /**
   * Configura o actualiza la identidad visual de marca blanca del inquilino (ADM-001 RF-15, SPEC-07).
   */
  async updateBranding(params: {
    clientId: string;
    brandName?: string | null;
    logoUrl?: string | null;
    faviconUrl?: string | null;
    palette?: BrandingPaletteTokens | null;
    removeMocterBranding?: boolean;
    customDomain?: string | null;
    customFont?: string | null;
  }): Promise<Result<ClientBranding>> {
    try {
      // 1. Validar si el plan habilita la capacidad de marca blanca (RF-15.2)
      const mode = await this.repo.findClientPlanWhiteLabelMode(params.clientId);

      if (mode === "none") {
        return err(
          "El plan contratado no habilita la personalización de marca blanca. Requiere suscripción con personalización de marca.",
          "FORBIDDEN_WHITE_LABEL_NOT_IN_PLAN",
        );
      }

      const normalizedDomain = params.customDomain?.trim().toLowerCase() || null;
      const normalizedFont = params.customFont?.trim() || null;
      const normalizedBrandName = params.brandName?.trim() || null;

      // 2. Si el plan solo habilita 'paleta' (Capa 2), rechazar alteraciones de Capa 1 y 3 (DSN-001 §7)
      if (mode === "paleta") {
        const triesFullFeatures =
          Boolean(params.logoUrl) ||
          Boolean(params.faviconUrl) ||
          Boolean(normalizedBrandName) ||
          Boolean(params.removeMocterBranding) ||
          Boolean(normalizedDomain) ||
          Boolean(normalizedFont);

        if (triesFullFeatures) {
          return err(
            "El plan actual solo autoriza personalización de paleta de colores. Logo, dominio y marca propia requieren plan con marca blanca completa.",
            "FORBIDDEN_FULL_WHITE_LABEL_REQUIRED",
          );
        }
      }

      // 3. Validar tipografía permitida (prevención de inyección CSS)
      if (normalizedFont && !(ALLOWED_WHITE_LABEL_FONTS as readonly string[]).includes(normalizedFont)) {
        return err(
          `Tipografía no autorizada. Fuentes permitidas: ${ALLOWED_WHITE_LABEL_FONTS.join(", ")}.`,
          "INVALID_CUSTOM_FONT",
        );
      }

      // 4. Validar formato FQDN de dominio personalizado y unicidad global (RN-SPEC-07-05)
      if (normalizedDomain) {
        if (!WhiteLabelService.isValidFqdn(normalizedDomain)) {
          return err(
            "El dominio personalizado debe ser un FQDN válido sin esquema ni puertos locales (ej. tienda.miempresa.co).",
            "INVALID_CUSTOM_DOMAIN",
          );
        }

        if (this.repo.findClientIdByCustomDomain) {
          const ownerClientId = await this.repo.findClientIdByCustomDomain(normalizedDomain);
          if (ownerClientId && ownerClientId !== params.clientId) {
            return err(
              "El dominio personalizado ya se encuentra registrado por otro comercio.",
              "CUSTOM_DOMAIN_IN_USE",
            );
          }
        }
      }

      // 5. Validar colores hexadecimales y contraste accesible WCAG 2.2 AA (RF-15.4, DSN-001 §9, RN-SPEC-07-04)
      if (params.palette) {
        const colorEntries = Object.entries(params.palette).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0,
        );
        for (const [tokenName, colorHex] of colorEntries) {
          if (!WhiteLabelService.isValidHexColor(colorHex)) {
            return err(
              `Formato de color hexadecimal inválido para ${tokenName}: ${colorHex}. Usa #RRGGBB.`,
              "INVALID_PALETTE_COLOR",
            );
          }
        }

        const contrastPairs: Array<{ fg?: string; bg?: string; isText: boolean }> = [
          { fg: params.palette.primaryForeground, bg: params.palette.primary, isText: true },
          { fg: params.palette.accentForeground, bg: params.palette.accent, isText: true },
          { fg: params.palette.foreground, bg: params.palette.background, isText: true },
          { fg: params.palette.cardForeground, bg: params.palette.card, isText: true },
          { fg: params.palette.mutedForeground, bg: params.palette.muted, isText: true },
        ];

        for (const pair of contrastPairs) {
          if (pair.fg && pair.bg) {
            const contrast = WhiteLabelService.validateContrast(pair.fg, pair.bg, pair.isText);
            if (!contrast.valid) {
              return err(contrast.message || "Fallo de contraste accesible.", "CONTRAST_RATIO_FAILED");
            }
          }
        }
      }

      // 6. Persistir configuración
      const updated = await this.repo.upsertClientBranding({
        clientId: params.clientId,
        brandName: normalizedBrandName,
        logoUrl: params.logoUrl?.trim() || null,
        faviconUrl: params.faviconUrl?.trim() || null,
        palette: params.palette,
        removeMocterBranding: params.removeMocterBranding ?? false,
        customDomain: normalizedDomain,
        customFont: normalizedFont,
      });

      appLogger.info("[WhiteLabelService] Configuración de marca blanca actualizada", {
        clientId: params.clientId,
        mode,
        hasCustomPalette: !!params.palette,
      });

      return ok(updated);
    } catch (e) {
      appLogger.error("[WhiteLabelService] Error al actualizar marca blanca", e as Error);
      return err("Error interno al configurar marca blanca.", "WHITE_LABEL_UPDATE_ERROR");
    }
  }

  /**
   * Restaura la configuración visual a los valores por defecto en una sola acción (ADM-001 RF-15.5).
   */
  async resetToDefault(clientId: string): Promise<Result<{ restored: boolean }>> {
    try {
      await this.repo.deleteClientBranding(clientId);

      appLogger.info("[WhiteLabelService] Marca blanca restaurada a defaults", {
        clientId,
      });

      return ok({ restored: true });
    } catch (e) {
      appLogger.error("[WhiteLabelService] Error al restaurar marca blanca por defecto", e as Error);
      return err("Error interno al restaurar marca blanca.", "WHITE_LABEL_RESET_ERROR");
    }
  }

  /**
   * Obtiene la configuración de marca blanca activa para el inquilino.
   */
  async getActiveBranding(clientId: string): Promise<Result<ClientBranding | null>> {
    try {
      const mode = await this.repo.findClientPlanWhiteLabelMode(clientId);
      if (mode === "none") {
        return ok(null);
      }

      const branding = await this.repo.findClientBranding(clientId);
      return ok(branding);
    } catch (e) {
      appLogger.error("[WhiteLabelService] Error al consultar marca blanca activa", e as Error);
      return err("Error interno al consultar marca blanca.", "WHITE_LABEL_QUERY_ERROR");
    }
  }
}

/**
 * Repositorio Drizzle ORM para gestión de marca blanca y resolución de capacidad por plan/override (`SPEC-07`).
 */
export class DrizzleWhiteLabelRepository implements IWhiteLabelRepository {
  constructor (private readonly dbProvider: () => any = () => getDb()) { }

  async findClientPlanWhiteLabelMode(clientId: string): Promise<WhiteLabelCapabilityMode> {
    const db = this.dbProvider();
    const now = new Date();

    // 1. Overrides vigentes por inquilino tienen prioridad absoluta (D-SPEC-07-01)
    const overrides = await db
      .select({
        featureKey: clientFeatureOverrides.featureKey,
        enabled: clientFeatureOverrides.enabled,
        value: clientFeatureOverrides.value,
      })
      .from(clientFeatureOverrides)
      .where(
        and(
          eq(clientFeatureOverrides.clientId, clientId),
          inArray(clientFeatureOverrides.featureKey, ["white_label", "custom_branding"]),
          lte(clientFeatureOverrides.validFrom, now),
          or(
            isNull(clientFeatureOverrides.validTo),
            gt(clientFeatureOverrides.validTo, now),
          ),
        ),
      );

    const wlOverride = overrides.find(
      (o: { featureKey: string }) => o.featureKey === "white_label",
    );
    if (wlOverride) {
      if (!wlOverride.enabled) return "none";
      if (wlOverride.value === "paleta" || wlOverride.value === "completa") {
        return wlOverride.value;
      }
      return "completa";
    }

    const customBrandingOverride = overrides.find(
      (o: { featureKey: string }) => o.featureKey === "custom_branding",
    );
    if (customBrandingOverride && !customBrandingOverride.enabled) {
      return "none";
    }

    // 2. Plan asignado al comercio
    const [clientRow] = await db
      .select({ planId: clients.planId })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);

    if (!clientRow?.planId) {
      return customBrandingOverride?.enabled ? "completa" : "none";
    }

    // 3. Valor configurado en admin.plan_feature_values ('white_label')
    const [featureRow] = await db
      .select({
        enabled: planFeatureValues.enabled,
        value: planFeatureValues.value,
      })
      .from(planFeatureValues)
      .where(
        and(
          eq(planFeatureValues.planId, clientRow.planId),
          eq(planFeatureValues.featureKey, "white_label"),
        ),
      )
      .limit(1);

    if (featureRow) {
      if (!featureRow.enabled) {
        return customBrandingOverride?.enabled ? "completa" : "none";
      }
      if (featureRow.value === "completa" || featureRow.value === "paleta") {
        return featureRow.value;
      }
      if (featureRow.value === "none") {
        return customBrandingOverride?.enabled ? "completa" : "none";
      }
    }

    if (customBrandingOverride?.enabled) {
      return "completa";
    }

    // 4. Fallback de compatibilidad sobre plan_capability_values heredado
    const capRows = await db
      .select({
        capabilityCode: planCapabilityValues.capabilityCode,
        enabled: planCapabilityValues.enabled,
      })
      .from(planCapabilityValues)
      .where(
        and(
          eq(planCapabilityValues.planId, clientRow.planId),
          inArray(planCapabilityValues.capabilityCode, [
            "custom_reply_domain",
            "branded_email_templates",
          ]),
        ),
      );

    const hasDomainCap = capRows.some(
      (c: { capabilityCode: string; enabled: boolean }) =>
        c.capabilityCode === "custom_reply_domain" && c.enabled,
    );
    if (hasDomainCap) return "completa";

    const hasEmailBrandingCap = capRows.some(
      (c: { capabilityCode: string; enabled: boolean }) =>
        c.capabilityCode === "branded_email_templates" && c.enabled,
    );
    if (hasEmailBrandingCap) return "paleta";

    return "none";
  }

  async findClientBranding(clientId: string): Promise<ClientBranding | null> {
    const db = this.dbProvider();
    const [row] = await db
      .select()
      .from(clientBrandings)
      .where(eq(clientBrandings.clientId, clientId))
      .limit(1);
    return row ?? null;
  }

  async findClientIdByCustomDomain(domain: string): Promise<string | null> {
    const db = this.dbProvider();
    const clean = domain.trim().toLowerCase();
    const [row] = await db
      .select({ clientId: clientBrandings.clientId })
      .from(clientBrandings)
      .where(eq(sql`lower(${clientBrandings.customDomain})`, clean))
      .limit(1);
    return row?.clientId ?? null;
  }

  async upsertClientBranding(data: {
    clientId: string;
    brandName?: string | null;
    logoUrl?: string | null;
    faviconUrl?: string | null;
    palette?: BrandingPaletteTokens | null;
    removeMocterBranding?: boolean;
    customDomain?: string | null;
    customFont?: string | null;
  }): Promise<ClientBranding> {
    const db = this.dbProvider();
    const now = new Date();
    const [row] = await db
      .insert(clientBrandings)
      .values({
        clientId: data.clientId,
        brandName: data.brandName ?? null,
        logoUrl: data.logoUrl ?? null,
        faviconUrl: data.faviconUrl ?? null,
        palette: data.palette ?? null,
        removeMocterBranding: Boolean(data.removeMocterBranding),
        customDomain: data.customDomain ?? null,
        customFont: data.customFont ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: clientBrandings.clientId,
        set: {
          brandName: data.brandName !== undefined ? data.brandName : undefined,
          logoUrl: data.logoUrl !== undefined ? data.logoUrl : undefined,
          faviconUrl: data.faviconUrl !== undefined ? data.faviconUrl : undefined,
          palette: data.palette !== undefined ? data.palette : undefined,
          removeMocterBranding:
            data.removeMocterBranding !== undefined ? data.removeMocterBranding : undefined,
          customDomain: data.customDomain !== undefined ? data.customDomain : undefined,
          customFont: data.customFont !== undefined ? data.customFont : undefined,
          updatedAt: now,
        },
      })
      .returning();

    if (!row) {
      throw new Error("No se pudo persistir la configuración de marca blanca.");
    }

    return row;
  }

  async deleteClientBranding(clientId: string): Promise<void> {
    const db = this.dbProvider();
    await db
      .delete(clientBrandings)
      .where(eq(clientBrandings.clientId, clientId));
  }
}

/**
 * Instancia singleton / fábrica del servicio de Marca Blanca respaldada por PostgreSQL.
 */
export function getWhiteLabelService(): WhiteLabelService {
  return new WhiteLabelService(new DrizzleWhiteLabelRepository());
}

