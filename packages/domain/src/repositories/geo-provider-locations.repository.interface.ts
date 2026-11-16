import type {
  GeoProviderLocation,
  NewGeoProviderLocation,
} from "../db/schemas/admin/geo-provider-locations";

/** Proveedores logísticos/ERP soportados en el catálogo ACL de ubicaciones (`SPEC-20`). */
export type GeoProviderCode = "dropi" | "effi" | "mercadolibre";

/**
 * Contrato de repositorio para consultar y sincronizar ubicaciones homologadas en `admin.geo_provider_locations`.
 */
export interface IGeoProviderLocationsRepository {
  /**
   * Busca ciudades candidatas normalizadas para un proveedor y país dados, filtrando opcionalmente por código ISO 3166-2.
   */
  findCityCandidates(params: {
    provider: GeoProviderCode;
    countryCode: string;
    normalizedCity: string;
    subdivisionCode?: string | null;
  }): Promise<GeoProviderLocation[]>;

  /**
   * Busca subdivisiones candidatas de un proveedor para un país y nombre normalizado.
   */
  findSubdivisionCandidates(params: {
    provider: GeoProviderCode;
    countryCode: string;
    normalizedName: string;
  }): Promise<GeoProviderLocation[]>;

  /**
   * Inserta o actualiza por idempotencia (`provider, countryCode, level, externalId`) entradas homologadas del catálogo externo.
   */
  upsertBatch(entries: NewGeoProviderLocation[]): Promise<number>;
}
