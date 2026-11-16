import type { NewGeoProviderLocation } from "../db/schemas/admin/geo-provider-locations";
import { normalizeGeoText } from "./normalize-text";
import { resolveIsoSubdivision } from "./iso-subdivisions";

/** Registro crudo de ciudad retornado por Dropi (`/departments`, `/cities`). */
export interface RawDropiCityRecord {
  id: string | number;
  name: string;
  departmentId?: string | number | null;
  departmentName?: string | null;
  zipCode?: string | null;
  daneCode?: string | null;
  aliases?: string[];
}

/** Registro crudo de ciudad/municipio en catálogos DANE/Effi. */
export interface RawEffiCityRecord {
  daneCode: string;
  municipalityName: string;
  departmentName: string;
  departmentCode?: string | null;
  postalCode?: string | null;
  aliases?: string[];
}

/** Registro crudo de ubicación en MercadoLibre Sites API (`/classified_locations/*`). */
export interface RawMercadoLibreCityRecord {
  id: string;
  name: string;
  stateId?: string | null;
  stateName?: string | null;
  zipCode?: string | null;
  aliases?: string[];
}

/**
 * Traduce un registro crudo de Dropi al contrato limpio ACL (`admin.geo_provider_locations`).
 *
 * Nunca expone peculiaridades como IDs internos o `zip_code` dentro del CRM del comercio.
 */
export function mapDropiCityToAclEntry(params: {
  countryCode: string;
  raw: RawDropiCityRecord;
  actor?: string;
}): NewGeoProviderLocation {
  const actor = params.actor ?? "acl.dropi";
  const countryCode = params.countryCode.trim().toUpperCase();
  const subdivision = params.raw.departmentName
    ? resolveIsoSubdivision({ countryCode, input: params.raw.departmentName })
    : { status: "unresolved" as const, matches: [] };

  const aliases = (params.raw.aliases ?? []).map((item) => normalizeGeoText(item));

  return {
    provider: "dropi",
    countryCode,
    level: "city",
    externalId: String(params.raw.id),
    externalParentId:
      params.raw.departmentId !== undefined && params.raw.departmentId !== null
        ? String(params.raw.departmentId)
        : null,
    subdivisionCode: subdivision.status === "resolved" ? subdivision.matches[0]?.code ?? null : null,
    daneCode: params.raw.daneCode?.trim() || null,
    postalCode: params.raw.zipCode?.trim() || null,
    name: params.raw.name.trim(),
    normalizedName: normalizeGeoText(params.raw.name),
    aliases,
    rawPayload: { ...params.raw },
    createdBy: actor,
    updatedBy: actor,
  };
}

/**
 * Traduce un registro crudo DANE/Effi al contrato limpio ACL (`admin.geo_provider_locations`).
 */
export function mapEffiCityToAclEntry(params: {
  countryCode: string;
  raw: RawEffiCityRecord;
  actor?: string;
}): NewGeoProviderLocation {
  const actor = params.actor ?? "acl.effi";
  const countryCode = params.countryCode.trim().toUpperCase();
  const subdivision = resolveIsoSubdivision({
    countryCode,
    input: params.raw.departmentName,
  });
  const aliases = (params.raw.aliases ?? []).map((item) => normalizeGeoText(item));

  return {
    provider: "effi",
    countryCode,
    level: "city",
    externalId: params.raw.daneCode.trim(),
    externalParentId: params.raw.departmentCode?.trim() || null,
    subdivisionCode: subdivision.status === "resolved" ? subdivision.matches[0]?.code ?? null : null,
    daneCode: params.raw.daneCode.trim(),
    postalCode: params.raw.postalCode?.trim() || null,
    name: params.raw.municipalityName.trim(),
    normalizedName: normalizeGeoText(params.raw.municipalityName),
    aliases,
    rawPayload: { ...params.raw },
    createdBy: actor,
    updatedBy: actor,
  };
}

/**
 * Traduce una ubicación cruda de MercadoLibre al contrato limpio ACL (`admin.geo_provider_locations`).
 */
export function mapMercadoLibreCityToAclEntry(params: {
  countryCode: string;
  raw: RawMercadoLibreCityRecord;
  actor?: string;
}): NewGeoProviderLocation {
  const actor = params.actor ?? "acl.mercadolibre";
  const countryCode = params.countryCode.trim().toUpperCase();
  const subdivision = params.raw.stateName
    ? resolveIsoSubdivision({ countryCode, input: params.raw.stateName })
    : { status: "unresolved" as const, matches: [] };
  const aliases = (params.raw.aliases ?? []).map((item) => normalizeGeoText(item));

  return {
    provider: "mercadolibre",
    countryCode,
    level: "city",
    externalId: params.raw.id.trim(),
    externalParentId: params.raw.stateId?.trim() || null,
    subdivisionCode: subdivision.status === "resolved" ? subdivision.matches[0]?.code ?? null : null,
    daneCode: null,
    postalCode: params.raw.zipCode?.trim() || null,
    name: params.raw.name.trim(),
    normalizedName: normalizeGeoText(params.raw.name),
    aliases,
    rawPayload: { ...params.raw },
    createdBy: actor,
    updatedBy: actor,
  };
}
