import {
  getCountryAddressProfile,
  getLocalizedCountryName,
  inferCandidateCountriesFromE164,
  normalizeGeoText,
  resolveCountryAlpha2FromInput,
  resolveIsoSubdivision,
  type CountryAddressProfile,
} from "../geo/index";
import type { GeoProviderLocation } from "../db/schemas/admin/geo-provider-locations";
import type {
  GeoProviderCode,
  IGeoProviderLocationsRepository,
} from "../repositories/geo-provider-locations.repository.interface";

/** Estado determinístico de resolución geográfica (`SPEC-20 §2.3`). */
export type GeoResolutionStatus = "resolved" | "soft_normalized" | "ambiguous" | "unresolved";

/** Entrada geográfica cruda o semiestructurada entregada por UI, API o bot conversacional. */
export interface LocationResolveInput {
  /** País por defecto configurado en `admin.clients.country_code`. */
  tenantCountryCode?: string | null;
  /** Código de país explícito ISO alpha-2 o nombre ingresado por el usuario. */
  countryInput?: string | null;
  /** Subdivisión administrativa (código ISO 3166-2 o texto libre como `"Antioquia"` / `"CABA"`). */
  stateInput?: string | null;
  /** Código ISO 3166-2 explícito si ya viene seleccionado desde UI. */
  subdivisionCode?: string | null;
  /** Nombre textual de ciudad o municipio. */
  cityInput?: string | null;
  /** Teléfono E.164 del cliente para inferir país candidato cuando no hay país explícito. */
  customerPhoneE164?: string | null;
  /** Proveedores logísticos activos que exigen homologación estricta (ej. `["dropi"]`). */
  activeProviders?: GeoProviderCode[];
}

/** Referencia ACL homologada para un operador logístico específico. */
export interface ProviderGeoRefEntry {
  provider: GeoProviderCode;
  externalId: string;
  externalParentId: string | null;
  subdivisionCode: string | null;
  daneCode: string | null;
  postalCode: string | null;
  name: string;
}

/** Candidato de desambiguación cuando un nombre de ciudad coincide en más de una subdivisión. */
export interface LocationDisambiguationCandidate {
  countryCode: string;
  subdivisionCode: string | null;
  stateName: string | null;
  cityName: string;
  provider: GeoProviderCode;
  externalId: string;
}

/** Resultado completo e idempotente de {@link LocationResolverService.resolve}. */
export interface LocationResolveResult {
  status: GeoResolutionStatus;
  countryCode: string;
  countryName: string;
  countryProfile: CountryAddressProfile;
  subdivisionCode: string | null;
  stateName: string | null;
  cityName: string | null;
  rawLocationInput: string;
  providerGeoRefs: Record<string, ProviderGeoRefEntry>;
  disambiguationCandidates: LocationDisambiguationCandidate[];
}

/**
 * Servicio determinístico de homologación geográfica (`SPEC-20 §4.1`).
 *
 * Implementa la "Opción 1: Validación estricta delegada al conector (CRM flexible en ciudad)":
 * - Sin conectores externos activos, normaliza hacia ISO 3166-1 alpha-2 e ISO 3166-2 sin rechazar localidades libres.
 * - Con conectores activos (`Dropi`, `Effi`, `MercadoLibre`), resuelve contra `admin.geo_provider_locations`
 *   y detecta homónimos (`ambiguous`, ej. Rionegro Antioquia vs Santander) o faltantes (`unresolved`).
 */
export class LocationResolverService {
  constructor(private readonly aclRepo?: IGeoProviderLocationsRepository) {}

  /**
   * Homologa de forma determinística país, subdivisión administrativa, ciudad y referencias de operadores.
   */
  async resolve(input: LocationResolveInput): Promise<LocationResolveResult> {
    const rawParts = [input.cityInput, input.stateInput, input.countryInput]
      .map((item) => item?.trim())
      .filter((item): item is string => Boolean(item));
    const rawLocationInput = rawParts.join(", ");

    const tenantFallback =
      resolveCountryAlpha2FromInput(input.tenantCountryCode) ?? "CO";

    const explicitCountry = resolveCountryAlpha2FromInput(input.countryInput);
    let countryCode = explicitCountry;

    if (!countryCode && input.subdivisionCode) {
      const prefix = input.subdivisionCode.trim().toUpperCase().split("-")[0];
      countryCode = resolveCountryAlpha2FromInput(prefix);
    }

    if (!countryCode && input.customerPhoneE164) {
      const candidates = inferCandidateCountriesFromE164(input.customerPhoneE164);
      if (candidates.length === 1) {
        countryCode = candidates[0]!;
      } else if (candidates.length > 1) {
        countryCode = candidates.includes(tenantFallback)
          ? tenantFallback
          : candidates[0]!;
      }
    }

    const finalCountryCode = countryCode ?? tenantFallback;
    const countryProfile = getCountryAddressProfile(finalCountryCode);
    const countryName = getLocalizedCountryName(finalCountryCode, "es");

    let resolvedSubdivisionCode: string | null = null;
    let resolvedStateName: string | null = input.stateInput?.trim() || null;

    if (input.subdivisionCode?.trim()) {
      const bySubCode = resolveIsoSubdivision({
        countryCode: finalCountryCode,
        input: input.subdivisionCode,
      });
      if (bySubCode.status === "resolved" && bySubCode.matches[0]) {
        resolvedSubdivisionCode = bySubCode.matches[0].code;
        resolvedStateName = bySubCode.matches[0].name;
      } else {
        resolvedSubdivisionCode = input.subdivisionCode.trim().toUpperCase();
      }
    } else if (resolvedStateName) {
      const byStateText = resolveIsoSubdivision({
        countryCode: finalCountryCode,
        input: resolvedStateName,
      });
      if (byStateText.status === "resolved" && byStateText.matches[0]) {
        resolvedSubdivisionCode = byStateText.matches[0].code;
        resolvedStateName = byStateText.matches[0].name;
      }
    }

    const trimmedCity = input.cityInput?.trim() || null;
    const activeProviders = input.activeProviders ?? [];

    if (activeProviders.length === 0 || !trimmedCity || !this.aclRepo) {
      const hasMinimumCity = Boolean(trimmedCity);
      const status: GeoResolutionStatus = hasMinimumCity ? "soft_normalized" : "unresolved";
      return {
        status,
        countryCode: finalCountryCode,
        countryName,
        countryProfile,
        subdivisionCode: resolvedSubdivisionCode,
        stateName: resolvedStateName,
        cityName: trimmedCity,
        rawLocationInput,
        providerGeoRefs: {},
        disambiguationCandidates: [],
      };
    }

    const normalizedCity = normalizeGeoText(trimmedCity);
    const providerGeoRefs: Record<string, ProviderGeoRefEntry> = {};
    const disambiguationCandidates: LocationDisambiguationCandidate[] = [];
    let anyAmbiguous = false;
    let anyUnresolved = false;

    for (const provider of activeProviders) {
      let candidates: GeoProviderLocation[] = await this.aclRepo.findCityCandidates({
        provider,
        countryCode: finalCountryCode,
        normalizedCity,
        subdivisionCode: resolvedSubdivisionCode,
      });

      if (candidates.length === 0 && resolvedSubdivisionCode) {
        candidates = await this.aclRepo.findCityCandidates({
          provider,
          countryCode: finalCountryCode,
          normalizedCity,
          subdivisionCode: null,
        });
      }

      if (candidates.length === 0) {
        anyUnresolved = true;
        continue;
      }

      if (candidates.length === 1) {
        const match = candidates[0]!;
        if (!resolvedSubdivisionCode && match.subdivisionCode) {
          const inferredSub = resolveIsoSubdivision({
            countryCode: finalCountryCode,
            input: match.subdivisionCode,
          });
          resolvedSubdivisionCode = match.subdivisionCode;
          if (inferredSub.status === "resolved" && inferredSub.matches[0]) {
            resolvedStateName = inferredSub.matches[0].name;
          }
        }
        providerGeoRefs[provider] = {
          provider,
          externalId: match.externalId,
          externalParentId: match.externalParentId ?? null,
          subdivisionCode: match.subdivisionCode ?? resolvedSubdivisionCode,
          daneCode: match.daneCode ?? null,
          postalCode: match.postalCode ?? null,
          name: match.name,
        };
        continue;
      }

      anyAmbiguous = true;
      for (const candidate of candidates) {
        const subMeta = candidate.subdivisionCode
          ? resolveIsoSubdivision({
              countryCode: finalCountryCode,
              input: candidate.subdivisionCode,
            })
          : null;
        disambiguationCandidates.push({
          countryCode: finalCountryCode,
          subdivisionCode: candidate.subdivisionCode ?? null,
          stateName: subMeta?.matches[0]?.name ?? null,
          cityName: candidate.name,
          provider,
          externalId: candidate.externalId,
        });
      }
    }

    let status: GeoResolutionStatus = "resolved";
    if (anyAmbiguous) {
      status = "ambiguous";
    } else if (anyUnresolved) {
      status = "unresolved";
    }

    return {
      status,
      countryCode: finalCountryCode,
      countryName,
      countryProfile,
      subdivisionCode: resolvedSubdivisionCode,
      stateName: resolvedStateName,
      cityName: trimmedCity,
      rawLocationInput,
      providerGeoRefs,
      disambiguationCandidates,
    };
  }
}
