import { ok, err, type Result } from "../types/result";
import { appLogger } from "../utils/logger";
import type {
  BrandingPaletteTokens,
  ClientBranding,
} from "../db/schemas/admin/client-brandings";

export type WhiteLabelCapabilityMode = "none" | "paleta" | "completa";

export interface IWhiteLabelRepository {
  findClientPlanWhiteLabelMode(clientId: string): Promise<WhiteLabelCapabilityMode>;
  findClientBranding(clientId: string): Promise<ClientBranding | null>;
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
  constructor(private readonly repo: IWhiteLabelRepository) {}

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
   * Configura o actualiza la identidad visual de marca blanca del inquilino (ADM-001 RF-15).
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
          "El plan contratado no habilita la personalización de marca blanca. Requiere suscripción Pro o Enterprise.",
          "FORBIDDEN_WHITE_LABEL_NOT_IN_PLAN",
        );
      }

      // 2. Si el plan solo habilita 'paleta' (Capa 2), rechazar alteraciones de Capa 1 y 3 (DSN-001 §7)
      if (mode === "paleta") {
        const triesFullFeatures =
          params.logoUrl ||
          params.faviconUrl ||
          params.brandName ||
          params.removeMocterBranding ||
          params.customDomain ||
          params.customFont;

        if (triesFullFeatures) {
          return err(
            "El plan actual solo autoriza personalización de paleta de colores. Logo, dominio y marca propia requieren plan con marca blanca completa.",
            "FORBIDDEN_FULL_WHITE_LABEL_REQUIRED",
          );
        }
      }

      // 3. Validar contraste accesible si se proporciona paleta (RF-15.4, DSN-001 §9)
      if (params.palette) {
        if (params.palette.primary && params.palette.primaryForeground) {
          const contrast = WhiteLabelService.validateContrast(
            params.palette.primaryForeground,
            params.palette.primary,
            true, // texto sobre botón primario
          );

          if (!contrast.valid) {
            return err(contrast.message || "Fallo de contraste accesible.", "CONTRAST_RATIO_FAILED");
          }
        }

        if (params.palette.accent && params.palette.accentForeground) {
          const contrast = WhiteLabelService.validateContrast(
            params.palette.accentForeground,
            params.palette.accent,
            true,
          );

          if (!contrast.valid) {
            return err(contrast.message || "Fallo de contraste accesible.", "CONTRAST_RATIO_FAILED");
          }
        }
      }

      // 4. Persistir configuración
      const updated = await this.repo.upsertClientBranding({
        clientId: params.clientId,
        brandName: params.brandName,
        logoUrl: params.logoUrl,
        faviconUrl: params.faviconUrl,
        palette: params.palette,
        removeMocterBranding: params.removeMocterBranding ?? false,
        customDomain: params.customDomain,
        customFont: params.customFont,
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
   * Restaura la configuración visual a los valores por defecto de Mocter en una sola acción (ADM-001 RF-15.5).
   */
  async resetToDefault(clientId: string): Promise<Result<{ restored: boolean }>> {
    try {
      await this.repo.deleteClientBranding(clientId);

      appLogger.info("[WhiteLabelService] Marca blanca restaurada a defaults de Mocter", {
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

