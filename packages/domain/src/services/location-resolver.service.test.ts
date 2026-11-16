import { describe, expect, it } from "vitest";
import type {
  GeoProviderLocation,
  NewGeoProviderLocation,
} from "../db/schemas/admin/geo-provider-locations";
import {
  mapDropiCityToAclEntry,
  mapEffiCityToAclEntry,
  mapMercadoLibreCityToAclEntry,
} from "../geo/provider-adapters";
import type {
  GeoProviderCode,
  IGeoProviderLocationsRepository,
} from "../repositories/geo-provider-locations.repository.interface";
import { LocationResolverService } from "./location-resolver.service";

class InMemoryAclGeoRepo implements IGeoProviderLocationsRepository {
  constructor(private readonly items: GeoProviderLocation[]) {}

  async findCityCandidates(params: {
    provider: GeoProviderCode;
    countryCode: string;
    normalizedCity: string;
    subdivisionCode?: string | null;
  }): Promise<GeoProviderLocation[]> {
    return this.items.filter(
      (item) =>
        item.provider === params.provider &&
        item.countryCode === params.countryCode &&
        item.level === "city" &&
        (item.normalizedName === params.normalizedCity ||
          item.aliases.includes(params.normalizedCity)) &&
        (!params.subdivisionCode || item.subdivisionCode === params.subdivisionCode),
    );
  }

  async findSubdivisionCandidates(params: {
    provider: GeoProviderCode;
    countryCode: string;
    normalizedName: string;
  }): Promise<GeoProviderLocation[]> {
    return this.items.filter(
      (item) =>
        item.provider === params.provider &&
        item.countryCode === params.countryCode &&
        item.level === "subdivision" &&
        item.normalizedName === params.normalizedName,
    );
  }

  async upsertBatch(entries: NewGeoProviderLocation[]): Promise<number> {
    return entries.length;
  }
}

function buildAclRow(partial: NewGeoProviderLocation): GeoProviderLocation {
  return {
    id: crypto.randomUUID(),
    externalParentId: partial.externalParentId ?? null,
    subdivisionCode: partial.subdivisionCode ?? null,
    daneCode: partial.daneCode ?? null,
    postalCode: partial.postalCode ?? null,
    aliases: partial.aliases ?? [],
    rawPayload: partial.rawPayload ?? {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

describe("LocationResolverService & ACL provider adapters", () => {
  it("normalizes country & ISO 3166-2 flexibly when no logistic connector is active (Option 1)", async () => {
    const resolver = new LocationResolverService();
    const res = await resolver.resolve({
      tenantCountryCode: "AR",
      countryInput: "Argentina",
      stateInput: "CABA",
      cityInput: "Palermo",
    });

    expect(res.status).toBe("soft_normalized");
    expect(res.countryCode).toBe("AR");
    expect(res.subdivisionCode).toBe("AR-C");
    expect(res.cityName).toBe("Palermo");
    expect(res.providerGeoRefs).toEqual({});
  });

  it("uses shared E.164 disambiguation tied to tenant default country without blind hardcoding", async () => {
    const resolver = new LocationResolverService();
    const res = await resolver.resolve({
      tenantCountryCode: "CA",
      customerPhoneE164: "+14165550100",
      cityInput: "Toronto",
    });

    expect(res.countryCode).toBe("CA");
    expect(res.status).toBe("soft_normalized");
  });

  it("detects homonym cities when strict connector is active and disambiguates using subdivision", async () => {
    const rionegroAnt = buildAclRow(
      mapDropiCityToAclEntry({
        countryCode: "CO",
        raw: { id: 101, name: "Rionegro", departmentId: 5, departmentName: "Antioquia" },
      }),
    );
    const rionegroSan = buildAclRow(
      mapDropiCityToAclEntry({
        countryCode: "CO",
        raw: { id: 202, name: "Rionegro", departmentId: 68, departmentName: "Santander" },
      }),
    );
    const medellin = buildAclRow(
      mapDropiCityToAclEntry({
        countryCode: "CO",
        raw: {
          id: 50,
          name: "Medellín",
          departmentId: 5,
          departmentName: "Antioquia",
          aliases: ["medallo"],
        },
      }),
    );

    const repo = new InMemoryAclGeoRepo([rionegroAnt, rionegroSan, medellin]);
    const resolver = new LocationResolverService(repo);

    const ambiguous = await resolver.resolve({
      tenantCountryCode: "CO",
      cityInput: "Rionegro",
      activeProviders: ["dropi"],
    });
    expect(ambiguous.status).toBe("ambiguous");
    expect(ambiguous.disambiguationCandidates).toHaveLength(2);

    const resolved = await resolver.resolve({
      tenantCountryCode: "CO",
      stateInput: "Antioquia",
      cityInput: "Rionegro",
      activeProviders: ["dropi"],
    });
    expect(resolved.status).toBe("resolved");
    expect(resolved.subdivisionCode).toBe("CO-ANT");
    expect(resolved.providerGeoRefs.dropi?.externalId).toBe("101");

    const aliasResolved = await resolver.resolve({
      tenantCountryCode: "CO",
      cityInput: "Medallo",
      activeProviders: ["dropi"],
    });
    expect(aliasResolved.status).toBe("resolved");
    expect(aliasResolved.providerGeoRefs.dropi?.externalId).toBe("50");
    expect(aliasResolved.subdivisionCode).toBe("CO-ANT");
  });

  it("translates Effi and MercadoLibre raw location entries cleanly through ACL", () => {
    const effi = mapEffiCityToAclEntry({
      countryCode: "CO",
      raw: { daneCode: "05001", municipalityName: "Medellín", departmentName: "Antioquia" },
    });
    expect(effi.provider).toBe("effi");
    expect(effi.daneCode).toBe("05001");
    expect(effi.subdivisionCode).toBe("CO-ANT");

    const ml = mapMercadoLibreCityToAclEntry({
      countryCode: "MX",
      raw: { id: "TUxBQ0NJVURBRF9ERF9NRVhJQ08", name: "Cuauhtémoc", stateName: "CDMX" },
    });
    expect(ml.provider).toBe("mercadolibre");
    expect(ml.subdivisionCode).toBe("MX-CMX");
  });
});
