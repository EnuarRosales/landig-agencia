import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getCellDb, type DrizzleCellDb } from "../db/cell-client";
import * as schema from "../db/schemas";
import {
  cellContacts,
  cellContactRatings,
  cellContactAddresses,
  cellProspectConsents,
  cellPrivacyNotices,
  cellContactMemories,
  type CellContact,
  type NewCellContact,
  type CellContactRating,
  type NewCellContactRating,
  type CellContactAddress,
  type CellProspectConsent,
  type NewCellProspectConsent,
  type CellPrivacyNotice,
  type NewCellPrivacyNotice,
  type CellContactMemory,
  type NewCellContactMemory,
} from "../db/schemas/tenant/crm";
import { cellOrders } from "../db/schemas/tenant/orders";
import type {
  ICrmRepository,
  ListContactsFilter,
  CrmQualityMetrics,
  ContactDuplicateCriteria,
  ContactAddressWriteInput,
  ContactRecentOrderSummary,
} from "./crm.repository.interface";
import type {
  CellConnectionChecker,
  CellDatabaseProvider,
} from "./drizzle-cell-auth.repository";
import { CellUnavailableError } from "./cell-auth.repository.interface";

/**
 * Implementación Drizzle ORM del repositorio de CRM y contactos en celdas de datos multi-inquilino.
 *
 * Aplica aislamiento estricto fijando `app.current_client_id` dentro de transacciones aisladas
 * para garantizar cumplimiento de las políticas PostgreSQL `ENABLE + FORCE ROW LEVEL SECURITY`.
 */
export class DrizzleCrmRepository implements ICrmRepository {
  constructor (
    private readonly dbProvider: CellDatabaseProvider = (cellId?: string) => getCellDb(cellId ?? "cell-01"),
    private readonly cellHealthChecker?: CellConnectionChecker,
  ) { }

  private async getDbForCell(cellId: string): Promise<PostgresJsDatabase<typeof schema>> {
    return await this.dbProvider(cellId);
  }

  private async ensureCellAvailable(cellId: string): Promise<void> {
    if (this.cellHealthChecker) {
      const isAvailable = await this.cellHealthChecker(cellId);
      if (!isAvailable) {
        throw new CellUnavailableError(`Celda ${cellId} fuera de servicio.`, cellId);
      }
    }
  }

  async createContact(
    cellId: string,
    clientId: string,
    contact: Omit<NewCellContact, "clientId">,
  ): Promise<CellContact> {
    await this.ensureCellAvailable(cellId);
    const db = await this.getDbForCell(cellId);

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_client_id', ${clientId}, true)`);
      const [inserted] = await tx
        .insert(cellContacts)
        .values({
          ...contact,
          clientId,
          email: contact.email ? contact.email.trim().toLowerCase() : undefined,
        })
        .returning();

      return inserted!;
    });
  }

  async updateContact(
    cellId: string,
    clientId: string,
    id: string,
    patch: Partial<Omit<NewCellContact, "id" | "clientId">>,
  ): Promise<CellContact | null> {
    await this.ensureCellAvailable(cellId);
    const db = await this.getDbForCell(cellId);

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_client_id', ${clientId}, true)`);
      const sanitizedEmail = patch.email ? patch.email.trim().toLowerCase() : patch.email;

      const [updated] = await tx
        .update(cellContacts)
        .set({
          ...patch,
          email: sanitizedEmail,
          updatedAt: new Date(),
        })
        .where(and(eq(cellContacts.clientId, clientId), eq(cellContacts.id, id)))
        .returning();

      return updated ?? null;
    });
  }

  private async withScopedTx<T>(
    cellId: string,
    clientId: string,
    callback: (tx: DrizzleCellDb) => Promise<T>,
  ): Promise<T> {
    await this.ensureCellAvailable(cellId);
    const db = await this.getDbForCell(cellId);

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_client_id', ${clientId}, true)`);
      return await callback(tx as unknown as DrizzleCellDb);
    });
  }

  private async syncDefaultAddressToContact(
    tx: DrizzleCellDb,
    clientId: string,
    contactId: string,
    actor: string,
  ): Promise<CellContactAddress | null> {
    const addresses = await tx
      .select()
      .from(cellContactAddresses)
      .where(
        and(
          eq(cellContactAddresses.clientId, clientId),
          eq(cellContactAddresses.contactId, contactId),
        ),
      )
      .orderBy(desc(cellContactAddresses.isDefault), desc(cellContactAddresses.createdAt));

    if (addresses.length === 0) {
      await tx
        .update(cellContacts)
        .set({
          country: null,
          state: null,
          city: null,
          addressLine: null,
          postalCode: null,
          updatedAt: new Date(),
          updatedBy: actor,
        })
        .where(and(eq(cellContacts.clientId, clientId), eq(cellContacts.id, contactId)));
      return null;
    }

    let primary = addresses.find((a) => a.isDefault);
    if (!primary) {
      primary = addresses[0]!;
      const [promoted] = await tx
        .update(cellContactAddresses)
        .set({
          isDefault: true,
          updatedAt: new Date(),
          updatedBy: actor,
        })
        .where(
          and(
            eq(cellContactAddresses.clientId, clientId),
            eq(cellContactAddresses.id, primary.id),
          ),
        )
        .returning();
      primary = promoted ?? { ...primary, isDefault: true };
    }

    await tx
      .update(cellContacts)
      .set({
        country: primary.country,
        state: primary.state,
        city: primary.city,
        addressLine: primary.addressLine,
        postalCode: primary.postalCode,
        updatedAt: new Date(),
        updatedBy: actor,
      })
      .where(and(eq(cellContacts.clientId, clientId), eq(cellContacts.id, contactId)));

    return primary;
  }

  async findContactById(
    cellId: string,
    clientId: string,
    id: string,
  ): Promise<CellContact | null> {
    return await this.withScopedTx(cellId, clientId, async (tx) => {
      const [contact] = await tx
        .select()
        .from(cellContacts)
        .where(
          and(
            eq(cellContacts.clientId, clientId),
            eq(cellContacts.id, id),
            isNull(cellContacts.deletedAt),
          ),
        );

      return contact ?? null;
    });
  }

  async findContactByChatwootId(
    cellId: string,
    clientId: string,
    chatwootContactId: number,
  ): Promise<CellContact | null> {
    return await this.withScopedTx(cellId, clientId, async (tx) => {
      const [contact] = await tx
        .select()
        .from(cellContacts)
        .where(
          and(
            eq(cellContacts.clientId, clientId),
            eq(cellContacts.chatwootContactId, chatwootContactId),
            isNull(cellContacts.deletedAt),
          ),
        );

      return contact ?? null;
    });
  }

  async findContactsByPhone(
    cellId: string,
    clientId: string,
    phoneMobile: string,
  ): Promise<CellContact[]> {
    return await this.withScopedTx(cellId, clientId, async (tx) => {
      return await tx
        .select()
        .from(cellContacts)
        .where(
          and(
            eq(cellContacts.clientId, clientId),
            eq(cellContacts.phoneMobile, phoneMobile),
            isNull(cellContacts.deletedAt),
          ),
        );
    });
  }

  async findContactsByEmail(
    cellId: string,
    clientId: string,
    email: string,
  ): Promise<CellContact[]> {
    const normalized = email.trim().toLowerCase();
    return await this.withScopedTx(cellId, clientId, async (tx) => {
      return await tx
        .select()
        .from(cellContacts)
        .where(
          and(
            eq(cellContacts.clientId, clientId),
            sql`lower(${cellContacts.email}) = ${normalized}`,
            isNull(cellContacts.deletedAt),
          ),
        );
    });
  }

  async findActiveDuplicateContact(
    cellId: string,
    clientId: string,
    criteria: ContactDuplicateCriteria,
  ): Promise<CellContact | null> {
    const checks: SQL[] = [];
    if (criteria.phoneMobile?.trim()) {
      checks.push(eq(cellContacts.phoneMobile, criteria.phoneMobile.trim()));
    }
    if (criteria.email?.trim()) {
      checks.push(sql`lower(${cellContacts.email}) = ${criteria.email.trim().toLowerCase()}`);
    }
    if (criteria.documentNumber?.trim()) {
      if (criteria.documentType?.trim()) {
        checks.push(
          and(
            eq(cellContacts.documentType, criteria.documentType.trim()),
            eq(cellContacts.documentNumber, criteria.documentNumber.trim()),
          )!,
        );
      } else {
        checks.push(eq(cellContacts.documentNumber, criteria.documentNumber.trim()));
      }
    }

    if (checks.length === 0) {
      return null;
    }

    return await this.withScopedTx(cellId, clientId, async (tx) => {
      const conditions = [
        eq(cellContacts.clientId, clientId),
        isNull(cellContacts.deletedAt),
        or(...checks)!,
      ];

      if (criteria.excludeContactId) {
        conditions.push(ne(cellContacts.id, criteria.excludeContactId));
      }

      const [existing] = await tx
        .select()
        .from(cellContacts)
        .where(and(...conditions))
        .limit(1);

      return existing ?? null;
    });
  }

  async listContacts(
    cellId: string,
    clientId: string,
    filters: ListContactsFilter = {},
  ): Promise<{ items: CellContact[]; total: number }> {
    return await this.withScopedTx(cellId, clientId, async (tx) => {
      const conditions = [eq(cellContacts.clientId, clientId)];

      if (!filters.includeDeleted) {
        conditions.push(isNull(cellContacts.deletedAt));
      }

      if (filters.stage) {
        conditions.push(eq(cellContacts.stage, filters.stage));
      }

      if (filters.source) {
        conditions.push(eq(cellContacts.source, filters.source));
      }

      if (filters.channel && filters.channel.trim().length > 0) {
        const ch = filters.channel.trim().toLowerCase();
        if (ch === "whatsapp") {
          conditions.push(
            or(
              eq(cellContacts.preferredChannel, "whatsapp"),
              sql`lower(${cellContacts.lastChannel}) LIKE 'whatsapp%'`,
              eq(cellContacts.source, "whatsapp"),
            )!,
          );
        } else {
          conditions.push(
            or(
              sql`lower(${cellContacts.preferredChannel}) = ${ch}`,
              sql`lower(${cellContacts.lastChannel}) = ${ch}`,
              sql`lower(${cellContacts.channel}) = ${ch}`,
            )!,
          );
        }
      }

      if (filters.whatsappWindow === "active") {
        const threshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
        conditions.push(isNotNull(cellContacts.lastWhatsappInboundAt));
        conditions.push(sql`${cellContacts.lastWhatsappInboundAt} > ${threshold}`);
      } else if (filters.whatsappWindow === "expired") {
        const threshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
        conditions.push(isNotNull(cellContacts.lastWhatsappInboundAt));
        conditions.push(lte(cellContacts.lastWhatsappInboundAt, threshold));
      } else if (filters.whatsappWindow === "none") {
        conditions.push(isNull(cellContacts.lastWhatsappInboundAt));
      }

      if (typeof filters.minRating === "number" && filters.minRating >= 1) {
        conditions.push(gte(cellContacts.currentRatingStars, filters.minRating));
      }

      if (filters.assignedUserId) {
        conditions.push(eq(cellContacts.assignedUserId, filters.assignedUserId));
      }

      if (filters.query && filters.query.trim().length > 0) {
        const pattern = `%${filters.query.trim().toLowerCase()}%`;
        conditions.push(
          or(
            sql`lower(${cellContacts.fullName}) LIKE ${pattern}`,
            sql`lower(${cellContacts.companyName}) LIKE ${pattern}`,
            sql`lower(${cellContacts.email}) LIKE ${pattern}`,
            sql`${cellContacts.phoneMobile} LIKE ${pattern}`,
            sql`${cellContacts.phoneSecondary} LIKE ${pattern}`,
            sql`lower(${cellContacts.city}) LIKE ${pattern}`,
          )!,
        );
      }

      const whereClause = and(...conditions);
      const sortDir = filters.sortDir === "asc" ? "asc" : "desc";
      const nowThresholdIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      let orderClauses;
      switch (filters.sortBy) {
        case "whatsapp_priority":
          orderClauses = [
            sql`CASE WHEN ${cellContacts.lastWhatsappInboundAt} IS NOT NULL AND ${cellContacts.lastWhatsappInboundAt} > ${nowThresholdIso}::timestamptz THEN 0 ELSE 1 END ASC`,
            sql`CASE WHEN ${cellContacts.preferredChannel} = 'whatsapp' OR lower(COALESCE(${cellContacts.lastChannel}, '')) LIKE 'whatsapp%' OR ${cellContacts.source} = 'whatsapp' THEN 0 ELSE 1 END ASC`,
            sql`COALESCE(${cellContacts.lastWhatsappInboundAt}, ${cellContacts.lastInboundMessageAt}, ${cellContacts.lastSeenAt}, ${cellContacts.createdAt}) DESC`,
          ];
          break;
        case "last_inbound":
          orderClauses = [
            sortDir === "asc"
              ? sql`COALESCE(${cellContacts.lastInboundMessageAt}, ${cellContacts.lastSeenAt}, ${cellContacts.createdAt}) ASC`
              : sql`COALESCE(${cellContacts.lastInboundMessageAt}, ${cellContacts.lastSeenAt}, ${cellContacts.createdAt}) DESC`,
          ];
          break;
        case "rating":
          orderClauses = [
            sortDir === "asc"
              ? sql`COALESCE(${cellContacts.currentRatingStars}, 0) ASC`
              : sql`COALESCE(${cellContacts.currentRatingStars}, 0) DESC`,
            desc(cellContacts.createdAt),
          ];
          break;
        case "full_name":
          orderClauses = [
            sortDir === "asc"
              ? asc(sql`lower(${cellContacts.fullName})`)
              : desc(sql`lower(${cellContacts.fullName})`),
          ];
          break;
        case "created_at":
        default:
          orderClauses = [
            sortDir === "asc" ? asc(cellContacts.createdAt) : desc(cellContacts.createdAt),
          ];
          break;
      }

      const items = await tx
        .select()
        .from(cellContacts)
        .where(whereClause)
        .orderBy(...orderClauses)
        .limit(filters.limit ?? 50)
        .offset(filters.offset ?? 0);

      const [countResult] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(cellContacts)
        .where(whereClause);

      return {
        items,
        total: countResult?.count ?? 0,
      };
    });
  }

  async softDeleteContact(
    cellId: string,
    clientId: string,
    id: string,
    deletedBy: string,
  ): Promise<CellContact | null> {
    return await this.withScopedTx(cellId, clientId, async (tx) => {
      const [deleted] = await tx
        .update(cellContacts)
        .set({
          deletedAt: new Date(),
          deletedBy,
          updatedAt: new Date(),
          updatedBy: deletedBy,
        })
        .where(
          and(
            eq(cellContacts.clientId, clientId),
            eq(cellContacts.id, id),
            isNull(cellContacts.deletedAt),
          ),
        )
        .returning();

      return deleted ?? null;
    });
  }

  async addContactRating(
    cellId: string,
    clientId: string,
    rating: Omit<NewCellContactRating, "clientId">,
  ): Promise<{ rating: CellContactRating; contact: CellContact } | null> {
    return await this.withScopedTx(cellId, clientId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(cellContacts)
        .where(
          and(
            eq(cellContacts.clientId, clientId),
            eq(cellContacts.id, rating.contactId),
            isNull(cellContacts.deletedAt),
          ),
        );

      if (!existing) {
        return null;
      }

      const [insertedRating] = await tx
        .insert(cellContactRatings)
        .values({
          ...rating,
          clientId,
        })
        .returning();

      const [updatedContact] = await tx
        .update(cellContacts)
        .set({
          currentRatingStars: rating.stars,
          currentRatingComment: rating.comment ?? null,
          updatedAt: new Date(),
          updatedBy: rating.updatedBy,
        })
        .where(and(eq(cellContacts.clientId, clientId), eq(cellContacts.id, rating.contactId)))
        .returning();

      return {
        rating: insertedRating!,
        contact: updatedContact!,
      };
    });
  }

  async listContactRatings(
    cellId: string,
    clientId: string,
    contactId: string,
  ): Promise<CellContactRating[]> {
    return await this.withScopedTx(cellId, clientId, async (tx) => {
      return await tx
        .select()
        .from(cellContactRatings)
        .where(
          and(
            eq(cellContactRatings.clientId, clientId),
            eq(cellContactRatings.contactId, contactId),
          ),
        )
        .orderBy(desc(cellContactRatings.createdAt));
    });
  }

  async listContactAddresses(
    cellId: string,
    clientId: string,
    contactId: string,
  ): Promise<CellContactAddress[]> {
    return await this.withScopedTx(cellId, clientId, async (tx) => {
      return await tx
        .select()
        .from(cellContactAddresses)
        .where(
          and(
            eq(cellContactAddresses.clientId, clientId),
            eq(cellContactAddresses.contactId, contactId),
          ),
        )
        .orderBy(desc(cellContactAddresses.isDefault), desc(cellContactAddresses.createdAt));
    });
  }

  async createContactAddress(
    cellId: string,
    clientId: string,
    contactId: string,
    input: ContactAddressWriteInput,
  ): Promise<CellContactAddress> {
    return await this.withScopedTx(cellId, clientId, async (tx) => {
      const existingAddresses = await tx
        .select({ id: cellContactAddresses.id })
        .from(cellContactAddresses)
        .where(
          and(
            eq(cellContactAddresses.clientId, clientId),
            eq(cellContactAddresses.contactId, contactId),
          ),
        );

      const shouldBeDefault = Boolean(input.isDefault) || existingAddresses.length === 0;

      if (shouldBeDefault && existingAddresses.length > 0) {
        await tx
          .update(cellContactAddresses)
          .set({ isDefault: false, updatedAt: new Date(), updatedBy: input.actor })
          .where(
            and(
              eq(cellContactAddresses.clientId, clientId),
              eq(cellContactAddresses.contactId, contactId),
              eq(cellContactAddresses.isDefault, true),
            ),
          );
      }

      const [inserted] = await tx
        .insert(cellContactAddresses)
        .values({
          clientId,
          contactId,
          label: input.label.trim(),
          country: input.country?.trim() || "Colombia",
          state: input.state?.trim() || null,
          city: input.city.trim(),
          addressLine: input.addressLine.trim(),
          neighborhood: input.neighborhood?.trim() || null,
          postalCode: input.postalCode?.trim() || null,
          referenceNotes: input.referenceNotes?.trim() || null,
          isDefault: shouldBeDefault,
          createdBy: input.actor,
          updatedBy: input.actor,
        })
        .returning();

      await this.syncDefaultAddressToContact(tx, clientId, contactId, input.actor);
      return inserted!;
    });
  }

  async updateContactAddress(
    cellId: string,
    clientId: string,
    contactId: string,
    addressId: string,
    input: Partial<ContactAddressWriteInput> & { actor: string },
  ): Promise<CellContactAddress | null> {
    return await this.withScopedTx(cellId, clientId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(cellContactAddresses)
        .where(
          and(
            eq(cellContactAddresses.clientId, clientId),
            eq(cellContactAddresses.contactId, contactId),
            eq(cellContactAddresses.id, addressId),
          ),
        );

      if (!existing) {
        return null;
      }

      if (input.isDefault === true && !existing.isDefault) {
        await tx
          .update(cellContactAddresses)
          .set({ isDefault: false, updatedAt: new Date(), updatedBy: input.actor })
          .where(
            and(
              eq(cellContactAddresses.clientId, clientId),
              eq(cellContactAddresses.contactId, contactId),
              eq(cellContactAddresses.isDefault, true),
            ),
          );
      }

      const [updated] = await tx
        .update(cellContactAddresses)
        .set({
          label: input.label !== undefined ? input.label.trim() : existing.label,
          country: input.country !== undefined ? input.country.trim() || "Colombia" : existing.country,
          state: input.state !== undefined ? (input.state?.trim() || null) : existing.state,
          city: input.city !== undefined ? input.city.trim() : existing.city,
          addressLine: input.addressLine !== undefined ? input.addressLine.trim() : existing.addressLine,
          neighborhood:
            input.neighborhood !== undefined
              ? input.neighborhood?.trim() || null
              : existing.neighborhood,
          postalCode:
            input.postalCode !== undefined ? input.postalCode?.trim() || null : existing.postalCode,
          referenceNotes:
            input.referenceNotes !== undefined
              ? input.referenceNotes?.trim() || null
              : existing.referenceNotes,
          isDefault: input.isDefault === true ? true : existing.isDefault,
          updatedAt: new Date(),
          updatedBy: input.actor,
        })
        .where(
          and(
            eq(cellContactAddresses.clientId, clientId),
            eq(cellContactAddresses.contactId, contactId),
            eq(cellContactAddresses.id, addressId),
          ),
        )
        .returning();

      await this.syncDefaultAddressToContact(tx, clientId, contactId, input.actor);
      return updated ?? null;
    });
  }

  async deleteContactAddress(
    cellId: string,
    clientId: string,
    contactId: string,
    addressId: string,
    actor: string,
  ): Promise<{ deleted: boolean; promotedAddressId: string | null }> {
    return await this.withScopedTx(cellId, clientId, async (tx) => {
      const [deleted] = await tx
        .delete(cellContactAddresses)
        .where(
          and(
            eq(cellContactAddresses.clientId, clientId),
            eq(cellContactAddresses.contactId, contactId),
            eq(cellContactAddresses.id, addressId),
          ),
        )
        .returning();

      if (!deleted) {
        return { deleted: false, promotedAddressId: null };
      }

      const primary = await this.syncDefaultAddressToContact(tx, clientId, contactId, actor);
      return {
        deleted: true,
        promotedAddressId: deleted.isDefault ? (primary?.id ?? null) : null,
      };
    });
  }

  async listDefaultAddressesByContactIds(
    cellId: string,
    clientId: string,
    contactIds: string[],
  ): Promise<Map<string, CellContactAddress>> {
    const result = new Map<string, CellContactAddress>();
    if (contactIds.length === 0) {
      return result;
    }

    const rows = await this.withScopedTx(cellId, clientId, async (tx) => {
      return await tx
        .select()
        .from(cellContactAddresses)
        .where(
          and(
            eq(cellContactAddresses.clientId, clientId),
            inArray(cellContactAddresses.contactId, contactIds),
            eq(cellContactAddresses.isDefault, true),
          ),
        );
    });

    for (const row of rows) {
      result.set(row.contactId, row);
    }
    return result;
  }

  async listRecentOrdersForContact(
    cellId: string,
    clientId: string,
    contactId: string,
    limit: number = 5,
  ): Promise<ContactRecentOrderSummary[]> {
    return await this.withScopedTx(cellId, clientId, async (tx) => {
      const rows = await tx
        .select({
          id: cellOrders.id,
          number: cellOrders.number,
          status: cellOrders.status,
          paymentStatus: cellOrders.paymentStatus,
          totalCents: cellOrders.totalCents,
          currency: cellOrders.currency,
          createdAt: cellOrders.createdAt,
        })
        .from(cellOrders)
        .where(and(eq(cellOrders.clientId, clientId), eq(cellOrders.prospectId, contactId)))
        .orderBy(desc(cellOrders.createdAt))
        .limit(limit);

      return rows.map((row) => ({
        id: row.id,
        number: row.number,
        status: row.status,
        paymentStatus: row.paymentStatus,
        totalCents: row.totalCents,
        currency: row.currency,
        createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
      }));
    });
  }

  async anonymizeContact(
    cellId: string,
    clientId: string,
    id: string,
    deletedBy: string,
  ): Promise<CellContact | null> {
    await this.ensureCellAvailable(cellId);
    const db = await this.getDbForCell(cellId);

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_client_id', ${clientId}, true)`);

      const [anonymized] = await tx
        .update(cellContacts)
        .set({
          fullName: sql`'anon_' || substr(md5(${id}::text), 1, 8)`,
          email: null,
          phoneMobile: null,
          phoneLandline: null,
          phoneSecondary: null,
          companyName: null,
          birthDate: null,
          documentNumber: null,
          addressLine: null,
          notes: null,
          deletedAt: new Date(),
          deletedBy,
          updatedAt: new Date(),
        })
        .where(and(eq(cellContacts.clientId, clientId), eq(cellContacts.id, id)))
        .returning();

      return anonymized ?? null;
    });
  }

  async createConsent(
    cellId: string,
    clientId: string,
    consent: Omit<NewCellProspectConsent, "clientId">,
  ): Promise<CellProspectConsent> {
    await this.ensureCellAvailable(cellId);
    const db = await this.getDbForCell(cellId);

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_client_id', ${clientId}, true)`);
      const [inserted] = await tx
        .insert(cellProspectConsents)
        .values({
          ...consent,
          clientId,
        })
        .returning();

      return inserted!;
    });
  }

  async findActiveConsent(
    cellId: string,
    clientId: string,
    prospectId: string,
    purpose: "data_treatment" | "commercial_comms",
  ): Promise<CellProspectConsent | null> {
    await this.ensureCellAvailable(cellId);
    const db = await this.getDbForCell(cellId);

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_client_id', ${clientId}, true)`);
      const [consent] = await tx
        .select()
        .from(cellProspectConsents)
        .where(
          and(
            eq(cellProspectConsents.clientId, clientId),
            eq(cellProspectConsents.prospectId, prospectId),
            eq(cellProspectConsents.purpose, purpose),
            eq(cellProspectConsents.status, "granted"),
            isNull(cellProspectConsents.revokedAt),
          ),
        )
        .orderBy(desc(cellProspectConsents.grantedAt))
        .limit(1);

      return consent ?? null;
    });
  }

  async revokeConsent(
    cellId: string,
    clientId: string,
    consentId: string,
    revokedBy: string,
  ): Promise<CellProspectConsent | null> {
    await this.ensureCellAvailable(cellId);
    const db = await this.getDbForCell(cellId);

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_client_id', ${clientId}, true)`);
      const [revoked] = await tx
        .update(cellProspectConsents)
        .set({
          status: "revoked",
          revokedAt: new Date(),
          updatedBy: revokedBy,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(cellProspectConsents.clientId, clientId),
            eq(cellProspectConsents.id, consentId),
          ),
        )
        .returning();

      return revoked ?? null;
    });
  }

  async listConsentsByProspect(
    cellId: string,
    clientId: string,
    prospectId: string,
  ): Promise<CellProspectConsent[]> {
    await this.ensureCellAvailable(cellId);
    const db = await this.getDbForCell(cellId);

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_client_id', ${clientId}, true)`);
      return await tx
        .select()
        .from(cellProspectConsents)
        .where(
          and(
            eq(cellProspectConsents.clientId, clientId),
            eq(cellProspectConsents.prospectId, prospectId),
          ),
        )
        .orderBy(desc(cellProspectConsents.grantedAt));
    });
  }

  async createPrivacyNotice(
    cellId: string,
    clientId: string,
    notice: Omit<NewCellPrivacyNotice, "clientId">,
  ): Promise<CellPrivacyNotice> {
    await this.ensureCellAvailable(cellId);
    const db = await this.getDbForCell(cellId);

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_client_id', ${clientId}, true)`);
      const [created] = await tx
        .insert(cellPrivacyNotices)
        .values({
          ...notice,
          clientId,
        })
        .returning();

      return created!;
    });
  }

  async findPublishedPrivacyNotice(
    cellId: string,
    clientId: string,
    locale: "es" | "en",
  ): Promise<CellPrivacyNotice | null> {
    await this.ensureCellAvailable(cellId);
    const db = await this.getDbForCell(cellId);

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_client_id', ${clientId}, true)`);
      const [notice] = await tx
        .select()
        .from(cellPrivacyNotices)
        .where(
          and(
            eq(cellPrivacyNotices.clientId, clientId),
            eq(cellPrivacyNotices.locale, locale),
            eq(cellPrivacyNotices.status, "published"),
          ),
        )
        .orderBy(desc(cellPrivacyNotices.publishedAt))
        .limit(1);

      return notice ?? null;
    });
  }

  async upsertContactProfile(
    cellId: string,
    clientId: string,
    contactId: string,
    profile: Omit<NewCellContactMemory, "clientId" | "contactId" | "kind">,
  ): Promise<CellContactMemory> {
    await this.ensureCellAvailable(cellId);
    const db = await this.getDbForCell(cellId);

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_client_id', ${clientId}, true)`);
      const [upserted] = await tx
        .insert(cellContactMemories)
        .values({
          ...profile,
          clientId,
          contactId,
          kind: "profile",
        })
        .onConflictDoUpdate({
          target: [cellContactMemories.clientId, cellContactMemories.contactId],
          targetWhere: sql`kind = 'profile'`,
          set: {
            content: profile.content,
            structuredData: profile.structuredData,
            embedding: profile.embedding,
            modelCode: profile.modelCode,
            updatedAt: new Date(),
            updatedBy: profile.updatedBy,
          },
        })
        .returning();

      return upserted!;
    });
  }

  async appendContactEpisode(
    cellId: string,
    clientId: string,
    contactId: string,
    episode: Omit<NewCellContactMemory, "clientId" | "contactId" | "kind">,
  ): Promise<CellContactMemory> {
    await this.ensureCellAvailable(cellId);
    const db = await this.getDbForCell(cellId);

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_client_id', ${clientId}, true)`);
      const [inserted] = await tx
        .insert(cellContactMemories)
        .values({
          ...episode,
          clientId,
          contactId,
          kind: "episode",
        })
        .returning();

      return inserted!;
    });
  }

  async getQualityMetrics(
    cellId: string,
    clientId: string,
  ): Promise<CrmQualityMetrics> {
    await this.ensureCellAvailable(cellId);
    const db = await this.getDbForCell(cellId);

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_client_id', ${clientId}, true)`);

      const contacts = await tx
        .select()
        .from(cellContacts)
        .where(and(eq(cellContacts.clientId, clientId), isNull(cellContacts.deletedAt)));

      const total = contacts.length;
      if (total === 0) {
        return {
          totalContacts: 0,
          accuracyRate: 100,
          uniquenessRate: 100,
          completenessRate: 100,
          recencyRate: 100,
          consentRate: 100,
        };
      }

      const e164Regex = /^\+[1-9]\d{1,14}$/;
      let accurateCount = 0;
      let completeCount = 0;
      let recentCount = 0;
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

      const phoneMap = new Map<string, number>();
      const emailMap = new Map<string, number>();

      for (const c of contacts) {
        const hasValidPhone = c.phoneMobile ? e164Regex.test(c.phoneMobile) : true;
        const hasValidEmail = c.email ? c.email === c.email.toLowerCase() : true;
        if (hasValidPhone && hasValidEmail) {
          accurateCount++;
        }

        const hasContactChannel = Boolean(c.email || c.phoneMobile || c.phoneLandline);
        if (c.fullName && c.fullName.trim().length > 0 && hasContactChannel) {
          completeCount++;
        }

        const lastInteraction = c.lastSeenAt ?? c.firstContactedAt ?? c.createdAt;
        if (lastInteraction >= ninetyDaysAgo) {
          recentCount++;
        }

        if (c.phoneMobile) {
          phoneMap.set(c.phoneMobile, (phoneMap.get(c.phoneMobile) ?? 0) + 1);
        }
        if (c.email) {
          emailMap.set(c.email, (emailMap.get(c.email) ?? 0) + 1);
        }
      }

      let uniqueCount = 0;
      for (const c of contacts) {
        const isPhoneDupe = c.phoneMobile ? (phoneMap.get(c.phoneMobile) ?? 0) > 1 : false;
        const isEmailDupe = c.email ? (emailMap.get(c.email) ?? 0) > 1 : false;
        if (!isPhoneDupe && !isEmailDupe) {
          uniqueCount++;
        }
      }

      const activeCommercialConsents = await tx
        .select({ prospectId: cellProspectConsents.prospectId })
        .from(cellProspectConsents)
        .where(
          and(
            eq(cellProspectConsents.clientId, clientId),
            eq(cellProspectConsents.purpose, "commercial_comms"),
            eq(cellProspectConsents.status, "granted"),
            isNull(cellProspectConsents.revokedAt),
          ),
        );

      const consentedIds = new Set(activeCommercialConsents.map((item) => item.prospectId));
      const consentedCount = contacts.filter((c) => consentedIds.has(c.id)).length;

      return {
        totalContacts: total,
        accuracyRate: Math.round((accurateCount / total) * 100),
        uniquenessRate: Math.round((uniqueCount / total) * 100),
        completenessRate: Math.round((completeCount / total) * 100),
        recencyRate: Math.round((recentCount / total) * 100),
        consentRate: Math.round((consentedCount / total) * 100),
      };
    });
  }
}
