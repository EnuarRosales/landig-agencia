import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getDb } from "../db/client";
import * as schema from "../db/schemas";
import {
  cellContacts,
  cellProspectConsents,
  cellPrivacyNotices,
  cellContactMemories,
  type CellContact,
  type NewCellContact,
  type CellProspectConsent,
  type NewCellProspectConsent,
  type CellPrivacyNotice,
  type NewCellPrivacyNotice,
  type CellContactMemory,
  type NewCellContactMemory,
} from "../db/schemas/tenant/crm";
import type {
  ICrmRepository,
  ListContactsFilter,
  CrmQualityMetrics,
} from "./crm.repository.interface";
import type {
  CellConnectionChecker,
  CellDatabaseProvider,
} from "./cell-auth.repository.interface";
import { CellUnavailableError } from "./cell-auth.repository.interface";

/**
 * Implementación Drizzle ORM del repositorio de CRM y contactos en celdas de datos multi-inquilino.
 *
 * Aplica aislamiento estricto fijando `app.current_client_id` dentro de transacciones aisladas
 * para garantizar cumplimiento de las políticas PostgreSQL `ENABLE + FORCE ROW LEVEL SECURITY`.
 */
export class DrizzleCrmRepository implements ICrmRepository {
  constructor(
    private readonly dbProvider: CellDatabaseProvider = () => getDb(),
    private readonly cellHealthChecker?: CellConnectionChecker,
  ) {}

  private getDbForCell(cellId: string): PostgresJsDatabase<typeof schema> {
    return this.dbProvider(cellId);
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
    const db = this.getDbForCell(cellId);

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
    const db = this.getDbForCell(cellId);

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

  async findContactById(
    cellId: string,
    clientId: string,
    id: string,
  ): Promise<CellContact | null> {
    await this.ensureCellAvailable(cellId);
    const db = this.getDbForCell(cellId);

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_client_id', ${clientId}, true)`);
      const [contact] = await tx
        .select()
        .from(cellContacts)
        .where(and(eq(cellContacts.clientId, clientId), eq(cellContacts.id, id)));

      return contact ?? null;
    });
  }

  async findContactByChatwootId(
    cellId: string,
    clientId: string,
    chatwootContactId: number,
  ): Promise<CellContact | null> {
    await this.ensureCellAvailable(cellId);
    const db = this.getDbForCell(cellId);

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_client_id', ${clientId}, true)`);
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
    await this.ensureCellAvailable(cellId);
    const db = this.getDbForCell(cellId);

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_client_id', ${clientId}, true)`);
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

  async listContacts(
    cellId: string,
    clientId: string,
    filters: ListContactsFilter = {},
  ): Promise<{ items: CellContact[]; total: number }> {
    await this.ensureCellAvailable(cellId);
    const db = this.getDbForCell(cellId);

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_client_id', ${clientId}, true)`);

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

      if (filters.assignedUserId) {
        conditions.push(eq(cellContacts.assignedUserId, filters.assignedUserId));
      }

      if (filters.query && filters.query.trim().length > 0) {
        const pattern = `%${filters.query.trim().toLowerCase()}%`;
        conditions.push(
          or(
            sql`lower(${cellContacts.fullName}) LIKE ${pattern}`,
            sql`lower(${cellContacts.email}) LIKE ${pattern}`,
            sql`${cellContacts.phoneMobile} LIKE ${pattern}`,
          )!,
        );
      }

      const whereClause = and(...conditions);

      const items = await tx
        .select()
        .from(cellContacts)
        .where(whereClause)
        .orderBy(desc(cellContacts.createdAt))
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

  async anonymizeContact(
    cellId: string,
    clientId: string,
    id: string,
    deletedBy: string,
  ): Promise<CellContact | null> {
    await this.ensureCellAvailable(cellId);
    const db = this.getDbForCell(cellId);

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_client_id', ${clientId}, true)`);

      const [anonymized] = await tx
        .update(cellContacts)
        .set({
          fullName: sql`'anon_' || substr(md5(${id}::text), 1, 8)`,
          email: null,
          phoneMobile: null,
          phoneLandline: null,
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
    const db = this.getDbForCell(cellId);

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
    const db = this.getDbForCell(cellId);

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
    const db = this.getDbForCell(cellId);

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
    const db = this.getDbForCell(cellId);

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
    const db = this.getDbForCell(cellId);

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
    const db = this.getDbForCell(cellId);

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
    const db = this.getDbForCell(cellId);

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
    const db = this.getDbForCell(cellId);

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
    const db = this.getDbForCell(cellId);

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
