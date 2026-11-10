import { eq, and, sql, isNull, desc } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { err, ok, type Result } from "../types/result";
import { getDb } from "../db/client";
import { withTenantCellTransaction } from "../db/cell-client";
import type { TenantCellTxRunner } from "./tenant-products-and-media.service";
import { clients } from "../db/schemas/admin/clients";
import { plans } from "../db/schemas/admin/plans";
import { users } from "../db/schemas/admin/users";
import { planLimits, type PlanLimitDimensionKey } from "../db/schemas/admin/plan-catalogs";
import { clientPlanOverrides } from "../db/schemas/admin/plan-catalogs";
import { tenantInvitations } from "../db/schemas/admin/chatwoot-media-onboarding";
import {
  cellContacts,
  type CellContact,
  type NewCellContact,
} from "../db/schemas/tenant/crm";
import {
  cellTenantUsers,
  type CellTenantUser,
} from "../db/schemas/tenant/tenancy-catalog";

/**
 * Entrada para la creación o sincronización de un contacto en el inquilino.
 */
export interface TenantContactInput {
  fullName: string;
  email?: string | null;
  phoneMobile?: string | null;
  phoneLandline?: string | null;
  documentType?: string | null;
  documentNumber?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  addressLine?: string | null;
  postalCode?: string | null;
  source?: string;
  channel?: string | null;
  chatwootContactId?: number | null;
  assignedUserId?: string | null;
  stage?: string;
  tags?: string[];
  notes?: string | null;
}

/**
 * Entrada para invitar a un usuario a colaborar en un inquilino.
 */
export interface TenantInvitationInput {
  email: string;
  role?: "tenant_agent";
  invitedByUserId: string;
  ttlMs?: number;
}

/**
 * Información de invitación registrada.
 */
export interface TenantInvitationRecord {
  id: string;
  clientId: string;
  email: string;
  role: string;
  invitedByUserId: string;
  tokenHash: Buffer;
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: Date;
  acceptedByUserId?: string | null;
  acceptedAt?: Date | null;
}

/**
 * Información de miembro activo del inquilino.
 */
export interface TenantMemberRecord {
  id: string;
  clientId: string;
  userId: string;
  role: "tenant_owner" | "tenant_agent";
  status: "active" | "left" | "suspended";
  joinedAt: Date;
  leftAt?: Date | null;
}

/**
 * Contrato de repositorio para contactos, usuarios e invitaciones con soporte multi-inquilino.
 */
export interface ITenantContactsAndUsersRepository {
  getPlanQuota(
    clientId: string,
    dimension: PlanLimitDimensionKey,
  ): Promise<{ mode: "LIMITED" | "UNLIMITED"; value: number | null }>;

  // Contactos
  countActiveContacts(clientId: string): Promise<number>;
  findExistingContact(
    clientId: string,
    criteria: { chatwootContactId?: number | null; email?: string | null; phoneMobile?: string | null },
  ): Promise<CellContact | null>;
  createContact(clientId: string, input: TenantContactInput, actor: string): Promise<CellContact>;
  updateContact(
    clientId: string,
    contactId: string,
    updates: Partial<TenantContactInput>,
    actor: string,
  ): Promise<CellContact | null>;
  deleteContact(clientId: string, contactId: string, actor: string): Promise<boolean>;
  listContacts(clientId: string): Promise<CellContact[]>;
  getContactById(clientId: string, contactId: string): Promise<CellContact | null>;

  // Usuarios e invitaciones
  countTenantUsers(clientId: string): Promise<{ activeUsers: number; pendingInvitations: number }>;
  createInvitation(
    clientId: string,
    invitation: {
      email: string;
      role: "tenant_agent";
      invitedByUserId: string;
      tokenHash: Buffer;
      expiresAt: Date;
    },
    actor: string,
  ): Promise<TenantInvitationRecord>;
  listInvitations(clientId: string): Promise<TenantInvitationRecord[]>;
  findInvitationByTokenHash(tokenHash: Buffer): Promise<TenantInvitationRecord | null>;
  revokeInvitation(clientId: string, invitationId: string, actor: string): Promise<boolean>;
  acceptInvitation(params: {
    invitationId: string;
    userId: string;
    acceptedAt: Date;
  }): Promise<boolean>;
  createTenantMembership(params: {
    clientId: string;
    userId: string;
    role: "tenant_agent" | "tenant_owner";
    invitedBy?: string | null;
  }): Promise<TenantMemberRecord>;
  listTenantMembers(clientId: string): Promise<TenantMemberRecord[]>;
  removeTenantMember(clientId: string, memberId: string, actor: string): Promise<boolean>;
  getUserActiveClientId(userId: string): Promise<string | null>;
  setUserActiveClientId(userId: string, clientId: string | null): Promise<void>;
}

/**
 * Repositorio en memoria para pruebas unitarias sin dependencias externas.
 */
export class InMemoryTenantContactsAndUsersRepository
  implements ITenantContactsAndUsersRepository
{
  public quotas = new Map<string, { mode: "LIMITED" | "UNLIMITED"; value: number | null }>();
  public contacts = new Map<string, CellContact>();
  public invitations = new Map<string, TenantInvitationRecord>();
  public members = new Map<string, TenantMemberRecord>();
  public userActiveClients = new Map<string, string | null>();

  async getPlanQuota(
    clientId: string,
    dimension: PlanLimitDimensionKey,
  ): Promise<{ mode: "LIMITED" | "UNLIMITED"; value: number | null }> {
    const key = `${clientId}:${dimension}`;
    return this.quotas.get(key) ?? { mode: "UNLIMITED", value: null };
  }

  async countActiveContacts(clientId: string): Promise<number> {
    let count = 0;
    for (const c of this.contacts.values()) {
      if (c.clientId === clientId && !c.deletedAt) {
        count++;
      }
    }
    return count;
  }

  async findExistingContact(
    clientId: string,
    criteria: { chatwootContactId?: number | null; email?: string | null; phoneMobile?: string | null },
  ): Promise<CellContact | null> {
    const normEmail = criteria.email?.trim().toLowerCase();
    const normPhone = criteria.phoneMobile?.trim();
    for (const c of this.contacts.values()) {
      if (c.clientId !== clientId || c.deletedAt) continue;
      if (criteria.chatwootContactId && c.chatwootContactId === criteria.chatwootContactId) {
        return c;
      }
      if (normEmail && c.email?.trim().toLowerCase() === normEmail) {
        return c;
      }
      if (normPhone && c.phoneMobile?.trim() === normPhone) {
        return c;
      }
    }
    return null;
  }

  async createContact(
    clientId: string,
    input: TenantContactInput,
    actor: string,
  ): Promise<CellContact> {
    const id = `019b0000-0000-7000-8000-${String(this.contacts.size + 1).padStart(12, "0")}`;
    const now = new Date();
    const contact: CellContact = {
      id,
      clientId,
      fullName: input.fullName,
      documentType: input.documentType ?? null,
      documentNumber: input.documentNumber ?? null,
      email: input.email ? input.email.trim().toLowerCase() : null,
      phoneMobile: input.phoneMobile ? input.phoneMobile.trim() : null,
      phoneLandline: input.phoneLandline ?? null,
      country: input.country ?? null,
      state: input.state ?? null,
      city: input.city ?? null,
      addressLine: input.addressLine ?? null,
      postalCode: input.postalCode ?? null,
      source: input.source ?? "manual",
      channel: input.channel ?? null,
      chatwootContactId: input.chatwootContactId ?? null,
      assignedUserId: input.assignedUserId ?? null,
      stage: input.stage ?? "new",
      tags: input.tags ?? [],
      language: "es",
      notes: input.notes ?? null,
      firstContactedAt: now,
      lastSeenAt: now,
      deletedAt: null,
      deletedBy: null,
      createdAt: now,
      createdBy: actor,
      updatedAt: now,
      updatedBy: actor,
    };
    this.contacts.set(id, contact);
    return contact;
  }

  async updateContact(
    clientId: string,
    contactId: string,
    updates: Partial<TenantContactInput>,
    actor: string,
  ): Promise<CellContact | null> {
    const existing = this.contacts.get(contactId);
    if (!existing || existing.clientId !== clientId || existing.deletedAt) {
      return null;
    }
    const updated: CellContact = {
      ...existing,
      fullName: updates.fullName ?? existing.fullName,
      email: updates.email !== undefined ? (updates.email ? updates.email.trim().toLowerCase() : null) : existing.email,
      phoneMobile: updates.phoneMobile !== undefined ? (updates.phoneMobile ? updates.phoneMobile.trim() : null) : existing.phoneMobile,
      phoneLandline: updates.phoneLandline !== undefined ? updates.phoneLandline : existing.phoneLandline,
      documentType: updates.documentType !== undefined ? updates.documentType : existing.documentType,
      documentNumber: updates.documentNumber !== undefined ? updates.documentNumber : existing.documentNumber,
      country: updates.country !== undefined ? updates.country : existing.country,
      state: updates.state !== undefined ? updates.state : existing.state,
      city: updates.city !== undefined ? updates.city : existing.city,
      addressLine: updates.addressLine !== undefined ? updates.addressLine : existing.addressLine,
      postalCode: updates.postalCode !== undefined ? updates.postalCode : existing.postalCode,
      stage: updates.stage !== undefined ? updates.stage : existing.stage,
      tags: updates.tags !== undefined ? updates.tags : existing.tags,
      notes: updates.notes !== undefined ? updates.notes : existing.notes,
      chatwootContactId: updates.chatwootContactId !== undefined ? updates.chatwootContactId : existing.chatwootContactId,
      assignedUserId: updates.assignedUserId !== undefined ? updates.assignedUserId : existing.assignedUserId,
      updatedAt: new Date(),
      updatedBy: actor,
    };
    this.contacts.set(contactId, updated);
    return updated;
  }

  async deleteContact(clientId: string, contactId: string, actor: string): Promise<boolean> {
    const existing = this.contacts.get(contactId);
    if (!existing || existing.clientId !== clientId || existing.deletedAt) {
      return false;
    }
    this.contacts.set(contactId, {
      ...existing,
      deletedAt: new Date(),
      deletedBy: actor,
      updatedAt: new Date(),
      updatedBy: actor,
    });
    return true;
  }

  async listContacts(clientId: string): Promise<CellContact[]> {
    return Array.from(this.contacts.values()).filter(
      (c) => c.clientId === clientId && !c.deletedAt,
    );
  }

  async getContactById(clientId: string, contactId: string): Promise<CellContact | null> {
    const contact = this.contacts.get(contactId);
    if (!contact || contact.clientId !== clientId || contact.deletedAt) {
      return null;
    }
    return contact;
  }

  async countTenantUsers(clientId: string): Promise<{ activeUsers: number; pendingInvitations: number }> {
    let activeUsers = 0;
    for (const m of this.members.values()) {
      if (m.clientId === clientId && m.status === "active") {
        activeUsers++;
      }
    }
    let pendingInvitations = 0;
    for (const inv of this.invitations.values()) {
      if (inv.clientId === clientId && inv.status === "pending" && inv.expiresAt.getTime() > Date.now()) {
        pendingInvitations++;
      }
    }
    return { activeUsers, pendingInvitations };
  }

  async createInvitation(
    clientId: string,
    invitation: {
      email: string;
      role: "tenant_agent";
      invitedByUserId: string;
      tokenHash: Buffer;
      expiresAt: Date;
    },
    _actor: string,
  ): Promise<TenantInvitationRecord> {
    const id = `019b0000-0000-7000-8001-${String(this.invitations.size + 1).padStart(12, "0")}`;
    const record: TenantInvitationRecord = {
      id,
      clientId,
      email: invitation.email.trim().toLowerCase(),
      role: invitation.role,
      invitedByUserId: invitation.invitedByUserId,
      tokenHash: invitation.tokenHash,
      status: "pending",
      expiresAt: invitation.expiresAt,
      acceptedByUserId: null,
      acceptedAt: null,
    };
    this.invitations.set(id, record);
    return record;
  }

  async listInvitations(clientId: string): Promise<TenantInvitationRecord[]> {
    return Array.from(this.invitations.values()).filter((i) => i.clientId === clientId);
  }

  async findInvitationByTokenHash(tokenHash: Buffer): Promise<TenantInvitationRecord | null> {
    for (const inv of this.invitations.values()) {
      if (inv.tokenHash.equals(tokenHash)) {
        return inv;
      }
    }
    return null;
  }

  async revokeInvitation(clientId: string, invitationId: string, _actor: string): Promise<boolean> {
    const inv = this.invitations.get(invitationId);
    if (!inv || inv.clientId !== clientId || inv.status !== "pending") {
      return false;
    }
    inv.status = "revoked";
    return true;
  }

  async acceptInvitation(params: {
    invitationId: string;
    userId: string;
    acceptedAt: Date;
  }): Promise<boolean> {
    const inv = this.invitations.get(params.invitationId);
    if (!inv || inv.status !== "pending") {
      return false;
    }
    inv.status = "accepted";
    inv.acceptedByUserId = params.userId;
    inv.acceptedAt = params.acceptedAt;
    return true;
  }

  async createTenantMembership(params: {
    clientId: string;
    userId: string;
    role: "tenant_agent" | "tenant_owner";
    invitedBy?: string | null;
  }): Promise<TenantMemberRecord> {
    const id = `019b0000-0000-7000-8002-${String(this.members.size + 1).padStart(12, "0")}`;
    const record: TenantMemberRecord = {
      id,
      clientId: params.clientId,
      userId: params.userId,
      role: params.role,
      status: "active",
      joinedAt: new Date(),
    };
    this.members.set(id, record);
    this.userActiveClients.set(params.userId, params.clientId);
    return record;
  }

  async listTenantMembers(clientId: string): Promise<TenantMemberRecord[]> {
    return Array.from(this.members.values()).filter(
      (m) => m.clientId === clientId && m.status === "active",
    );
  }

  async removeTenantMember(clientId: string, memberId: string, _actor: string): Promise<boolean> {
    const member = this.members.get(memberId);
    if (!member || member.clientId !== clientId || member.status !== "active") {
      return false;
    }
    member.status = "left";
    member.leftAt = new Date();
    if (this.userActiveClients.get(member.userId) === clientId) {
      this.userActiveClients.set(member.userId, null);
    }
    return true;
  }

  async getUserActiveClientId(userId: string): Promise<string | null> {
    return this.userActiveClients.get(userId) ?? null;
  }

  async setUserActiveClientId(userId: string, clientId: string | null): Promise<void> {
    this.userActiveClients.set(userId, clientId);
  }
}

/**
 * Implementación de persistencia Drizzle ORM sobre PostgreSQL.
 */
export class DrizzleTenantContactsAndUsersRepository
  implements ITenantContactsAndUsersRepository
{
  constructor(
    private readonly portalDb: any = getDb(),
    private readonly cellTxRunner: TenantCellTxRunner = withTenantCellTransaction,
  ) {}

  async getPlanQuota(
    clientId: string,
    dimension: PlanLimitDimensionKey,
  ): Promise<{ mode: "LIMITED" | "UNLIMITED"; value: number | null }> {
    const db = this.portalDb;
    const now = new Date();

    const [override] = await db
      .select({
        value: clientPlanOverrides.value,
      })
      .from(clientPlanOverrides)
      .where(
        and(
          eq(clientPlanOverrides.clientId, clientId),
          eq(clientPlanOverrides.dimension, dimension),
          sql`${clientPlanOverrides.validFrom} <= ${now}`,
          sql`(${clientPlanOverrides.validTo} IS NULL OR ${clientPlanOverrides.validTo} >= ${now})`,
        ),
      )
      .limit(1);

    if (override) {
      return {
        mode: "LIMITED",
        value: override.value !== null ? Number(override.value) : null,
      };
    }

    const [planLimit] = await db
      .select({
        mode: planLimits.mode,
        value: planLimits.value,
      })
      .from(clients)
      .innerJoin(plans, eq(clients.planId, plans.id))
      .innerJoin(
        planLimits,
        and(eq(planLimits.planId, plans.id), eq(planLimits.dimension, dimension)),
      )
      .where(eq(clients.id, clientId))
      .limit(1);

    if (planLimit) {
      return {
        mode: planLimit.mode as "LIMITED" | "UNLIMITED",
        value: planLimit.value !== null ? Number(planLimit.value) : null,
      };
    }

    return { mode: "UNLIMITED", value: null };
  }

  async countActiveContacts(clientId: string): Promise<number> {
    return this.cellTxRunner(clientId, async (tx) => {
      const [row] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(cellContacts)
        .where(and(eq(cellContacts.clientId, clientId), isNull(cellContacts.deletedAt)));
      return row?.count ?? 0;
    });
  }

  async findExistingContact(
    clientId: string,
    criteria: { chatwootContactId?: number | null; email?: string | null; phoneMobile?: string | null },
  ): Promise<CellContact | null> {
    return this.cellTxRunner(clientId, async (tx) => {
      const conditions = [eq(cellContacts.clientId, clientId), isNull(cellContacts.deletedAt)];

      if (criteria.chatwootContactId) {
        const [byCw] = await tx
          .select()
          .from(cellContacts)
          .where(and(...conditions, eq(cellContacts.chatwootContactId, criteria.chatwootContactId)))
          .limit(1);
        if (byCw) return byCw;
      }

      if (criteria.email) {
        const normEmail = criteria.email.trim().toLowerCase();
        const [byEmail] = await tx
          .select()
          .from(cellContacts)
          .where(and(...conditions, sql`lower(${cellContacts.email}) = ${normEmail}`))
          .limit(1);
        if (byEmail) return byEmail;
      }

      if (criteria.phoneMobile) {
        const normPhone = criteria.phoneMobile.trim();
        const [byPhone] = await tx
          .select()
          .from(cellContacts)
          .where(and(...conditions, eq(cellContacts.phoneMobile, normPhone)))
          .limit(1);
        if (byPhone) return byPhone;
      }

      return null;
    });
  }

  async createContact(
    clientId: string,
    input: TenantContactInput,
    actor: string,
  ): Promise<CellContact> {
    return this.cellTxRunner(clientId, async (tx) => {
      const [inserted] = await tx
        .insert(cellContacts)
        .values({
          clientId,
          fullName: input.fullName,
          documentType: input.documentType ?? null,
          documentNumber: input.documentNumber ?? null,
          email: input.email ? input.email.trim().toLowerCase() : null,
          phoneMobile: input.phoneMobile ? input.phoneMobile.trim() : null,
          phoneLandline: input.phoneLandline ?? null,
          country: input.country ?? null,
          state: input.state ?? null,
          city: input.city ?? null,
          addressLine: input.addressLine ?? null,
          postalCode: input.postalCode ?? null,
          source: input.source ?? "manual",
          channel: input.channel ?? null,
          chatwootContactId: input.chatwootContactId ?? null,
          assignedUserId: input.assignedUserId ?? null,
          stage: input.stage ?? "new",
          tags: input.tags ?? [],
          notes: input.notes ?? null,
          firstContactedAt: new Date(),
          lastSeenAt: new Date(),
          createdBy: actor,
          updatedBy: actor,
        })
        .returning();
      return inserted;
    });
  }

  async updateContact(
    clientId: string,
    contactId: string,
    updates: Partial<TenantContactInput>,
    actor: string,
  ): Promise<CellContact | null> {
    return this.cellTxRunner(clientId, async (tx) => {
      const [updated] = await tx
        .update(cellContacts)
        .set({
          ...(updates.fullName ? { fullName: updates.fullName } : {}),
          ...(updates.email !== undefined ? { email: updates.email ? updates.email.trim().toLowerCase() : null } : {}),
          ...(updates.phoneMobile !== undefined ? { phoneMobile: updates.phoneMobile ? updates.phoneMobile.trim() : null } : {}),
          ...(updates.phoneLandline !== undefined ? { phoneLandline: updates.phoneLandline } : {}),
          ...(updates.documentType !== undefined ? { documentType: updates.documentType } : {}),
          ...(updates.documentNumber !== undefined ? { documentNumber: updates.documentNumber } : {}),
          ...(updates.country !== undefined ? { country: updates.country } : {}),
          ...(updates.state !== undefined ? { state: updates.state } : {}),
          ...(updates.city !== undefined ? { city: updates.city } : {}),
          ...(updates.addressLine !== undefined ? { addressLine: updates.addressLine } : {}),
          ...(updates.postalCode !== undefined ? { postalCode: updates.postalCode } : {}),
          ...(updates.stage !== undefined ? { stage: updates.stage } : {}),
          ...(updates.tags !== undefined ? { tags: updates.tags } : {}),
          ...(updates.notes !== undefined ? { notes: updates.notes } : {}),
          ...(updates.chatwootContactId !== undefined ? { chatwootContactId: updates.chatwootContactId } : {}),
          ...(updates.assignedUserId !== undefined ? { assignedUserId: updates.assignedUserId } : {}),
          updatedAt: new Date(),
          updatedBy: actor,
        })
        .where(and(eq(cellContacts.clientId, clientId), eq(cellContacts.id, contactId), isNull(cellContacts.deletedAt)))
        .returning();
      return updated ?? null;
    });
  }

  async deleteContact(clientId: string, contactId: string, actor: string): Promise<boolean> {
    return this.cellTxRunner(clientId, async (tx) => {
      const [updated] = await tx
        .update(cellContacts)
        .set({
          deletedAt: new Date(),
          deletedBy: actor,
          updatedAt: new Date(),
          updatedBy: actor,
        })
        .where(and(eq(cellContacts.clientId, clientId), eq(cellContacts.id, contactId), isNull(cellContacts.deletedAt)))
        .returning({ id: cellContacts.id });
      return Boolean(updated);
    });
  }

  async listContacts(clientId: string): Promise<CellContact[]> {
    return this.cellTxRunner(clientId, async (tx) => {
      return await tx
        .select()
        .from(cellContacts)
        .where(and(eq(cellContacts.clientId, clientId), isNull(cellContacts.deletedAt)))
        .orderBy(desc(cellContacts.createdAt));
    });
  }

  async getContactById(clientId: string, contactId: string): Promise<CellContact | null> {
    return this.cellTxRunner(clientId, async (tx) => {
      const [found] = await tx
        .select()
        .from(cellContacts)
        .where(and(eq(cellContacts.clientId, clientId), eq(cellContacts.id, contactId), isNull(cellContacts.deletedAt)))
        .limit(1);
      return found ?? null;
    });
  }

  async countTenantUsers(clientId: string): Promise<{ activeUsers: number; pendingInvitations: number }> {
    const userRow = await this.cellTxRunner(clientId, async (tx) => {
      const [row] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(cellTenantUsers)
        .where(and(eq(cellTenantUsers.clientId, clientId), eq(cellTenantUsers.status, "active")));
      return row;
    });

    const [invRow] = await this.portalDb
      .select({ count: sql<number>`count(*)::int` })
      .from(tenantInvitations)
      .where(
        and(
          eq(tenantInvitations.clientId, clientId),
          eq(tenantInvitations.status, "pending"),
          sql`${tenantInvitations.expiresAt} > now()`,
        ),
      );

    return {
      activeUsers: userRow?.count ?? 0,
      pendingInvitations: invRow?.count ?? 0,
    };
  }

  async createInvitation(
    clientId: string,
    invitation: {
      email: string;
      role: "tenant_agent";
      invitedByUserId: string;
      tokenHash: Buffer;
      expiresAt: Date;
    },
    actor: string,
  ): Promise<TenantInvitationRecord> {
    const db = this.portalDb;
    const [inserted] = await db
      .insert(tenantInvitations)
      .values({
        clientId,
        email: invitation.email.trim().toLowerCase(),
        role: invitation.role,
        invitedByUserId: invitation.invitedByUserId,
        tokenHash: invitation.tokenHash,
        status: "pending",
        expiresAt: invitation.expiresAt,
        createdBy: actor,
        updatedBy: actor,
      })
      .returning();

    return {
      id: inserted.id,
      clientId: inserted.clientId,
      email: inserted.email,
      role: inserted.role,
      invitedByUserId: inserted.invitedByUserId,
      tokenHash: inserted.tokenHash,
      status: inserted.status as "pending",
      expiresAt: inserted.expiresAt,
    };
  }

  async listInvitations(clientId: string): Promise<TenantInvitationRecord[]> {
    const db = this.portalDb;
    const rows = await db
      .select()
      .from(tenantInvitations)
      .where(eq(tenantInvitations.clientId, clientId))
      .orderBy(desc(tenantInvitations.createdAt));

    return rows.map((r: any) => ({
      id: r.id,
      clientId: r.clientId,
      email: r.email,
      role: r.role,
      invitedByUserId: r.invitedByUserId,
      tokenHash: r.tokenHash,
      status: r.status,
      expiresAt: r.expiresAt,
      acceptedByUserId: r.acceptedByUserId,
      acceptedAt: r.acceptedAt,
    }));
  }

  async findInvitationByTokenHash(tokenHash: Buffer): Promise<TenantInvitationRecord | null> {
    const db = this.portalDb;
    const [row] = await db
      .select()
      .from(tenantInvitations)
      .where(eq(tenantInvitations.tokenHash, tokenHash))
      .limit(1);

    if (!row) return null;
    return {
      id: row.id,
      clientId: row.clientId,
      email: row.email,
      role: row.role,
      invitedByUserId: row.invitedByUserId,
      tokenHash: row.tokenHash,
      status: row.status as any,
      expiresAt: row.expiresAt,
      acceptedByUserId: row.acceptedByUserId,
      acceptedAt: row.acceptedAt,
    };
  }

  async revokeInvitation(clientId: string, invitationId: string, actor: string): Promise<boolean> {
    const db = this.portalDb;
    const [updated] = await db
      .update(tenantInvitations)
      .set({
        status: "revoked",
        updatedAt: new Date(),
        updatedBy: actor,
      })
      .where(
        and(
          eq(tenantInvitations.clientId, clientId),
          eq(tenantInvitations.id, invitationId),
          eq(tenantInvitations.status, "pending"),
        ),
      )
      .returning({ id: tenantInvitations.id });

    return Boolean(updated);
  }

  async acceptInvitation(params: {
    invitationId: string;
    userId: string;
    acceptedAt: Date;
  }): Promise<boolean> {
    const db = this.portalDb;
    const [updated] = await db
      .update(tenantInvitations)
      .set({
        status: "accepted",
        acceptedByUserId: params.userId,
        acceptedAt: params.acceptedAt,
        updatedAt: params.acceptedAt,
        updatedBy: params.userId,
      })
      .where(
        and(
          eq(tenantInvitations.id, params.invitationId),
          eq(tenantInvitations.status, "pending"),
        ),
      )
      .returning({ id: tenantInvitations.id });

    return Boolean(updated);
  }

  async createTenantMembership(params: {
    clientId: string;
    userId: string;
    role: "tenant_agent" | "tenant_owner";
    invitedBy?: string | null;
  }): Promise<TenantMemberRecord> {
    return this.cellTxRunner(params.clientId, async (tx) => {
      const [inserted] = await tx
        .insert(cellTenantUsers)
        .values({
          clientId: params.clientId,
          userId: params.userId,
          role: params.role,
          status: "active",
          invitedBy: params.invitedBy ?? null,
        })
        .returning();

      return {
        id: inserted.id,
        clientId: inserted.clientId,
        userId: inserted.userId,
        role: inserted.role as any,
        status: inserted.status as any,
        joinedAt: inserted.joinedAt,
      };
    });
  }

  async listTenantMembers(clientId: string): Promise<TenantMemberRecord[]> {
    return this.cellTxRunner(clientId, async (tx) => {
      const rows = await tx
        .select()
        .from(cellTenantUsers)
        .where(and(eq(cellTenantUsers.clientId, clientId), eq(cellTenantUsers.status, "active")))
        .orderBy(cellTenantUsers.joinedAt);

      return rows.map((r: any) => ({
        id: r.id,
        clientId: r.clientId,
        userId: r.userId,
        role: r.role,
        status: r.status,
        joinedAt: r.joinedAt,
        leftAt: r.leftAt,
      }));
    });
  }

  async removeTenantMember(clientId: string, memberId: string, actor: string): Promise<boolean> {
    const updated = await this.cellTxRunner(clientId, async (tx) => {
      const [res] = await tx
        .update(cellTenantUsers)
        .set({
          status: "left",
          leftAt: new Date(),
          updatedAt: new Date(),
          updatedBy: actor,
        })
        .where(
          and(
            eq(cellTenantUsers.clientId, clientId),
            eq(cellTenantUsers.id, memberId),
            eq(cellTenantUsers.status, "active"),
          ),
        )
        .returning({ id: cellTenantUsers.id, userId: cellTenantUsers.userId });
      return res;
    });

    if (!updated) return false;

    // Si era el active_client_id del usuario, limpiarlo en Router Global (db-portal)
    await this.portalDb
      .update(users)
      .set({ activeClientId: null })
      .where(and(eq(users.id, updated.userId), eq(users.activeClientId, clientId)));

    return true;
  }

  async getUserActiveClientId(userId: string): Promise<string | null> {
    const db = this.portalDb;
    const [user] = await db
      .select({ activeClientId: users.activeClientId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return user?.activeClientId ?? null;
  }

  async setUserActiveClientId(userId: string, clientId: string | null): Promise<void> {
    const db = this.portalDb;
    await db
      .update(users)
      .set({ activeClientId: clientId })
      .where(eq(users.id, userId));
  }
}

/**
 * Servicio de negocio para la gestión de contactos y usuarios/invitaciones de inquilinos
 * con deduplicación y control atómico de cuotas comerciales (T7, S3, S7, S10, S11).
 */
export class TenantContactsAndUsersService {
  private tenantLocks = new Map<string, Promise<unknown>>();

  constructor(
    private readonly repository: ITenantContactsAndUsersRepository,
  ) {}

  /**
   * Bloqueo atómico por inquilino para garantizar evaluación de cuotas libre de condiciones de carrera (RN-006, CA-011).
   */
  private async withTenantLock<T>(clientId: string, action: () => Promise<T>): Promise<T> {
    while (this.tenantLocks.has(clientId)) {
      await this.tenantLocks.get(clientId);
    }

    let releaseLock!: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    this.tenantLocks.set(clientId, lockPromise);

    try {
      return await action();
    } finally {
      this.tenantLocks.delete(clientId);
      releaseLock();
    }
  }

  /**
   * Alta de contacto individual con deduplicación y validación atómica de cuota (CA-005, CA-011).
   *
   * Si ya existe por Chatwoot ID, correo o teléfono, actualiza el registro existente sin consumir cuota adicional (S3).
   */
  async createOrSyncContact(
    clientId: string,
    input: TenantContactInput,
    actor: string,
  ): Promise<Result<{ contact: CellContact; action: "created" | "updated" }>> {
    if (!input.fullName?.trim() || input.fullName.trim().length < 2) {
      return err("El nombre del contacto es obligatorio y debe tener al menos 2 caracteres.", "VALIDATION_ERROR");
    }

    return await this.withTenantLock(clientId, async () => {
      // 1. Verificar si ya existe para deduplicación (S3)
      const existing = await this.repository.findExistingContact(clientId, {
        chatwootContactId: input.chatwootContactId,
        email: input.email,
        phoneMobile: input.phoneMobile,
      });

      if (existing) {
        // Actualizar sin consumir cuota
        const updated = await this.repository.updateContact(clientId, existing.id, input, actor);
        return ok({ contact: updated ?? existing, action: "updated" });
      }

      // 2. Evaluar cuota comercial para 'contacts'
      const quota = await this.repository.getPlanQuota(clientId, "contacts");
      if (quota.mode === "LIMITED") {
        if (quota.value === null || quota.value === 0) {
          return err(
            "Has alcanzado el límite de contactos incluido en tu plan.",
            "QUOTA_EXCEEDED",
          );
        }

        const currentActive = await this.repository.countActiveContacts(clientId);
        if (currentActive + 1 > quota.value) {
          return err(
            "Has alcanzado el límite de contactos incluido en tu plan.",
            "QUOTA_EXCEEDED",
          );
        }
      }

      // 3. Crear nuevo contacto
      const created = await this.repository.createContact(clientId, input, actor);
      return ok({ contact: created, action: "created" });
    });
  }

  /**
   * Importación por lotes de contactos con deduplicación y validación de cuota atómica compartida (CA-005, RN-005).
   */
  async importContacts(
    clientId: string,
    items: TenantContactInput[],
    actor: string,
  ): Promise<Result<{ created: CellContact[]; updated: CellContact[] }>> {
    if (!items.length) {
      return ok({ created: [], updated: [] });
    }

    for (const item of items) {
      if (!item.fullName?.trim()) {
        return err("Todos los contactos a importar deben incluir un nombre válido.", "VALIDATION_ERROR");
      }
    }

    return await this.withTenantLock(clientId, async () => {
      const createdList: CellContact[] = [];
      const updatedList: CellContact[] = [];
      const toCreate: TenantContactInput[] = [];

      // Pre-clasificar entre deduplicados y nuevos
      for (const item of items) {
        const existing = await this.repository.findExistingContact(clientId, {
          chatwootContactId: item.chatwootContactId,
          email: item.email,
          phoneMobile: item.phoneMobile,
        });

        if (existing) {
          const updated = await this.repository.updateContact(clientId, existing.id, item, actor);
          updatedList.push(updated ?? existing);
        } else {
          toCreate.push(item);
        }
      }

      // Si hay nuevos por crear, verificar cuota restante compartida
      if (toCreate.length > 0) {
        const quota = await this.repository.getPlanQuota(clientId, "contacts");
        if (quota.mode === "LIMITED") {
          if (quota.value === null || quota.value === 0) {
            return err(
              "Has alcanzado el límite de contactos incluido en tu plan.",
              "QUOTA_EXCEEDED",
            );
          }

          const currentActive = await this.repository.countActiveContacts(clientId);
          if (currentActive + toCreate.length > quota.value) {
            return err(
              "Has alcanzado el límite de contactos incluido en tu plan.",
              "QUOTA_EXCEEDED",
            );
          }
        }

        for (const item of toCreate) {
          const created = await this.repository.createContact(clientId, item, actor);
          createdList.push(created);
        }
      }

      return ok({ created: createdList, updated: updatedList });
    });
  }

  /**
   * Actualiza un contacto sin consumir cuota.
   */
  async updateContact(
    clientId: string,
    contactId: string,
    updates: Partial<TenantContactInput>,
    actor: string,
  ): Promise<Result<CellContact>> {
    const updated = await this.repository.updateContact(clientId, contactId, updates, actor);
    if (!updated) {
      return err("Contacto no encontrado o no disponible.", "NOT_FOUND");
    }
    return ok(updated);
  }

  /**
   * Elimina lógicamente un contacto liberando cuota inmediatamente (S3).
   */
  async deleteContact(clientId: string, contactId: string, actor: string): Promise<Result<boolean>> {
    const deleted = await this.repository.deleteContact(clientId, contactId, actor);
    if (!deleted) {
      return err("Contacto no encontrado o ya eliminado.", "NOT_FOUND");
    }
    return ok(true);
  }

  /**
   * Lista los contactos activos del inquilino.
   */
  async listContacts(clientId: string): Promise<CellContact[]> {
    return await this.repository.listContacts(clientId);
  }

  /**
   * Obtiene un contacto por su identificador.
   */
  async getContactById(clientId: string, contactId: string): Promise<CellContact | null> {
    return await this.repository.getContactById(clientId, contactId);
  }

  // =========================================================================
  // GESTIÓN DE USUARIOS DEL INQUILINO E INVITACIONES CON CUOTAS
  // =========================================================================

  /**
   * Emite una invitación para unirse al inquilino validando la cuota 'tenant_users' (S3, S7, S10, S11).
   *
   * Cuenta usuarios activos + invitaciones pendientes que reservan cupo (S3).
   */
  async issueInvitation(
    clientId: string,
    input: TenantInvitationInput,
    actor: string,
  ): Promise<Result<{ invitation: TenantInvitationRecord; rawToken: string }>> {
    const normalizedEmail = input.email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      return err("El correo electrónico de la invitación no es válido.", "VALIDATION_ERROR");
    }

    if (input.role && input.role !== "tenant_agent") {
      return err("Solo es posible invitar usuarios con el rol 'tenant_agent'.", "INVALID_ROLE");
    }

    return await this.withTenantLock(clientId, async () => {
      // 1. Evaluar cuota comercial 'tenant_users'
      const quota = await this.repository.getPlanQuota(clientId, "tenant_users");
      const { activeUsers, pendingInvitations } = await this.repository.countTenantUsers(clientId);
      const totalOccupied = activeUsers + pendingInvitations;

      if (quota.mode === "LIMITED") {
        if (quota.value === null || quota.value === 0) {
          return err(
            "Has alcanzado el límite de usuarios por inquilino incluido en tu plan.",
            "QUOTA_EXCEEDED",
          );
        }

        if (totalOccupied + 1 > quota.value) {
          return err(
            "Has alcanzado el límite de usuarios por inquilino incluido en tu plan.",
            "QUOTA_EXCEEDED",
          );
        }
      }

      // 2. Generar token criptográfico
      const rawToken = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(rawToken).digest();
      const ttlMs = input.ttlMs ?? 7 * 24 * 60 * 60 * 1000; // 7 días por defecto
      const expiresAt = new Date(Date.now() + ttlMs);

      const invitation = await this.repository.createInvitation(
        clientId,
        {
          email: normalizedEmail,
          role: "tenant_agent",
          invitedByUserId: input.invitedByUserId,
          tokenHash,
          expiresAt,
        },
        actor,
      );

      return ok({ invitation, rawToken });
    });
  }

  /**
   * Revoca una invitación pendiente liberando inmediatamente el cupo reservado (S3).
   */
  async revokeInvitation(
    clientId: string,
    invitationId: string,
    actor: string,
  ): Promise<Result<boolean>> {
    const revoked = await this.repository.revokeInvitation(clientId, invitationId, actor);
    if (!revoked) {
      return err("Invitación no encontrada o no se encuentra pendiente.", "NOT_FOUND");
    }
    return ok(true);
  }

  /**
   * Acepta una invitación pendiente verificando membresía única `1:0..1` (ADM-001 D-15).
   *
   * El total de cupos consumidos se mantiene constante (se consume la invitación y se activa el usuario).
   */
  async acceptInvitation(params: {
    rawToken: string;
    userId: string;
    userEmail: string;
    now?: Date;
  }): Promise<Result<TenantMemberRecord>> {
    const tokenHash = createHash("sha256").update(params.rawToken).digest();
    const invitation = await this.repository.findInvitationByTokenHash(tokenHash);

    if (!invitation || invitation.status !== "pending") {
      return err("Invitación inválida o ya utilizada.", "INVITATION_INVALID");
    }

    const now = params.now ?? new Date();
    if (now.getTime() > invitation.expiresAt.getTime()) {
      return err("La invitación ha expirado.", "INVITATION_EXPIRED");
    }

    // Validar regla de membresía única 1:0..1
    const activeClientId = await this.repository.getUserActiveClientId(params.userId);
    if (activeClientId !== null) {
      return err(
        "El usuario ya posee una membresía activa en otro comercio (ADM-001 D-15).",
        "USER_ALREADY_HAS_ACTIVE_MEMBERSHIP",
      );
    }

    // Aceptar invitación y crear membresía activa
    await this.repository.acceptInvitation({
      invitationId: invitation.id,
      userId: params.userId,
      acceptedAt: now,
    });

    const member = await this.repository.createTenantMembership({
      clientId: invitation.clientId,
      userId: params.userId,
      role: "tenant_agent",
      invitedBy: invitation.invitedByUserId,
    });

    return ok(member);
  }

  /**
   * Elimina a un miembro del inquilino liberando cuota (S3).
   * No permite remover al 'tenant_owner' (el inquilino siempre conserva a su dueño).
   */
  async removeMember(
    clientId: string,
    memberId: string,
    actor: string,
  ): Promise<Result<boolean>> {
    const members = await this.repository.listTenantMembers(clientId);
    const target = members.find((m) => m.id === memberId);

    if (!target) {
      return err("Miembro no encontrado.", "NOT_FOUND");
    }

    if (target.role === "tenant_owner") {
      return err("El dueño del comercio (tenant_owner) no puede ser removido.", "CANNOT_REMOVE_OWNER");
    }

    const removed = await this.repository.removeTenantMember(clientId, memberId, actor);
    return ok(removed);
  }

  /**
   * Lista miembros e invitaciones activas del inquilino junto con el conteo de cuota.
   */
  async getTenantUsersSummary(clientId: string): Promise<{
    activeMembers: TenantMemberRecord[];
    invitations: TenantInvitationRecord[];
    quota: { mode: "LIMITED" | "UNLIMITED"; value: number | null };
    usage: { activeUsers: number; pendingInvitations: number; totalConsumed: number };
  }> {
    const [activeMembers, invitations, quota, counts] = await Promise.all([
      this.repository.listTenantMembers(clientId),
      this.repository.listInvitations(clientId),
      this.repository.getPlanQuota(clientId, "tenant_users"),
      this.repository.countTenantUsers(clientId),
    ]);

    return {
      activeMembers,
      invitations,
      quota,
      usage: {
        activeUsers: counts.activeUsers,
        pendingInvitations: counts.pendingInvitations,
        totalConsumed: counts.activeUsers + counts.pendingInvitations,
      },
    };
  }
}
