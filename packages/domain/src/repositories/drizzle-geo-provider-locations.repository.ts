import { and, eq, or, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getDb } from "../db/client";
import * as schema from "../db/schemas";
import {
  geoProviderLocations,
  type GeoProviderLocation,
  type NewGeoProviderLocation,
} from "../db/schemas/admin/geo-provider-locations";
import type {
  GeoProviderCode,
  IGeoProviderLocationsRepository,
} from "./geo-provider-locations.repository.interface";

/**
 * Implementación Drizzle de {@link IGeoProviderLocationsRepository} sobre `admin.geo_provider_locations`.
 */
export class DrizzleGeoProviderLocationsRepository implements IGeoProviderLocationsRepository {
  constructor(private readonly dbClient?: PostgresJsDatabase<typeof schema>) {}

  private get db(): PostgresJsDatabase<typeof schema> {
    return this.dbClient ?? getDb();
  }

  /** @inheritdoc */
  async findCityCandidates(params: {
    provider: GeoProviderCode;
    countryCode: string;
    normalizedCity: string;
    subdivisionCode?: string | null;
  }): Promise<GeoProviderLocation[]> {
    const conditions = [
      eq(geoProviderLocations.provider, params.provider),
      eq(geoProviderLocations.countryCode, params.countryCode.trim().toUpperCase()),
      eq(geoProviderLocations.level, "city"),
      or(
        eq(geoProviderLocations.normalizedName, params.normalizedCity),
        sql`${geoProviderLocations.aliases} @> ${JSON.stringify([params.normalizedCity])}::jsonb`,
      ),
    ];

    if (params.subdivisionCode) {
      conditions.push(eq(geoProviderLocations.subdivisionCode, params.subdivisionCode));
    }

    return this.db
      .select()
      .from(geoProviderLocations)
      .where(and(...conditions))
      .limit(20);
  }

  /** @inheritdoc */
  async findSubdivisionCandidates(params: {
    provider: GeoProviderCode;
    countryCode: string;
    normalizedName: string;
  }): Promise<GeoProviderLocation[]> {
    return this.db
      .select()
      .from(geoProviderLocations)
      .where(
        and(
          eq(geoProviderLocations.provider, params.provider),
          eq(geoProviderLocations.countryCode, params.countryCode.trim().toUpperCase()),
          eq(geoProviderLocations.level, "subdivision"),
          or(
            eq(geoProviderLocations.normalizedName, params.normalizedName),
            sql`${geoProviderLocations.aliases} @> ${JSON.stringify([params.normalizedName])}::jsonb`,
          ),
        ),
      )
      .limit(20);
  }

  /** @inheritdoc */
  async upsertBatch(entries: NewGeoProviderLocation[]): Promise<number> {
    if (entries.length === 0) {
      return 0;
    }

    let count = 0;
    for (const entry of entries) {
      await this.db
        .insert(geoProviderLocations)
        .values(entry)
        .onConflictDoUpdate({
          target: [
            geoProviderLocations.provider,
            geoProviderLocations.countryCode,
            geoProviderLocations.level,
            geoProviderLocations.externalId,
          ],
          set: {
            externalParentId: entry.externalParentId ?? null,
            subdivisionCode: entry.subdivisionCode ?? null,
            daneCode: entry.daneCode ?? null,
            postalCode: entry.postalCode ?? null,
            name: entry.name,
            normalizedName: entry.normalizedName,
            aliases: entry.aliases ?? [],
            rawPayload: entry.rawPayload ?? {},
            updatedAt: new Date(),
            updatedBy: entry.updatedBy,
          },
        });
      count += 1;
    }

    return count;
  }
}
