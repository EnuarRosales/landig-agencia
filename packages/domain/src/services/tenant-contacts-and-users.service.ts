import { and, desc, eq, gt, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { err, ok, type Result } from "../types/result";
import { getDb } from "../db/client";
import { withTenantCellTransaction } from "../db/cell-client";
import type { TenantCellTxRunner } from "./tenant-products-and-media.service";
import { clients } from "../db/schemas/admin/clients";
import { plans } from "../db/schemas/admin/plans";
import { users } from "../db/schemas/admin/users";
import { clientRouting } from "../db/schemas/admin/client-routing";
import { platformUserRoles } from "../db/schemas/admin";
import { sessions } from "../db/schemas/admin/sessions";
import { planLimits, type PlanLimitDimensionKey } from "../db/schemas/admin/plan-catalogs";
import { clientPlanOverrides } from "../db/schemas/admin/plan-catalogs";
import { tenantInvitations } from "../db/schemas/admin/chatwoot-media-onboarding";
import {
  cellContacts,
  type CellContact,
} from "../db/schemas/tenant/crm";
import {
  cellTenantUsers,
} from "../db/schemas/tenant/tenancy-catalog";
import { cellUsers } from "../db/schemas/tenant/users";
import { hashPassword, verifyPassword } from "../auth/password-hasher";
import { validatePassword } from "../auth/validation";
import { defaultCellAuthRepository } from "../repositories/drizzle-cell-auth.repository";
import { authService } from "./auth.service";
import { getNotificationDispatcherService } from "./notification-dispatcher.service";
import { appLogger } from "../utils/logger";

/** Vigencia canónica por defecto de una invitación de equipo: 72 horas (`SPEC-12`). */
export const DEFAULT_TEAM_INVITATION_TTL_MS = 72 * 60 * 60 * 1000;

const EMAIL_VALIDATION_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  displayName?: string | null;
  role?: "tenant_agent";
  grantChatwootAccess?: boolean;
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
  displayName?: string | null;
  role: string;
  grantChatwootAccess: boolean;
  invitedByUserId: string;
  tokenHash: Buffer;
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: Date;
  acceptedByUserId?: string | null;
  acceptedAt?: Date | null;
  createdAt?: Date;
}

/**
 * Información de miembro del inquilino.
 */
export interface TenantMemberRecord {
  id: string;
  clientId: string;
  userId: string;
  email?: string;
  displayName?: string | null;
  role: "tenant_owner" | "tenant_agent";
  status: "active" | "left" | "suspended";
  grantChatwootAccess: boolean;
  chatwootAgentId?: number | null;
  joinedAt: Date;
  leftAt?: Date | null;
  lastAccessAt?: Date | null;
}

/**
 * DTO enriquecido de miembro del equipo para `/workspace/team` (`SPEC-12`).
 */
export interface TeamMemberProfileDto {
  id: string;
  userId: string;
  email: string;
  displayName: string | null;
  role: "tenant_owner" | "tenant_agent";
  status: "active" | "suspended" | "left";
  grantChatwootAccess: boolean;
  chatwootAgentId: number | null;
  joinedAt: string;
  lastAccessAt: string | null;
}

/**
 * DTO de invitación visible para el propietario en `/workspace/team` (`SPEC-12`).
 */
export interface TeamInvitationViewDto {
  id: string;
  email: string;
  displayName: string | null;
  role: "tenant_agent";
  grantChatwootAccess: boolean;
  status: "pending" | "expired" | "accepted" | "revoked";
  expiresAt: string;
  createdAt: string;
}

/**
 * Resumen combinado de cuotas de equipo y agentes Chatwoot (`SPEC-03` + `SPEC-12`).
 */
export interface TeamQuotaSummaryDto {
  tenantUsers: {
    usedActive: number;
    pendingInvitations: number;
    totalConsumed: number;
    limit: number | null;
    mode: "LIMITED" | "UNLIMITED";
  };
  chatwootAgents: {
    usedActive: number;
    pendingInvitations: number;
    totalConsumed: number;
    limit: number | null;
    mode: "LIMITED" | "UNLIMITED";
  };
}

/**
 * Respuesta unificada de listado de equipo, paginación, invitaciones y cuotas (`SPEC-12` + `SPEC-17`).
 */
export interface TeamListResultDto {
  members: TeamMemberProfileDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  invitations: TeamInvitationViewDto[];
  quota: TeamQuotaSummaryDto;
}

/**
 * Vista pública previa de una invitación para `/invite/[token]` (`SPEC-12`).
 */
export interface TeamInvitationPublicPreviewDto {
  valid: boolean;
  reason?: "invalid" | "expired" | "already_used" | "revoked";
  tenantName?: string;
  locale?: "es" | "en";
  emailHint?: string;
  displayName?: string | null;
  role?: "tenant_agent";
  grantChatwootAccess?: boolean;
  expiresAt?: string;
  existingAccount?: boolean;
  hasActiveMembershipConflict?: boolean;
}

/**
 * Snapshot mínimo de usuario global consultado para validar exclusividad `1:0..1` y aceptación.
 */
export interface GlobalUserAccountSnapshot {
  id: string;
  email: string;
  displayName: string | null;
  passwordHash: string | null;
  identityLocation: string;
  activeClientId: string | null;
  emailVerifiedAt: Date | null;
  status: string;
  hasPlatformRole: boolean;
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
  countTenantUsers(clientId: string): Promise<{
    activeUsers: number;
    pendingInvitations: number;
    activeChatwootAgents?: number;
    pendingChatwootInvitations?: number;
  }>;
  createInvitation(
    clientId: string,
    invitation: {
      email: string;
      displayName?: string | null;
      role: "tenant_agent";
      grantChatwootAccess?: boolean;
      invitedByUserId: string;
      tokenHash: Buffer;
      expiresAt: Date;
    },
    actor: string,
  ): Promise<TenantInvitationRecord>;
  listInvitations(clientId: string): Promise<TenantInvitationRecord[]>;
  findInvitationById?(clientId: string, invitationId: string): Promise<TenantInvitationRecord | null>;
  findInvitationByTokenHash(tokenHash: Buffer): Promise<TenantInvitationRecord | null>;
  findPendingInvitationsByEmail?(email: string): Promise<TenantInvitationRecord[]>;
  markInvitationExpired?(invitationId: string, actor: string): Promise<boolean>;
  updateInvitationToken?(params: {
    clientId: string;
    invitationId: string;
    tokenHash: Buffer;
    expiresAt: Date;
    actor: string;
  }): Promise<TenantInvitationRecord | null>;
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
    grantChatwootAccess?: boolean;
    invitedBy?: string | null;
  }): Promise<TenantMemberRecord>;
  listTenantMembers(
    clientId: string,
    options?: { includeSuspended?: boolean; includeLeft?: boolean },
  ): Promise<TenantMemberRecord[]>;
  findTenantMemberById?(clientId: string, memberId: string): Promise<TenantMemberRecord | null>;
  updateTenantMemberProfile?(params: {
    clientId: string;
    memberId: string;
    userId: string;
    displayName?: string;
    grantChatwootAccess?: boolean;
    actor: string;
  }): Promise<TenantMemberRecord | null>;
  updateTenantMemberStatus?(params: {
    clientId: string;
    memberId: string;
    userId: string;
    status: "active" | "suspended";
    actor: string;
  }): Promise<TenantMemberRecord | null>;
  removeTenantMember(clientId: string, memberId: string, actor: string): Promise<boolean>;
  getUserActiveClientId(userId: string): Promise<string | null>;
  setUserActiveClientId(userId: string, clientId: string | null): Promise<void>;
  findGlobalUserByEmail?(email: string): Promise<GlobalUserAccountSnapshot | null>;
  findCellPasswordHash?(cellId: string, clientId: string, userId: string): Promise<string | null>;
  getClientSummary?(clientId: string): Promise<{ id: string; displayName: string; locale: "es" | "en"; cellId: string | null } | null>;
  createInvitedGlobalAndCellUser?(params: {
    clientId: string;
    cellId: string | null;
    email: string;
    displayName: string;
    passwordHash: string;
    actor: string;
  }): Promise<{ userId: string }>;
  linkExistingUserToCell?(params: {
    userId: string;
    clientId: string;
    cellId: string | null;
    email: string;
    displayName: string;
    passwordHash: string | null;
    wasRouterIdentity: boolean;
    actor: string;
  }): Promise<void>;
  revokeUserPortalSessions?(userId: string, reason: string): Promise<void>;
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
  public globalUsers = new Map<string, GlobalUserAccountSnapshot>();
  public cellPasswords = new Map<string, string>();
  public clientsMeta = new Map<string, { id: string; displayName: string; locale: "es" | "en"; cellId: string | null }>();
  public revokedSessionsForUsers: Array<{ userId: string; reason: string }> = [];

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
      phoneSecondary: null,
      phoneValidationStatus: input.phoneMobile?.trim().startsWith("+")
        ? "verified_e164"
        : input.phoneMobile?.trim()
          ? "legacy_unformatted"
          : "unverified",
      companyName: null,
      birthDate: null,
      country: input.country ?? null,
      state: input.state ?? null,
      city: input.city ?? null,
      addressLine: input.addressLine ?? null,
      postalCode: input.postalCode ?? null,
      source: input.source ?? "manual",
      channel: input.channel ?? null,
      preferredChannel: input.phoneMobile ? "whatsapp" : null,
      lastChannel: input.channel ?? input.source ?? "manual",
      chatwootContactId: input.chatwootContactId ?? null,
      assignedUserId: input.assignedUserId ?? null,
      stage: input.stage ?? "new",
      tags: input.tags ?? [],
      language: "es",
      notes: input.notes ?? null,
      currentRatingStars: null,
      currentRatingComment: null,
      firstContactedAt: now,
      lastSeenAt: now,
      lastInboundMessageAt: null,
      lastWhatsappInboundAt: null,
      convertedToCustomerAt: null,
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

  async countTenantUsers(clientId: string): Promise<{
    activeUsers: number;
    pendingInvitations: number;
    activeChatwootAgents: number;
    pendingChatwootInvitations: number;
  }> {
    let activeUsers = 0;
    let activeChatwootAgents = 0;
    for (const m of this.members.values()) {
      if (m.clientId === clientId && m.status === "active") {
        activeUsers++;
        if (m.grantChatwootAccess) {
          activeChatwootAgents++;
        }
      }
    }
    let pendingInvitations = 0;
    let pendingChatwootInvitations = 0;
    for (const inv of this.invitations.values()) {
      if (inv.clientId === clientId && inv.status === "pending" && inv.expiresAt.getTime() > Date.now()) {
        pendingInvitations++;
        if (inv.grantChatwootAccess) {
          pendingChatwootInvitations++;
        }
      }
    }
    return {
      activeUsers,
      pendingInvitations,
      activeChatwootAgents,
      pendingChatwootInvitations,
    };
  }

  async createInvitation(
    clientId: string,
    invitation: {
      email: string;
      displayName?: string | null;
      role: "tenant_agent";
      grantChatwootAccess?: boolean;
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
      displayName: invitation.displayName?.trim() || null,
      role: invitation.role,
      grantChatwootAccess: invitation.grantChatwootAccess ?? true,
      invitedByUserId: invitation.invitedByUserId,
      tokenHash: invitation.tokenHash,
      status: "pending",
      expiresAt: invitation.expiresAt,
      acceptedByUserId: null,
      acceptedAt: null,
      createdAt: new Date(),
    };
    this.invitations.set(id, record);
    return record;
  }

  async listInvitations(clientId: string): Promise<TenantInvitationRecord[]> {
    return Array.from(this.invitations.values())
      .filter((i) => i.clientId === clientId)
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
  }

  async findInvitationById(clientId: string, invitationId: string): Promise<TenantInvitationRecord | null> {
    const inv = this.invitations.get(invitationId);
    if (!inv || inv.clientId !== clientId) return null;
    return inv;
  }

  async findInvitationByTokenHash(tokenHash: Buffer): Promise<TenantInvitationRecord | null> {
    for (const inv of this.invitations.values()) {
      if (inv.tokenHash.equals(tokenHash)) {
        return inv;
      }
    }
    return null;
  }

  async findPendingInvitationsByEmail(email: string): Promise<TenantInvitationRecord[]> {
    const norm = email.trim().toLowerCase();
    return Array.from(this.invitations.values()).filter(
      (inv) => inv.email === norm && inv.status === "pending",
    );
  }

  async markInvitationExpired(invitationId: string, _actor: string): Promise<boolean> {
    const inv = this.invitations.get(invitationId);
    if (!inv || inv.status !== "pending") return false;
    inv.status = "expired";
    return true;
  }

  async updateInvitationToken(params: {
    clientId: string;
    invitationId: string;
    tokenHash: Buffer;
    expiresAt: Date;
    actor: string;
  }): Promise<TenantInvitationRecord | null> {
    const inv = this.invitations.get(params.invitationId);
    if (!inv || inv.clientId !== params.clientId) return null;
    inv.tokenHash = params.tokenHash;
    inv.expiresAt = params.expiresAt;
    inv.status = "pending";
    return inv;
  }

  async revokeInvitation(clientId: string, invitationId: string, _actor: string): Promise<boolean> {
    const inv = this.invitations.get(invitationId);
    if (!inv || inv.clientId !== clientId || (inv.status !== "pending" && inv.status !== "expired")) {
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
    grantChatwootAccess?: boolean;
    invitedBy?: string | null;
  }): Promise<TenantMemberRecord> {
    const id = `019b0000-0000-7000-8002-${String(this.members.size + 1).padStart(12, "0")}`;
    const globalUser = Array.from(this.globalUsers.values()).find((u) => u.id === params.userId);
    const record: TenantMemberRecord = {
      id,
      clientId: params.clientId,
      userId: params.userId,
      email: globalUser?.email,
      displayName: globalUser?.displayName ?? null,
      role: params.role,
      status: "active",
      grantChatwootAccess: params.grantChatwootAccess ?? true,
      chatwootAgentId: null,
      joinedAt: new Date(),
      lastAccessAt: null,
    };
    this.members.set(id, record);
    this.userActiveClients.set(params.userId, params.clientId);
    if (globalUser) {
      globalUser.activeClientId = params.clientId;
    }
    return record;
  }

  async listTenantMembers(
    clientId: string,
    options?: { includeSuspended?: boolean; includeLeft?: boolean },
  ): Promise<TenantMemberRecord[]> {
    return Array.from(this.members.values()).filter((m) => {
      if (m.clientId !== clientId) return false;
      if (m.status === "active") return true;
      if (m.status === "suspended" && options?.includeSuspended) return true;
      if (m.status === "left" && options?.includeLeft) return true;
      return false;
    });
  }

  async findTenantMemberById(clientId: string, memberId: string): Promise<TenantMemberRecord | null> {
    const m = this.members.get(memberId);
    if (!m || m.clientId !== clientId) return null;
    return m;
  }

  async updateTenantMemberProfile(params: {
    clientId: string;
    memberId: string;
    userId: string;
    displayName?: string;
    grantChatwootAccess?: boolean;
    actor: string;
  }): Promise<TenantMemberRecord | null> {
    const m = this.members.get(params.memberId);
    if (!m || m.clientId !== params.clientId || m.status === "left") return null;
    if (params.displayName !== undefined) {
      m.displayName = params.displayName;
      for (const u of this.globalUsers.values()) {
        if (u.id === params.userId) u.displayName = params.displayName;
      }
    }
    if (params.grantChatwootAccess !== undefined) {
      m.grantChatwootAccess = params.grantChatwootAccess;
    }
    return m;
  }

  async updateTenantMemberStatus(params: {
    clientId: string;
    memberId: string;
    userId: string;
    status: "active" | "suspended";
    actor: string;
  }): Promise<TenantMemberRecord | null> {
    const m = this.members.get(params.memberId);
    if (!m || m.clientId !== params.clientId || m.status === "left") return null;
    m.status = params.status;
    return m;
  }

  async removeTenantMember(clientId: string, memberId: string, _actor: string): Promise<boolean> {
    const member = this.members.get(memberId);
    if (!member || member.clientId !== clientId || member.status === "left") {
      return false;
    }
    member.status = "left";
    member.leftAt = new Date();
    if (this.userActiveClients.get(member.userId) === clientId) {
      this.userActiveClients.set(member.userId, null);
    }
    for (const u of this.globalUsers.values()) {
      if (u.id === member.userId && u.activeClientId === clientId) {
        u.activeClientId = null;
      }
    }
    return true;
  }

  async getUserActiveClientId(userId: string): Promise<string | null> {
    return this.userActiveClients.get(userId) ?? null;
  }

  async setUserActiveClientId(userId: string, clientId: string | null): Promise<void> {
    this.userActiveClients.set(userId, clientId);
  }

  async findGlobalUserByEmail(email: string): Promise<GlobalUserAccountSnapshot | null> {
    return this.globalUsers.get(email.trim().toLowerCase()) ?? null;
  }

  async findCellPasswordHash(cellId: string, clientId: string, userId: string): Promise<string | null> {
    return this.cellPasswords.get(`${cellId}:${clientId}:${userId}`) ?? null;
  }

  async getClientSummary(
    clientId: string,
  ): Promise<{ id: string; displayName: string; locale: "es" | "en"; cellId: string | null } | null> {
    return (
      this.clientsMeta.get(clientId) ?? {
        id: clientId,
        displayName: "Comercio Mocter",
        locale: "es",
        cellId: "cell-01",
      }
    );
  }

  async createInvitedGlobalAndCellUser(params: {
    clientId: string;
    cellId: string | null;
    email: string;
    displayName: string;
    passwordHash: string;
    actor: string;
  }): Promise<{ userId: string }> {
    const normEmail = params.email.trim().toLowerCase();
    const userId = `019b0000-0000-7000-8003-${String(this.globalUsers.size + 1).padStart(12, "0")}`;
    const snap: GlobalUserAccountSnapshot = {
      id: userId,
      email: normEmail,
      displayName: params.displayName,
      passwordHash: null,
      identityLocation: params.cellId ?? "router",
      activeClientId: params.clientId,
      emailVerifiedAt: new Date(),
      status: "active",
      hasPlatformRole: false,
    };
    this.globalUsers.set(normEmail, snap);
    this.userActiveClients.set(userId, params.clientId);
    if (params.cellId) {
      this.cellPasswords.set(`${params.cellId}:${params.clientId}:${userId}`, params.passwordHash);
    }
    return { userId };
  }

  async linkExistingUserToCell(params: {
    userId: string;
    clientId: string;
    cellId: string | null;
    email: string;
    displayName: string;
    passwordHash: string | null;
    wasRouterIdentity: boolean;
    actor: string;
  }): Promise<void> {
    const normEmail = params.email.trim().toLowerCase();
    const existing = this.globalUsers.get(normEmail);
    if (existing) {
      existing.activeClientId = params.clientId;
      existing.displayName = params.displayName;
      existing.emailVerifiedAt = existing.emailVerifiedAt ?? new Date();
      if (params.cellId) {
        existing.identityLocation = params.cellId;
        if (params.passwordHash) {
          this.cellPasswords.set(`${params.cellId}:${params.clientId}:${params.userId}`, params.passwordHash);
        }
        existing.passwordHash = null;
      }
    }
    this.userActiveClients.set(params.userId, params.clientId);
  }

  async revokeUserPortalSessions(userId: string, reason: string): Promise<void> {
    this.revokedSessionsForUsers.push({ userId, reason });
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
          lte(clientPlanOverrides.validFrom, now),
          or(
            isNull(clientPlanOverrides.validTo),
            gt(clientPlanOverrides.validTo, now),
          ),
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

  async countTenantUsers(clientId: string): Promise<{
    activeUsers: number;
    pendingInvitations: number;
    activeChatwootAgents: number;
    pendingChatwootInvitations: number;
  }> {
    const cellCounts = await this.cellTxRunner(clientId, async (tx) => {
      const [row] = await tx
        .select({
          activeUsers: sql<number>`count(*)::int`,
          activeChatwootAgents: sql<number>`count(*) FILTER (WHERE ${cellTenantUsers.grantChatwootAccess} = true)::int`,
        })
        .from(cellTenantUsers)
        .where(and(eq(cellTenantUsers.clientId, clientId), eq(cellTenantUsers.status, "active")));
      return row;
    });

    const [invRow] = await this.portalDb
      .select({
        pendingInvitations: sql<number>`count(*)::int`,
        pendingChatwootInvitations: sql<number>`count(*) FILTER (WHERE ${tenantInvitations.grantChatwootAccess} = true)::int`,
      })
      .from(tenantInvitations)
      .where(
        and(
          eq(tenantInvitations.clientId, clientId),
          eq(tenantInvitations.status, "pending"),
          sql`${tenantInvitations.expiresAt} > now()`,
        ),
      );

    return {
      activeUsers: Number(cellCounts?.activeUsers ?? 0),
      pendingInvitations: Number(invRow?.pendingInvitations ?? 0),
      activeChatwootAgents: Number(cellCounts?.activeChatwootAgents ?? 0),
      pendingChatwootInvitations: Number(invRow?.pendingChatwootInvitations ?? 0),
    };
  }

  async createInvitation(
    clientId: string,
    invitation: {
      email: string;
      displayName?: string | null;
      role: "tenant_agent";
      grantChatwootAccess?: boolean;
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
        displayName: invitation.displayName?.trim() || null,
        role: invitation.role,
        grantChatwootAccess: invitation.grantChatwootAccess ?? true,
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
      displayName: inserted.displayName ?? null,
      role: inserted.role,
      grantChatwootAccess: Boolean(inserted.grantChatwootAccess),
      invitedByUserId: inserted.invitedByUserId,
      tokenHash: inserted.tokenHash,
      status: inserted.status as "pending",
      expiresAt: inserted.expiresAt,
      createdAt: inserted.createdAt,
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
      displayName: r.displayName ?? null,
      role: r.role,
      grantChatwootAccess: r.grantChatwootAccess ?? true,
      invitedByUserId: r.invitedByUserId,
      tokenHash: r.tokenHash,
      status: r.status,
      expiresAt: r.expiresAt,
      acceptedByUserId: r.acceptedByUserId,
      acceptedAt: r.acceptedAt,
      createdAt: r.createdAt,
    }));
  }

  async findInvitationById(clientId: string, invitationId: string): Promise<TenantInvitationRecord | null> {
    const db = this.portalDb;
    const [row] = await db
      .select()
      .from(tenantInvitations)
      .where(and(eq(tenantInvitations.clientId, clientId), eq(tenantInvitations.id, invitationId)))
      .limit(1);

    if (!row) return null;
    return {
      id: row.id,
      clientId: row.clientId,
      email: row.email,
      displayName: row.displayName ?? null,
      role: row.role,
      grantChatwootAccess: Boolean(row.grantChatwootAccess),
      invitedByUserId: row.invitedByUserId,
      tokenHash: row.tokenHash,
      status: row.status as TenantInvitationRecord["status"],
      expiresAt: row.expiresAt,
      acceptedByUserId: row.acceptedByUserId,
      acceptedAt: row.acceptedAt,
      createdAt: row.createdAt,
    };
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
      displayName: row.displayName ?? null,
      role: row.role,
      grantChatwootAccess: Boolean(row.grantChatwootAccess),
      invitedByUserId: row.invitedByUserId,
      tokenHash: row.tokenHash,
      status: row.status as TenantInvitationRecord["status"],
      expiresAt: row.expiresAt,
      acceptedByUserId: row.acceptedByUserId,
      acceptedAt: row.acceptedAt,
      createdAt: row.createdAt,
    };
  }

  async findPendingInvitationsByEmail(email: string): Promise<TenantInvitationRecord[]> {
    const db = this.portalDb;
    const norm = email.trim().toLowerCase();
    const rows = await db
      .select()
      .from(tenantInvitations)
      .where(and(eq(tenantInvitations.email, norm), eq(tenantInvitations.status, "pending")));

    return rows.map((r: any) => ({
      id: r.id,
      clientId: r.clientId,
      email: r.email,
      displayName: r.displayName ?? null,
      role: r.role,
      grantChatwootAccess: Boolean(r.grantChatwootAccess),
      invitedByUserId: r.invitedByUserId,
      tokenHash: r.tokenHash,
      status: r.status,
      expiresAt: r.expiresAt,
      acceptedByUserId: r.acceptedByUserId,
      acceptedAt: r.acceptedAt,
      createdAt: r.createdAt,
    }));
  }

  async markInvitationExpired(invitationId: string, actor: string): Promise<boolean> {
    const db = this.portalDb;
    const [updated] = await db
      .update(tenantInvitations)
      .set({
        status: "expired",
        updatedAt: new Date(),
        updatedBy: actor,
      })
      .where(and(eq(tenantInvitations.id, invitationId), eq(tenantInvitations.status, "pending")))
      .returning({ id: tenantInvitations.id });
    return Boolean(updated);
  }

  async updateInvitationToken(params: {
    clientId: string;
    invitationId: string;
    tokenHash: Buffer;
    expiresAt: Date;
    actor: string;
  }): Promise<TenantInvitationRecord | null> {
    const db = this.portalDb;
    const [updated] = await db
      .update(tenantInvitations)
      .set({
        tokenHash: params.tokenHash,
        expiresAt: params.expiresAt,
        status: "pending",
        updatedAt: new Date(),
        updatedBy: params.actor,
      })
      .where(
        and(
          eq(tenantInvitations.clientId, params.clientId),
          eq(tenantInvitations.id, params.invitationId),
          inArray(tenantInvitations.status, ["pending", "expired"]),
        ),
      )
      .returning();

    if (!updated) return null;
    return {
      id: updated.id,
      clientId: updated.clientId,
      email: updated.email,
      displayName: updated.displayName ?? null,
      role: updated.role,
      grantChatwootAccess: Boolean(updated.grantChatwootAccess),
      invitedByUserId: updated.invitedByUserId,
      tokenHash: updated.tokenHash,
      status: updated.status as TenantInvitationRecord["status"],
      expiresAt: updated.expiresAt,
      acceptedByUserId: updated.acceptedByUserId,
      acceptedAt: updated.acceptedAt,
      createdAt: updated.createdAt,
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
          inArray(tenantInvitations.status, ["pending", "expired"]),
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
    grantChatwootAccess?: boolean;
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
          grantChatwootAccess: params.grantChatwootAccess ?? true,
          invitedBy: params.invitedBy ?? null,
        })
        .returning();

      return {
        id: inserted.id,
        clientId: inserted.clientId,
        userId: inserted.userId,
        role: inserted.role as "tenant_owner" | "tenant_agent",
        status: inserted.status as "active" | "left" | "suspended",
        grantChatwootAccess: Boolean(inserted.grantChatwootAccess),
        chatwootAgentId: inserted.chatwootAgentId ?? null,
        joinedAt: inserted.joinedAt,
      };
    });
  }

  private async enrichMembersWithPortalData(
    clientId: string,
    memberships: Array<{
      id: string;
      clientId: string;
      userId: string;
      role: string;
      status: string;
      grantChatwootAccess: boolean;
      chatwootAgentId: number | null;
      joinedAt: Date;
      leftAt: Date | null;
      cellDisplayName?: string | null;
      cellEmail?: string | null;
    }>,
  ): Promise<TenantMemberRecord[]> {
    if (memberships.length === 0) return [];

    const userIds = Array.from(new Set(memberships.map((m) => m.userId)));
    const db = this.portalDb;

    const [portalUsers, sessionAccessRows] = await Promise.all([
      db
        .select({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
        })
        .from(users)
        .where(inArray(users.id, userIds)),
      db
        .select({
          userId: sessions.userId,
          lastSeenAt: sql<Date | null>`max(${sessions.lastSeenAt})`,
        })
        .from(sessions)
        .where(and(inArray(sessions.userId, userIds), eq(sessions.clientId, clientId)))
        .groupBy(sessions.userId),
    ]);

    const userMap = new Map<string, { email: string; displayName: string | null }>();
    for (const u of portalUsers) {
      userMap.set(u.id, { email: u.email, displayName: u.displayName });
    }

    const lastAccessMap = new Map<string, Date | null>();
    for (const s of sessionAccessRows) {
      lastAccessMap.set(s.userId, s.lastSeenAt ? new Date(s.lastSeenAt) : null);
    }

    return memberships.map((r) => {
      const pu = userMap.get(r.userId);
      return {
        id: r.id,
        clientId: r.clientId,
        userId: r.userId,
        email: r.cellEmail || pu?.email || "",
        displayName: r.cellDisplayName ?? pu?.displayName ?? null,
        role: r.role as "tenant_owner" | "tenant_agent",
        status: r.status as "active" | "left" | "suspended",
        grantChatwootAccess: Boolean(r.grantChatwootAccess),
        chatwootAgentId: r.chatwootAgentId ?? null,
        joinedAt: r.joinedAt,
        leftAt: r.leftAt,
        lastAccessAt: lastAccessMap.get(r.userId) ?? null,
      };
    });
  }

  async listTenantMembers(
    clientId: string,
    options?: { includeSuspended?: boolean; includeLeft?: boolean },
  ): Promise<TenantMemberRecord[]> {
    const allowedStatuses = ["active"];
    if (options?.includeSuspended) allowedStatuses.push("suspended");
    if (options?.includeLeft) allowedStatuses.push("left");

    const rows = await this.cellTxRunner(clientId, async (tx) => {
      const memberRows: Array<typeof cellTenantUsers.$inferSelect> = await tx
        .select()
        .from(cellTenantUsers)
        .where(
          and(
            eq(cellTenantUsers.clientId, clientId),
            inArray(cellTenantUsers.status, allowedStatuses),
          ),
        )
        .orderBy(desc(cellTenantUsers.joinedAt));

      if (memberRows.length === 0) return [];
      const userIds: string[] = Array.from(new Set(memberRows.map((m) => m.userId)));
      const cUsers: Array<{ id: string; email: string; displayName: string | null }> = await tx
        .select({
          id: cellUsers.id,
          email: cellUsers.email,
          displayName: cellUsers.displayName,
        })
        .from(cellUsers)
        .where(and(eq(cellUsers.clientId, clientId), inArray(cellUsers.id, userIds)));

      const cMap = new Map(cUsers.map((cu) => [cu.id, cu]));
      return memberRows.map((m) => {
        const cu = cMap.get(m.userId);
        return {
          ...m,
          cellDisplayName: cu?.displayName ?? null,
          cellEmail: cu?.email ?? null,
        };
      });
    });

    return await this.enrichMembersWithPortalData(clientId, rows);
  }

  async findTenantMemberById(clientId: string, memberId: string): Promise<TenantMemberRecord | null> {
    const rows = await this.cellTxRunner(clientId, async (tx) => {
      const [m] = await tx
        .select()
        .from(cellTenantUsers)
        .where(and(eq(cellTenantUsers.clientId, clientId), eq(cellTenantUsers.id, memberId)))
        .limit(1);
      if (!m) return [];
      const [cu] = await tx
        .select({
          email: cellUsers.email,
          displayName: cellUsers.displayName,
        })
        .from(cellUsers)
        .where(and(eq(cellUsers.clientId, clientId), eq(cellUsers.id, m.userId)))
        .limit(1);
      return [
        {
          ...m,
          cellDisplayName: cu?.displayName ?? null,
          cellEmail: cu?.email ?? null,
        },
      ];
    });

    const enriched = await this.enrichMembersWithPortalData(clientId, rows);
    return enriched[0] ?? null;
  }

  async updateTenantMemberProfile(params: {
    clientId: string;
    memberId: string;
    userId: string;
    displayName?: string;
    grantChatwootAccess?: boolean;
    actor: string;
  }): Promise<TenantMemberRecord | null> {
    const now = new Date();
    const updatedRow = await this.cellTxRunner(params.clientId, async (tx) => {
      let memberRow: any = null;
      if (params.grantChatwootAccess !== undefined) {
        const [u] = await tx
          .update(cellTenantUsers)
          .set({
            grantChatwootAccess: params.grantChatwootAccess,
            updatedAt: now,
            updatedBy: params.actor,
          })
          .where(
            and(
              eq(cellTenantUsers.clientId, params.clientId),
              eq(cellTenantUsers.id, params.memberId),
              ne(cellTenantUsers.status, "left"),
            ),
          )
          .returning();
        memberRow = u;
      } else {
        const [u] = await tx
          .select()
          .from(cellTenantUsers)
          .where(
            and(
              eq(cellTenantUsers.clientId, params.clientId),
              eq(cellTenantUsers.id, params.memberId),
              ne(cellTenantUsers.status, "left"),
            ),
          )
          .limit(1);
        memberRow = u;
      }

      if (!memberRow) return null;

      if (params.displayName !== undefined) {
        await tx
          .update(cellUsers)
          .set({
            displayName: params.displayName,
            updatedAt: now,
            updatedBy: params.actor,
          })
          .where(and(eq(cellUsers.clientId, params.clientId), eq(cellUsers.id, params.userId)));
      }

      return memberRow;
    });

    if (!updatedRow) return null;

    if (params.displayName !== undefined) {
      await this.portalDb
        .update(users)
        .set({
          displayName: params.displayName,
          updatedAt: now,
          updatedBy: params.actor,
        })
        .where(eq(users.id, params.userId));
    }

    return await this.findTenantMemberById(params.clientId, params.memberId);
  }

  async updateTenantMemberStatus(params: {
    clientId: string;
    memberId: string;
    userId: string;
    status: "active" | "suspended";
    actor: string;
  }): Promise<TenantMemberRecord | null> {
    const now = new Date();
    const cellUserStatus = params.status === "active" ? "active" : "disabled";

    const updated = await this.cellTxRunner(params.clientId, async (tx) => {
      const [res] = await tx
        .update(cellTenantUsers)
        .set({
          status: params.status,
          updatedAt: now,
          updatedBy: params.actor,
        })
        .where(
          and(
            eq(cellTenantUsers.clientId, params.clientId),
            eq(cellTenantUsers.id, params.memberId),
            ne(cellTenantUsers.status, "left"),
          ),
        )
        .returning();

      if (!res) return null;

      await tx
        .update(cellUsers)
        .set({
          status: cellUserStatus,
          updatedAt: now,
          updatedBy: params.actor,
        })
        .where(and(eq(cellUsers.clientId, params.clientId), eq(cellUsers.id, params.userId)));

      return res;
    });

    if (!updated) return null;
    return await this.findTenantMemberById(params.clientId, params.memberId);
  }

  async removeTenantMember(clientId: string, memberId: string, actor: string): Promise<boolean> {
    const now = new Date();
    const updated = await this.cellTxRunner(clientId, async (tx) => {
      const [res] = await tx
        .update(cellTenantUsers)
        .set({
          status: "left",
          leftAt: now,
          updatedAt: now,
          updatedBy: actor,
        })
        .where(
          and(
            eq(cellTenantUsers.clientId, clientId),
            eq(cellTenantUsers.id, memberId),
            inArray(cellTenantUsers.status, ["active", "suspended"]),
          ),
        )
        .returning({ id: cellTenantUsers.id, userId: cellTenantUsers.userId });

      if (!res) return null;

      const [cUser] = await tx
        .update(cellUsers)
        .set({
          status: "disabled",
          updatedAt: now,
          updatedBy: actor,
        })
        .where(and(eq(cellUsers.clientId, clientId), eq(cellUsers.id, res.userId)))
        .returning({
          passwordHash: cellUsers.passwordHash,
          passwordUpdatedAt: cellUsers.passwordUpdatedAt,
        });

      return {
        ...res,
        passwordHash: cUser?.passwordHash ?? null,
        passwordUpdatedAt: cUser?.passwordUpdatedAt ?? null,
      };
    });

    if (!updated) return false;

    // Limpiar active_client_id y restaurar identityLocation='router' con credencial para mantener consistencia 1:0..1
    await this.portalDb
      .update(users)
      .set({
        activeClientId: null,
        identityLocation: "router",
        ...(updated.passwordHash
          ? {
              passwordHash: updated.passwordHash,
              passwordUpdatedAt: updated.passwordUpdatedAt ?? now,
            }
          : {}),
        updatedAt: now,
        updatedBy: actor,
      })
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

  async findGlobalUserByEmail(email: string): Promise<GlobalUserAccountSnapshot | null> {
    const db = this.portalDb;
    const norm = email.trim().toLowerCase();
    const [u] = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        passwordHash: users.passwordHash,
        identityLocation: users.identityLocation,
        activeClientId: users.activeClientId,
        emailVerifiedAt: users.emailVerifiedAt,
        status: users.status,
      })
      .from(users)
      .where(sql`lower(${users.email}) = ${norm}`)
      .limit(1);

    if (!u) return null;

    const pRoles = await db
      .select({ role: platformUserRoles.role })
      .from(platformUserRoles)
      .where(and(eq(platformUserRoles.userId, u.id), isNull(platformUserRoles.revokedAt)))
      .limit(1);

    return {
      ...u,
      hasPlatformRole: pRoles.length > 0,
    };
  }

  async findCellPasswordHash(cellId: string, clientId: string, userId: string): Promise<string | null> {
    try {
      const creds = await defaultCellAuthRepository.findUserCredentialsInCell(cellId, clientId, userId);
      return creds?.passwordHash ?? null;
    } catch {
      return null;
    }
  }

  async getClientSummary(
    clientId: string,
  ): Promise<{ id: string; displayName: string; locale: "es" | "en"; cellId: string | null } | null> {
    const db = this.portalDb;
    const [row] = await db
      .select({
        id: clients.id,
        displayName: clients.displayName,
        locale: clients.locale,
      })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);

    if (!row) return null;

    const [routing] = await db
      .select({ cellId: clientRouting.cellId })
      .from(clientRouting)
      .where(eq(clientRouting.clientId, clientId))
      .limit(1);

    return {
      id: row.id,
      displayName: row.displayName,
      locale: row.locale === "en" ? "en" : "es",
      cellId: routing?.cellId ?? null,
    };
  }

  async createInvitedGlobalAndCellUser(params: {
    clientId: string;
    cellId: string | null;
    email: string;
    displayName: string;
    passwordHash: string;
    actor: string;
  }): Promise<{ userId: string }> {
    const now = new Date();
    const normEmail = params.email.trim().toLowerCase();
    const identityLocation = params.cellId ?? "router";

    const [inserted] = await this.portalDb
      .insert(users)
      .values({
        email: normEmail,
        emailVerifiedAt: now,
        passwordHash: identityLocation === "router" ? params.passwordHash : null,
        passwordUpdatedAt: identityLocation === "router" ? now : null,
        identityLocation,
        activeClientId: params.clientId,
        status: "active",
        displayName: params.displayName,
        createdBy: params.actor,
        updatedBy: params.actor,
      })
      .returning({ id: users.id });

    await this.cellTxRunner(params.clientId, async (tx) => {
      await tx
        .insert(cellUsers)
        .values({
          id: inserted.id,
          clientId: params.clientId,
          email: normEmail,
          emailVerifiedAt: now,
          passwordHash: params.passwordHash,
          passwordUpdatedAt: now,
          status: "active",
          displayName: params.displayName,
          createdBy: params.actor,
          updatedBy: params.actor,
        })
        .onConflictDoUpdate({
          target: [cellUsers.clientId, cellUsers.id],
          set: {
            email: normEmail,
            emailVerifiedAt: now,
            passwordHash: params.passwordHash,
            passwordUpdatedAt: now,
            status: "active",
            displayName: params.displayName,
            updatedAt: now,
            updatedBy: params.actor,
          },
        });
    });

    return { userId: inserted.id };
  }

  async linkExistingUserToCell(params: {
    userId: string;
    clientId: string;
    cellId: string | null;
    email: string;
    displayName: string;
    passwordHash: string | null;
    wasRouterIdentity: boolean;
    actor: string;
  }): Promise<void> {
    const now = new Date();
    const normEmail = params.email.trim().toLowerCase();

    await this.cellTxRunner(params.clientId, async (tx) => {
      await tx
        .insert(cellUsers)
        .values({
          id: params.userId,
          clientId: params.clientId,
          email: normEmail,
          emailVerifiedAt: now,
          passwordHash: params.passwordHash,
          passwordUpdatedAt: params.passwordHash ? now : null,
          status: "active",
          displayName: params.displayName,
          createdBy: params.actor,
          updatedBy: params.actor,
        })
        .onConflictDoUpdate({
          target: [cellUsers.clientId, cellUsers.id],
          set: {
            email: normEmail,
            emailVerifiedAt: now,
            ...(params.passwordHash
              ? {
                  passwordHash: params.passwordHash,
                  passwordUpdatedAt: now,
                }
              : {}),
            status: "active",
            displayName: params.displayName,
            updatedAt: now,
            updatedBy: params.actor,
          },
        });
    });

    await this.portalDb
      .update(users)
      .set({
        activeClientId: params.clientId,
        displayName: params.displayName,
        emailVerifiedAt: sql`COALESCE(${users.emailVerifiedAt}, ${now})`,
        ...(params.cellId
          ? {
              identityLocation: params.cellId,
              ...(params.wasRouterIdentity ? { passwordHash: null, passwordUpdatedAt: null } : {}),
            }
          : {}),
        updatedAt: now,
        updatedBy: params.actor,
      })
      .where(eq(users.id, params.userId));
  }

  async revokeUserPortalSessions(userId: string, reason: string): Promise<void> {
    await authService.revokeUserSessions(userId, reason);
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
  // GESTIÓN DE USUARIOS DEL INQUILINO E INVITACIONES CON CUOTAS (`SPEC-12`)
  // =========================================================================

  /**
   * Evalúa cuotas combinadas de `tenant_users` y (opcionalmente) `chatwoot_agents` dentro del lock del comercio.
   */
  private async validateTeamAndChatwootQuotas(
    clientId: string,
    options: { requireTenantSeat: boolean; requireChatwootSeat: boolean },
  ): Promise<Result<true>> {
    const counts = await this.repository.countTenantUsers(clientId);

    if (options.requireTenantSeat) {
      const userQuota = await this.repository.getPlanQuota(clientId, "tenant_users");
      const totalOccupied = counts.activeUsers + counts.pendingInvitations;
      if (userQuota.mode === "LIMITED") {
        if (userQuota.value === null || userQuota.value === 0 || totalOccupied + 1 > userQuota.value) {
          return err(
            "Has alcanzado el límite de usuarios por inquilino incluido en tu plan.",
            "QUOTA_EXCEEDED",
          );
        }
      }
    }

    if (options.requireChatwootSeat) {
      const cwQuota = await this.repository.getPlanQuota(clientId, "chatwoot_agents");
      const cwOccupied =
        (counts.activeChatwootAgents ?? 0) + (counts.pendingChatwootInvitations ?? 0);
      if (cwQuota.mode === "LIMITED") {
        if (cwQuota.value === null || cwQuota.value === 0 || cwOccupied + 1 > cwQuota.value) {
          return err(
            "Has alcanzado el límite de agentes de atención en Chatwoot incluido en tu plan.",
            "CHATWOOT_AGENTS_QUOTA_EXCEEDED",
          );
        }
      }
    }

    return ok(true);
  }

  /**
   * Enmascara parcialmente un correo electrónico para mostrar pista segura en la vista pública de invitación.
   */
  private maskEmailHint(email: string): string {
    const [local = "", domain = ""] = email.split("@");
    if (!domain) return email;
    const prefix = local.slice(0, 2);
    return `${prefix}${local.length > 2 ? "***" : "*"}@${domain}`;
  }

  /**
   * Verifica exclusividad `1:0..1` y estado de invitaciones previas antes de emitir o reenviar (`SPEC-12`).
   */
  private async ensureEmailEligibleForTenantInvite(
    clientId: string,
    normalizedEmail: string,
    actor: string,
    options?: { ignoreInvitationId?: string },
  ): Promise<Result<true>> {
    const existingGlobal = await this.repository.findGlobalUserByEmail?.(normalizedEmail);
    if (existingGlobal) {
      if (existingGlobal.hasPlatformRole) {
        return err(
          "Este correo pertenece a una cuenta administrativa de plataforma y no puede invitarse.",
          "EMAIL_BELONGS_TO_ANOTHER_TENANT",
        );
      }
      if (existingGlobal.activeClientId === clientId) {
        return err(
          "Este correo ya pertenece a un miembro de tu equipo.",
          "ALREADY_TEAM_MEMBER",
        );
      }
      if (existingGlobal.activeClientId !== null) {
        return err(
          "Este correo ya pertenece como miembro activo a otro comercio.",
          "EMAIL_BELONGS_TO_ANOTHER_TENANT",
        );
      }
    }

    const currentMembers = await this.repository.listTenantMembers(clientId, {
      includeSuspended: true,
    });
    if (
      currentMembers.some(
        (m) => m.email?.trim().toLowerCase() === normalizedEmail && m.status !== "left",
      )
    ) {
      return err(
        "Este correo ya pertenece a un miembro de tu equipo.",
        "ALREADY_TEAM_MEMBER",
      );
    }

    const pendingList =
      (await this.repository.findPendingInvitationsByEmail?.(normalizedEmail)) ?? [];
    const nowMs = Date.now();
    for (const inv of pendingList) {
      if (options?.ignoreInvitationId && inv.id === options.ignoreInvitationId) {
        continue;
      }
      const isExpired = inv.expiresAt.getTime() <= nowMs;
      if (inv.clientId !== clientId) {
        if (!isExpired) {
          return err(
            "Este correo tiene una invitación vigente en otro comercio.",
            "EMAIL_BELONGS_TO_ANOTHER_TENANT",
          );
        }
        continue;
      }
      if (!isExpired) {
        return err(
          "Ya existe una invitación pendiente vigente para este correo. Puedes reenviarla desde la pestaña de invitaciones.",
          "INVITATION_ALREADY_PENDING",
        );
      }
      await this.repository.markInvitationExpired?.(inv.id, actor);
    }

    return ok(true);
  }

  /**
   * Lista paginada/filtrable de miembros (`active`/`suspended`) e invitaciones + cuotas reales (`SPEC-12` + `SPEC-17`).
   */
  async listTeamAndInvitations(
    clientId: string,
    options?: {
      viewerRole?: string;
      q?: string;
      status?: "all" | "active" | "suspended";
      page?: number;
      limit?: number;
      sortBy?: "joined_at" | "display_name" | "email" | "status";
      sortDir?: "asc" | "desc";
    },
  ): Promise<TeamListResultDto> {
    const isOwnerViewer = options?.viewerRole !== "tenant_agent";
    const [rawMembers, rawInvitations, userQuota, cwQuota, counts] = await Promise.all([
      this.repository.listTenantMembers(clientId, {
        includeSuspended: isOwnerViewer,
      }),
      isOwnerViewer ? this.repository.listInvitations(clientId) : Promise.resolve([]),
      this.repository.getPlanQuota(clientId, "tenant_users"),
      this.repository.getPlanQuota(clientId, "chatwoot_agents"),
      this.repository.countTenantUsers(clientId),
    ]);

    const q = options?.q?.trim().toLowerCase() ?? "";
    const statusFilter = options?.status ?? "all";

    const mappedMembers: TeamMemberProfileDto[] = rawMembers
      .filter((m) => {
        if (!isOwnerViewer && m.status !== "active") return false;
        if (statusFilter !== "all" && m.status !== statusFilter) return false;
        if (q) {
          const hayName = (m.displayName ?? "").toLowerCase().includes(q);
          const hayEmail = (m.email ?? "").toLowerCase().includes(q);
          if (!hayName && !hayEmail) return false;
        }
        return true;
      })
      .map((m) => ({
        id: m.id,
        userId: m.userId,
        email: isOwnerViewer ? m.email || "" : m.email || "",
        displayName: m.displayName ?? null,
        role: m.role,
        status: m.status,
        grantChatwootAccess: Boolean(m.grantChatwootAccess),
        chatwootAgentId: isOwnerViewer ? (m.chatwootAgentId ?? null) : null,
        joinedAt: m.joinedAt.toISOString(),
        lastAccessAt: m.lastAccessAt ? m.lastAccessAt.toISOString() : null,
      }));

    const sortBy = options?.sortBy ?? "joined_at";
    const sortDir = options?.sortDir === "asc" ? 1 : -1;
    mappedMembers.sort((a, b) => {
      if (a.role === "tenant_owner" && b.role !== "tenant_owner") return -1;
      if (b.role === "tenant_owner" && a.role !== "tenant_owner") return 1;
      let cmp = 0;
      if (sortBy === "display_name") {
        cmp = (a.displayName ?? a.email).localeCompare(b.displayName ?? b.email);
      } else if (sortBy === "email") {
        cmp = a.email.localeCompare(b.email);
      } else if (sortBy === "status") {
        cmp = a.status.localeCompare(b.status);
      } else {
        cmp = new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
      }
      return cmp * sortDir;
    });

    const page = Math.max(1, options?.page ?? 1);
    const limit = Math.min(50, Math.max(1, options?.limit ?? 20));
    const total = mappedMembers.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const pagedMembers = mappedMembers.slice((page - 1) * limit, page * limit);

    const nowMs = Date.now();
    const invitations: TeamInvitationViewDto[] = isOwnerViewer
      ? rawInvitations
          .filter((inv) => inv.status === "pending" || inv.status === "expired")
          .filter((inv) => {
            if (!q) return true;
            return (
              inv.email.toLowerCase().includes(q) ||
              (inv.displayName ?? "").toLowerCase().includes(q)
            );
          })
          .map((inv) => {
            const effectiveStatus =
              inv.status === "pending" && inv.expiresAt.getTime() <= nowMs
                ? "expired"
                : inv.status;
            return {
              id: inv.id,
              email: inv.email,
              displayName: inv.displayName ?? null,
              role: "tenant_agent" as const,
              grantChatwootAccess: Boolean(inv.grantChatwootAccess),
              status: effectiveStatus,
              expiresAt: inv.expiresAt.toISOString(),
              createdAt: (inv.createdAt ?? new Date()).toISOString(),
            };
          })
      : [];

    return {
      members: pagedMembers,
      pagination: { page, limit, total, totalPages },
      invitations,
      quota: {
        tenantUsers: {
          usedActive: counts.activeUsers,
          pendingInvitations: counts.pendingInvitations,
          totalConsumed: counts.activeUsers + counts.pendingInvitations,
          limit: userQuota.value,
          mode: userQuota.mode,
        },
        chatwootAgents: {
          usedActive: counts.activeChatwootAgents ?? 0,
          pendingInvitations: counts.pendingChatwootInvitations ?? 0,
          totalConsumed:
            (counts.activeChatwootAgents ?? 0) + (counts.pendingChatwootInvitations ?? 0),
          limit: cwQuota.value,
          mode: cwQuota.mode,
        },
      },
    };
  }

  /**
   * Encola el correo de invitación `team.member_invited` vía `SPEC-14` de manera no bloqueante.
   */
  async dispatchInvitationEmail(params: {
    clientId: string;
    invitationId: string;
    recipientEmail: string;
    inviteeName?: string | null;
    inviterName: string;
    rawToken: string;
    baseUrl: string;
  }): Promise<void> {
    try {
      const clientMeta = await this.repository.getClientSummary?.(params.clientId);
      const tenantName = clientMeta?.displayName || "Tu Comercio Mocter";
      const locale = clientMeta?.locale === "en" ? "en" : "es";
      const cleanBase = params.baseUrl.replace(/\/+$/, "");
      const inviteUrl = `${cleanBase}/invite/${params.rawToken}`;

      const inviteeLabel =
        params.inviteeName?.trim() || params.recipientEmail.split("@")[0] || "Colaborador";
      const dispatcher = getNotificationDispatcherService();
      const res = await dispatcher.dispatchTenantNotification({
        clientId: params.clientId,
        eventKey: "team.member_invited",
        recipientOverride: params.recipientEmail,
        locale,
        variables: {
          tenant_name: tenantName,
          inviter_name: params.inviterName || tenantName,
          invitee_name: inviteeLabel,
          invite_url: inviteUrl,
          expires_hours: 72,
        },
        idempotencyKey: `team-invite:${params.invitationId}:${createHash("sha256").update(params.rawToken).digest("hex").slice(0, 12)}`,
        inAppPayload: {
          title:
            locale === "en"
              ? `Team invitation sent to ${inviteeLabel}`
              : `Invitación de equipo enviada a ${inviteeLabel}`,
          body:
            locale === "en"
              ? `${params.inviterName || tenantName} invited ${params.recipientEmail} to join the team.`
              : `${params.inviterName || tenantName} invitó a ${params.recipientEmail} a unirse al equipo.`,
          severity: "info",
          actionUrl: "/workspace/team",
        },
      });

      if (!res.ok) {
        appLogger.warn("[TeamInviteEmail] No se pudo despachar correo de invitación", {
          clientId: params.clientId,
          invitationId: params.invitationId,
          code: res.code,
          error: res.error,
        });
      }
    } catch (error) {
      appLogger.warn("[TeamInviteEmail] Fallo no bloqueante al despachar invitación", {
        clientId: params.clientId,
        invitationId: params.invitationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Emite una invitación para unirse al inquilino validando cuotas `tenant_users` y `chatwoot_agents` (`SPEC-12`).
   */
  async issueInvitation(
    clientId: string,
    input: TenantInvitationInput,
    actor: string,
  ): Promise<Result<{ invitation: TenantInvitationRecord; rawToken: string }>> {
    const normalizedEmail = input.email.trim().toLowerCase();
    if (!normalizedEmail || !EMAIL_VALIDATION_REGEX.test(normalizedEmail)) {
      return err("El correo electrónico de la invitación no es válido.", "VALIDATION_ERROR");
    }

    if (input.role && input.role !== "tenant_agent") {
      return err("Solo es posible invitar usuarios con el rol 'tenant_agent'.", "INVALID_ROLE");
    }

    const grantChatwootAccess = input.grantChatwootAccess ?? true;

    return await this.withTenantLock(clientId, async () => {
      const eligibility = await this.ensureEmailEligibleForTenantInvite(
        clientId,
        normalizedEmail,
        actor,
      );
      if (!eligibility.ok) {
        return eligibility;
      }

      const quotaCheck = await this.validateTeamAndChatwootQuotas(clientId, {
        requireTenantSeat: true,
        requireChatwootSeat: grantChatwootAccess,
      });
      if (!quotaCheck.ok) {
        return quotaCheck;
      }

      const rawToken = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(rawToken).digest();
      const ttlMs = input.ttlMs ?? DEFAULT_TEAM_INVITATION_TTL_MS;
      const expiresAt = new Date(Date.now() + ttlMs);

      const invitation = await this.repository.createInvitation(
        clientId,
        {
          email: normalizedEmail,
          displayName: input.displayName?.trim() || null,
          role: "tenant_agent",
          grantChatwootAccess,
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
   * Reenvía una invitación vigente o expirada rotando el token SHA-256 y reiniciando su caducidad a 72h (`SPEC-12`).
   */
  async resendInvitation(
    clientId: string,
    invitationId: string,
    actor: string,
  ): Promise<Result<{ invitation: TenantInvitationRecord; rawToken: string }>> {
    return await this.withTenantLock(clientId, async () => {
      const existing = await this.repository.findInvitationById?.(clientId, invitationId);
      if (!existing) {
        return err("Invitación no encontrada.", "NOT_FOUND");
      }

      if (existing.status === "accepted" || existing.status === "revoked") {
        return err(
          "Solo se pueden reenviar invitaciones pendientes o expiradas.",
          "INVITATION_NOT_RESENDABLE",
        );
      }

      const wasExpired =
        existing.status === "expired" || existing.expiresAt.getTime() <= Date.now();

      const eligibility = await this.ensureEmailEligibleForTenantInvite(
        clientId,
        existing.email,
        actor,
        { ignoreInvitationId: existing.id },
      );
      if (!eligibility.ok) {
        return eligibility;
      }

      if (wasExpired) {
        const quotaCheck = await this.validateTeamAndChatwootQuotas(clientId, {
          requireTenantSeat: true,
          requireChatwootSeat: existing.grantChatwootAccess,
        });
        if (!quotaCheck.ok) {
          return quotaCheck;
        }
      }

      const rawToken = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(rawToken).digest();
      const expiresAt = new Date(Date.now() + DEFAULT_TEAM_INVITATION_TTL_MS);

      const updated = await this.repository.updateInvitationToken?.({
        clientId,
        invitationId,
        tokenHash,
        expiresAt,
        actor,
      });

      if (!updated) {
        return err("No fue posible actualizar el token de la invitación.", "NOT_FOUND");
      }

      return ok({ invitation: updated, rawToken });
    });
  }

  /**
   * Revoca una invitación pendiente o expirada liberando inmediatamente el cupo reservado (`SPEC-12`).
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
   * Consulta los metadatos públicos no sensibles de una invitación por token para `/invite/[token]` (`SPEC-12`).
   */
  async getInvitationPreview(rawToken: string): Promise<TeamInvitationPublicPreviewDto> {
    const cleanToken = rawToken.trim();
    if (!cleanToken) {
      return { valid: false, reason: "invalid" };
    }

    const tokenHash = createHash("sha256").update(cleanToken).digest();
    const invitation = await this.repository.findInvitationByTokenHash(tokenHash);
    if (!invitation) {
      return { valid: false, reason: "invalid" };
    }

    if (invitation.status === "revoked") {
      return { valid: false, reason: "revoked" };
    }
    if (invitation.status === "accepted") {
      return { valid: false, reason: "already_used" };
    }

    const clientMeta = await this.repository.getClientSummary?.(invitation.clientId);
    const isExpired =
      invitation.status === "expired" || invitation.expiresAt.getTime() <= Date.now();
    if (isExpired) {
      return {
        valid: false,
        reason: "expired",
        tenantName: clientMeta?.displayName ?? "Comercio Mocter",
        locale: clientMeta?.locale ?? "es",
        emailHint: this.maskEmailHint(invitation.email),
      };
    }

    const existingGlobal = await this.repository.findGlobalUserByEmail?.(invitation.email);
    const hasActiveMembershipConflict = Boolean(
      existingGlobal &&
        (existingGlobal.hasPlatformRole ||
          (existingGlobal.activeClientId !== null &&
            existingGlobal.activeClientId !== invitation.clientId)),
    );

    return {
      valid: true,
      tenantName: clientMeta?.displayName ?? "Comercio Mocter",
      locale: clientMeta?.locale ?? "es",
      emailHint: this.maskEmailHint(invitation.email),
      displayName: invitation.displayName ?? null,
      role: "tenant_agent",
      grantChatwootAccess: Boolean(invitation.grantChatwootAccess),
      expiresAt: invitation.expiresAt.toISOString(),
      existingAccount: Boolean(existingGlobal),
      hasActiveMembershipConflict,
    };
  }

  /**
   * Aceptación completa de invitación desde `/invite/[token]` con soporte para usuario nuevo o cuenta existente (`SPEC-12`).
   */
  async acceptTeamInvitation(params: {
    rawToken: string;
    displayName?: string;
    password?: string;
    currentPassword?: string;
    authenticatedUserId?: string | null;
    authenticatedUserEmail?: string | null;
    now?: Date;
  }): Promise<
    Result<{
      member: TenantMemberRecord;
      userId: string;
      email: string;
      displayName: string;
      clientId: string;
      grantChatwootAccess: boolean;
    }>
  > {
    const cleanToken = params.rawToken.trim();
    if (!cleanToken) {
      return err(
        "El enlace de invitación es inválido o ha expirado.",
        "INVITATION_TOKEN_INVALID_OR_EXPIRED",
      );
    }

    const tokenHash = createHash("sha256").update(cleanToken).digest();
    const invitation = await this.repository.findInvitationByTokenHash(tokenHash);

    if (!invitation || invitation.status !== "pending") {
      return err(
        "El enlace de invitación es inválido o ya fue utilizado.",
        "INVITATION_TOKEN_INVALID_OR_EXPIRED",
      );
    }

    const now = params.now ?? new Date();
    if (now.getTime() > invitation.expiresAt.getTime()) {
      await this.repository.markInvitationExpired?.(invitation.id, "system");
      return err(
        "La invitación ha expirado. Solicita un reenvío al propietario del comercio.",
        "INVITATION_TOKEN_INVALID_OR_EXPIRED",
      );
    }

    const clientMeta = await this.repository.getClientSummary?.(invitation.clientId);
    const cellId = clientMeta?.cellId ?? null;
    const existingGlobal = await this.repository.findGlobalUserByEmail?.(invitation.email);

    let resolvedUserId: string;
    let resolvedDisplayName: string;

    if (existingGlobal) {
      if (existingGlobal.status === "disabled") {
        return err("Esta cuenta de usuario se encuentra deshabilitada.", "USER_DISABLED");
      }

      if (
        existingGlobal.hasPlatformRole ||
        (existingGlobal.activeClientId !== null &&
          existingGlobal.activeClientId !== invitation.clientId)
      ) {
        return err(
          "El usuario ya posee una membresía activa en otro comercio.",
          "USER_ALREADY_HAS_ACTIVE_MEMBERSHIP",
        );
      }

      // Verificar si ya es miembro activo/suspendido en este comercio
      const currentMembers = await this.repository.listTenantMembers(invitation.clientId, {
        includeSuspended: true,
      });
      if (
        currentMembers.some(
          (m) => m.userId === existingGlobal.id && m.status !== "left",
        )
      ) {
        return err("Este usuario ya hace parte del equipo del comercio.", "ALREADY_TEAM_MEMBER");
      }

      const sessionMatchesEmail =
        Boolean(params.authenticatedUserId) &&
        params.authenticatedUserId === existingGlobal.id &&
        params.authenticatedUserEmail?.trim().toLowerCase() === invitation.email;

      let verifiedHashToCopy: string | null = existingGlobal.passwordHash;
      if (!verifiedHashToCopy && existingGlobal.identityLocation !== "router") {
        verifiedHashToCopy =
          (await this.repository.findCellPasswordHash?.(
            existingGlobal.identityLocation,
            invitation.clientId,
            existingGlobal.id,
          )) ?? null;
      }

      if (!sessionMatchesEmail) {
        if (!params.currentPassword) {
          return err(
            "Este correo ya tiene una cuenta registrada en Mocter. Ingresa tu contraseña actual para confirmar la vinculación.",
            "EXISTING_ACCOUNT_PASSWORD_REQUIRED",
          );
        }
        if (!verifiedHashToCopy) {
          return err(
            "Tu cuenta usa inicio de sesión federado. Inicia sesión primero con tu cuenta antes de aceptar esta invitación.",
            "FEDERATED_SESSION_REQUIRED",
          );
        }
        const validCurrent = await verifyPassword(params.currentPassword, verifiedHashToCopy);
        if (!validCurrent) {
          return err(
            "La contraseña actual ingresada no es correcta.",
            "INVALID_CURRENT_PASSWORD",
          );
        }
      }

      resolvedDisplayName =
        params.displayName?.trim() ||
        existingGlobal.displayName ||
        invitation.displayName ||
        invitation.email.split("@")[0] ||
        "Colaborador";

      await this.repository.linkExistingUserToCell?.({
        userId: existingGlobal.id,
        clientId: invitation.clientId,
        cellId,
        email: invitation.email,
        displayName: resolvedDisplayName,
        passwordHash: verifiedHashToCopy,
        wasRouterIdentity: existingGlobal.identityLocation === "router",
        actor: invitation.email,
      });

      resolvedUserId = existingGlobal.id;
    } else {
      resolvedDisplayName =
        params.displayName?.trim() || invitation.displayName?.trim() || "";
      if (resolvedDisplayName.length < 2) {
        return err(
          "El nombre completo es obligatorio y debe tener al menos 2 caracteres.",
          "VALIDATION_ERROR",
        );
      }

      if (!params.password) {
        return err("Debes definir una contraseña para activar tu acceso.", "VALIDATION_ERROR");
      }

      const pwdCheck = validatePassword(params.password);
      if (!pwdCheck.valid) {
        return err(pwdCheck.errors[0] || "Contraseña demasiado débil.", "VALIDATION_ERROR");
      }

      const passwordHash = await hashPassword(params.password);
      const createdUser = await this.repository.createInvitedGlobalAndCellUser?.({
        clientId: invitation.clientId,
        cellId,
        email: invitation.email,
        displayName: resolvedDisplayName,
        passwordHash,
        actor: invitation.email,
      });

      if (!createdUser) {
        return err("No fue posible aprovisionar la cuenta del colaborador.", "DB_ERROR");
      }

      resolvedUserId = createdUser.userId;
    }

    const accepted = await this.repository.acceptInvitation({
      invitationId: invitation.id,
      userId: resolvedUserId,
      acceptedAt: now,
    });

    if (!accepted) {
      return err(
        "La invitación ya fue utilizada o revocada.",
        "INVITATION_TOKEN_INVALID_OR_EXPIRED",
      );
    }

    const member = await this.repository.createTenantMembership({
      clientId: invitation.clientId,
      userId: resolvedUserId,
      role: "tenant_agent",
      grantChatwootAccess: invitation.grantChatwootAccess,
      invitedBy: invitation.invitedByUserId,
    });

    return ok({
      member,
      userId: resolvedUserId,
      email: invitation.email,
      displayName: resolvedDisplayName,
      clientId: invitation.clientId,
      grantChatwootAccess: Boolean(invitation.grantChatwootAccess),
    });
  }

  /**
   * Acepta una invitación pendiente verificando membresía única `1:0..1` (ADM-001 D-15).
   *
   * Mantiene compatibilidad directa para llamadas internas con `userId` ya resuelto.
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

    const activeClientId = await this.repository.getUserActiveClientId(params.userId);
    if (activeClientId !== null) {
      return err(
        "El usuario ya posee una membresía activa en otro comercio (ADM-001 D-15).",
        "USER_ALREADY_HAS_ACTIVE_MEMBERSHIP",
      );
    }

    await this.repository.acceptInvitation({
      invitationId: invitation.id,
      userId: params.userId,
      acceptedAt: now,
    });

    const member = await this.repository.createTenantMembership({
      clientId: invitation.clientId,
      userId: params.userId,
      role: "tenant_agent",
      grantChatwootAccess: invitation.grantChatwootAccess,
      invitedBy: invitation.invitedByUserId,
    });

    return ok(member);
  }

  /**
   * Actualiza nombre visible y/o acceso a Chatwoot de un colaborador (`SPEC-12`).
   * Protege la invariante de propietario único (`ADM-001 D-31`).
   */
  async updateMemberProfile(
    clientId: string,
    memberId: string,
    updates: {
      displayName?: string;
      role?: "tenant_owner" | "tenant_agent";
      grantChatwootAccess?: boolean;
    },
    actor: string,
  ): Promise<
    Result<{
      member: TenantMemberRecord;
      chatwootAction: "sync" | "remove" | "none";
      previousChatwootAgentId: number | null;
    }>
  > {
    return await this.withTenantLock(clientId, async () => {
      const target =
        (await this.repository.findTenantMemberById?.(clientId, memberId)) ??
        (
          await this.repository.listTenantMembers(clientId, { includeSuspended: true })
        ).find((m) => m.id === memberId) ??
        null;

      if (!target || target.status === "left") {
        return err("Miembro no encontrado.", "NOT_FOUND");
      }

      if (target.role === "tenant_owner") {
        if (updates.role && updates.role !== "tenant_owner") {
          return err(
            "El propietario único del comercio no puede ser degradado de rol.",
            "LAST_OWNER_CANNOT_BE_REMOVED",
          );
        }
        return err(
          "El perfil del propietario titular se gestiona desde Mi Cuenta y no puede modificarse aquí.",
          "OWNER_CANNOT_BE_MODIFIED",
        );
      }

      if (updates.role && updates.role !== "tenant_agent") {
        return err(
          "Solo se permite asignar el rol operativo 'tenant_agent'.",
          "INVALID_ROLE",
        );
      }

      const nextDisplayName =
        updates.displayName !== undefined ? updates.displayName.trim() : undefined;
      if (nextDisplayName !== undefined && nextDisplayName.length < 2) {
        return err(
          "El nombre del colaborador debe tener al menos 2 caracteres.",
          "VALIDATION_ERROR",
        );
      }

      const turningOnChatwoot =
        updates.grantChatwootAccess === true &&
        !target.grantChatwootAccess &&
        target.status === "active";

      if (turningOnChatwoot) {
        const quotaCheck = await this.validateTeamAndChatwootQuotas(clientId, {
          requireTenantSeat: false,
          requireChatwootSeat: true,
        });
        if (!quotaCheck.ok) {
          return quotaCheck;
        }
      }

      const updated = await this.repository.updateTenantMemberProfile?.({
        clientId,
        memberId,
        userId: target.userId,
        displayName: nextDisplayName,
        grantChatwootAccess: updates.grantChatwootAccess,
        actor,
      });

      if (!updated) {
        return err("Miembro no encontrado.", "NOT_FOUND");
      }

      let chatwootAction: "sync" | "remove" | "none" = "none";
      if (updates.grantChatwootAccess === true && !target.grantChatwootAccess && updated.status === "active") {
        chatwootAction = "sync";
      } else if (updates.grantChatwootAccess === false && target.grantChatwootAccess) {
        chatwootAction = "remove";
      }

      return ok({
        member: updated,
        chatwootAction,
        previousChatwootAgentId: target.chatwootAgentId ?? null,
      });
    });
  }

  /**
   * Suspende o reactiva un colaborador (`suspended` ↔ `active`), validando cuota al reactivar
   * y revocando sesiones del portal al suspender (`RN-SPEC-12-01`, `RN-SPEC-12-05`).
   */
  async updateMemberStatus(
    clientId: string,
    memberId: string,
    status: "active" | "suspended",
    actor: string,
  ): Promise<
    Result<{
      member: TenantMemberRecord;
      chatwootAction: "sync" | "remove" | "none";
      previousChatwootAgentId: number | null;
    }>
  > {
    return await this.withTenantLock(clientId, async () => {
      const target =
        (await this.repository.findTenantMemberById?.(clientId, memberId)) ??
        (
          await this.repository.listTenantMembers(clientId, { includeSuspended: true })
        ).find((m) => m.id === memberId) ??
        null;

      if (!target || target.status === "left") {
        return err("Miembro no encontrado.", "NOT_FOUND");
      }

      if (target.role === "tenant_owner") {
        return err(
          "El propietario único del comercio no puede ser suspendido.",
          "LAST_OWNER_CANNOT_BE_REMOVED",
        );
      }

      if (target.status === status) {
        return ok({
          member: target,
          chatwootAction: "none",
          previousChatwootAgentId: target.chatwootAgentId ?? null,
        });
      }

      if (status === "active" && target.status === "suspended") {
        const quotaCheck = await this.validateTeamAndChatwootQuotas(clientId, {
          requireTenantSeat: true,
          requireChatwootSeat: Boolean(target.grantChatwootAccess),
        });
        if (!quotaCheck.ok) {
          return quotaCheck;
        }
      }

      const updated = await this.repository.updateTenantMemberStatus?.({
        clientId,
        memberId,
        userId: target.userId,
        status,
        actor,
      });

      if (!updated) {
        return err("Miembro no encontrado.", "NOT_FOUND");
      }

      if (status === "suspended") {
        await this.repository.revokeUserPortalSessions?.(
          target.userId,
          "tenant_member_suspended",
        );
      }

      let chatwootAction: "sync" | "remove" | "none" = "none";
      if (status === "suspended") {
        chatwootAction = "remove";
      } else if (status === "active" && updated.grantChatwootAccess) {
        chatwootAction = "sync";
      }

      return ok({
        member: updated,
        chatwootAction,
        previousChatwootAgentId: target.chatwootAgentId ?? null,
      });
    });
  }

  /**
   * Retira definitivamente a un colaborador (`status = 'left'`), revoca sesiones activas
   * y retorna metadatos para desacoplar su agente en Chatwoot (`SPEC-12`).
   */
  async retireMember(
    clientId: string,
    memberId: string,
    actor: string,
  ): Promise<
    Result<{
      removed: boolean;
      userId: string;
      chatwootAgentId: number | null;
    }>
  > {
    const members = await this.repository.listTenantMembers(clientId, {
      includeSuspended: true,
    });
    const target = members.find((m) => m.id === memberId);

    if (!target) {
      return err("Miembro no encontrado.", "NOT_FOUND");
    }

    if (target.role === "tenant_owner") {
      return err(
        "El dueño del comercio (tenant_owner) no puede ser removido.",
        "CANNOT_REMOVE_OWNER",
      );
    }

    const removed = await this.repository.removeTenantMember(clientId, memberId, actor);
    if (!removed) {
      return err("Miembro no encontrado.", "NOT_FOUND");
    }

    await this.repository.revokeUserPortalSessions?.(target.userId, "tenant_member_left");

    return ok({
      removed: true,
      userId: target.userId,
      chatwootAgentId: target.chatwootAgentId ?? null,
    });
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
    const res = await this.retireMember(clientId, memberId, actor);
    if (!res.ok) return res;
    return ok(res.data.removed);
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

let defaultTenantContactsAndUsersService: TenantContactsAndUsersService | null = null;

/**
 * Retorna la instancia singleton de {@link TenantContactsAndUsersService} respaldada por PostgreSQL y celdas.
 */
export function getTenantContactsAndUsersService(): TenantContactsAndUsersService {
  if (!defaultTenantContactsAndUsersService) {
    defaultTenantContactsAndUsersService = new TenantContactsAndUsersService(
      new DrizzleTenantContactsAndUsersRepository(),
    );
  }
  return defaultTenantContactsAndUsersService;
}
