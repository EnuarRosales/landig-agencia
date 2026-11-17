import { createHash, randomBytes } from "node:crypto";
import { and, count, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { clients } from "../db/schemas/admin/clients";
import { plans } from "../db/schemas/admin/plans";
import { users } from "../db/schemas/admin/users";
import {
  clientSharingProfiles,
  communityLeaderAuthorizations,
  feedPosts,
  organizationInvitations,
  organizationJoinRequests,
  organizationMembers,
  organizationPromotions,
  organizations,
  productShares,
  type CommunityLeaderAuthorization,
  type Organization,
  type OrganizationMember,
} from "../db/schemas/admin/communities-and-cloning";
import { ok, err, type Result } from "../types/result";
import { appLogger } from "../utils/logger";
import { getNotificationDispatcherService } from "./notification-dispatcher.service";

export type CommunityVisibility = "private_invite" | "request_to_join";
export type CommunitySharePolicy = "leaders_only" | "collaborative";
export type CommunityModerationMode = "pre" | "post" | "none";
export type CommunityOrganizationStatus = "active" | "suspended";
export type CommunityMemberRole = "originator" | "co_leader" | "member";
export type LeaderAuthorizationStatus = "none" | "pending" | "approved" | "rejected" | "revoked";

export interface LeaderAuthorizationStatusDto {
  status: LeaderAuthorizationStatus;
  maxOwnedCommunities: number | null;
  ownedCommunitiesCount: number;
  canCreateMoreCommunities: boolean;
  proposedCommunityName: string | null;
  businessModel: string | null;
  reviewNotes: string | null;
  requestedAt: string | null;
  reviewedAt: string | null;
}

export interface CommunityMemberDto {
  id: string;
  clientId: string;
  displayName: string;
  slug: string;
  role: CommunityMemberRole;
  status: string;
  joinedAt: string;
  contactEmail?: string;
  phone?: string;
}

export interface CommunityJoinRequestDto {
  id: string;
  organizationId: string;
  clientId: string;
  clientName: string;
  clientSlug: string;
  status: string;
  createdAt: string;
}

export interface CommunityInvitationDto {
  id: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: "member" | "co_leader";
  email: string;
  targetClientId: string | null;
  inviterName: string;
  status: string;
  expiresAt: string;
  createdAt: string;
}

export interface CommunityPromotionDto {
  id: string;
  organizationId: string;
  organizationName: string;
  targetClientId: string;
  targetClientName: string;
  promotedByClientId: string;
  status: string;
  createdAt: string;
}

export interface CommunityDirectoryItemDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string | null;
  originatorClientId: string;
  originatorName: string;
  sharePolicy: CommunitySharePolicy;
  moderationMode: CommunityModerationMode;
  membersCount: number;
  sharesCount: number;
  myRequestStatus: "none" | "pending" | "rejected";
}

export interface TenantCommunityDetailDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string | null;
  visibility: CommunityVisibility;
  sharePolicy: CommunitySharePolicy;
  requireShareApproval: boolean;
  moderationMode: CommunityModerationMode;
  inviteCode: string;
  status: CommunityOrganizationStatus;
  originatorClientId: string;
  originatorName: string;
  myRole: CommunityMemberRole;
  membersCount: number;
  sharesCount: number;
  pendingRequestsCount: number;
  pendingSharesCount: number;
  pendingPostsCount: number;
  joinedAt: string;
  members: CommunityMemberDto[];
  joinRequests: CommunityJoinRequestDto[];
  invitations: CommunityInvitationDto[];
  promotions: CommunityPromotionDto[];
}

export interface TenantCommunitiesOverviewDto {
  leaderAuthorization: LeaderAuthorizationStatusDto;
  myCommunities: TenantCommunityDetailDto[];
  directoryCommunities: CommunityDirectoryItemDto[];
  pendingInvitations: CommunityInvitationDto[];
  pendingPromotions: CommunityPromotionDto[];
}

export interface AdminLeaderAuthorizationItemDto {
  id: string;
  clientId: string;
  clientName: string;
  clientSlug: string;
  contactEmail: string;
  planName: string;
  status: "pending" | "approved" | "rejected" | "revoked";
  maxOwnedCommunities: number | null;
  ownedCommunitiesCount: number;
  proposedCommunityName: string | null;
  businessModel: string | null;
  reviewNotes: string | null;
  requestedAt: string;
  reviewedAt: string | null;
}

export interface AdminOrganizationSummaryDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string | null;
  originatorClientId: string;
  originatorName: string;
  visibility: CommunityVisibility;
  sharePolicy: CommunitySharePolicy;
  moderationMode: CommunityModerationMode;
  status: CommunityOrganizationStatus;
  membersCount: number;
  sharesCount: number;
  createdAt: string;
}

export interface AdminCommunitiesOverviewDto {
  authorizations: AdminLeaderAuthorizationItemDto[];
  organizations: AdminOrganizationSummaryDto[];
  tenants: Array<{
    id: string;
    displayName: string;
    slug: string;
    contactEmail: string;
    planName: string;
    leaderStatus: LeaderAuthorizationStatus;
  }>;
}

/**
 * Contrato de persistencia para gobernanza de comunidades (`ADM-001 T-19/T-20`, `SPEC-15`).
 */
export interface ICommunitiesGovernanceRepository {
  readonly supportsMultiCommunity?: boolean;
  findActiveMembership(clientId: string): Promise<OrganizationMember | null>;
  findOrganizationById(orgId: string): Promise<Organization | null>;
  createOrganization(data: {
    originatorClientId: string;
    name: string;
    slug?: string;
    description?: string | null;
    category?: string | null;
    visibility?: CommunityVisibility;
    sharePolicy?: CommunitySharePolicy;
    requireShareApproval?: boolean;
    moderationMode: CommunityModerationMode;
    inviteCode?: string;
    createdByUserId: string;
  }): Promise<{ org: Organization; member: OrganizationMember }>;
  createJoinRequest(data: {
    organizationId: string;
    clientId: string;
    requestedByUserId: string;
  }): Promise<{ id: string; status: string }>;
  findJoinRequestById(requestId: string): Promise<{
    id: string;
    organizationId: string;
    clientId: string;
    status: string;
  } | null>;
  updateJoinRequestStatus(
    requestId: string,
    status: "accepted" | "rejected",
    decidedByUserId: string,
  ): Promise<void>;
  addMember(data: {
    organizationId: string;
    clientId: string;
    role: CommunityMemberRole;
    createdByUserId: string;
  }): Promise<OrganizationMember>;
  createPromotion(data: {
    organizationId: string;
    targetClientId: string;
    promotedByClientId: string;
    createdByUserId: string;
  }): Promise<{ id: string; status: string }>;
  findPromotionById(promotionId: string): Promise<{
    id: string;
    organizationId: string;
    targetClientId: string;
    status: string;
  } | null>;
  updatePromotionStatus(
    promotionId: string,
    status: "accepted" | "rejected",
    acceptedByUserId: string,
  ): Promise<void>;
  updateMemberRole(
    organizationId: string,
    clientId: string,
    role: "co_leader" | "member",
  ): Promise<void>;
  setMemberLeft(organizationId: string, clientId: string): Promise<void>;

  // Extensiones SPEC-15
  findMembershipInOrg?(organizationId: string, clientId: string): Promise<OrganizationMember | null>;
  getLeaderAuthorization?(clientId: string): Promise<CommunityLeaderAuthorization | null>;
  countOwnedOrganizations?(clientId: string): Promise<number>;
  upsertLeaderRequest?(data: {
    clientId: string;
    proposedCommunityName: string;
    businessModel: string;
    requestedByUserId: string;
  }): Promise<CommunityLeaderAuthorization>;
  upsertLeaderDecision?(data: {
    clientId: string;
    status: "approved" | "rejected" | "revoked";
    maxOwnedCommunities: number | null;
    reviewNotes: string | null;
    reviewedByUserId: string;
  }): Promise<CommunityLeaderAuthorization>;
  updateOrganizationSettings?(
    organizationId: string,
    updates: Partial<{
      name: string;
      description: string | null;
      category: string | null;
      visibility: CommunityVisibility;
      sharePolicy: CommunitySharePolicy;
      requireShareApproval: boolean;
      moderationMode: CommunityModerationMode;
      inviteCode: string;
      status: CommunityOrganizationStatus;
    }>,
    actorUserId: string,
  ): Promise<Organization | null>;
  findOrganizationBySlug?(slug: string): Promise<Organization | null>;
  findOrganizationByInviteCode?(inviteCode: string): Promise<Organization | null>;
  findClientBySlugOrEmail?(slugOrEmail: string): Promise<{
    id: string;
    displayName: string;
    slug: string;
    contactEmail: string;
  } | null>;
  createInvitation?(data: {
    organizationId: string;
    email: string;
    targetClientId: string | null;
    role: "member" | "co_leader";
    invitedByUserId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<{ id: string; status: string }>;
  findInvitationById?(invitationId: string): Promise<{
    id: string;
    organizationId: string;
    email: string;
    targetClientId: string | null;
    role: "member" | "co_leader";
    status: string;
    expiresAt: Date;
  } | null>;
  updateInvitationStatus?(
    invitationId: string,
    status: "accepted" | "rejected" | "revoked" | "expired",
    actorUserId: string,
  ): Promise<void>;
  setMemberSuspended?(organizationId: string, clientId: string, actorUserId: string): Promise<void>;
  getClientBasicInfo?(clientId: string): Promise<{
    id: string;
    displayName: string;
    slug: string;
    contactEmail: string;
  } | null>;
  getTenantCommunitiesOverviewData?(clientId: string): Promise<TenantCommunitiesOverviewDto>;
  getAdminCommunitiesOverviewData?(): Promise<AdminCommunitiesOverviewDto>;
}

function slugifyCommunityName(raw: string): string {
  const cleaned = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return cleaned || "comunidad";
}

function generateInviteCode(): string {
  const random = randomBytes(4).toString("hex").toUpperCase();
  return `MCT-${random}`;
}

/**
 * Implementación Drizzle ORM sobre PostgreSQL (`Router Global`) para gobernanza multi-comunidad (`SPEC-15`).
 */
export class DrizzleCommunitiesGovernanceRepository implements ICommunitiesGovernanceRepository {
  public readonly supportsMultiCommunity = true;

  constructor(private readonly dbProvider: () => any = () => getDb()) {}

  async findActiveMembership(clientId: string): Promise<OrganizationMember | null> {
    const db = this.dbProvider();
    const [row] = await db
      .select()
      .from(organizationMembers)
      .where(
        and(eq(organizationMembers.clientId, clientId), eq(organizationMembers.status, "active")),
      )
      .orderBy(desc(organizationMembers.joinedAt))
      .limit(1);
    return row ?? null;
  }

  async findMembershipInOrg(
    organizationId: string,
    clientId: string,
  ): Promise<OrganizationMember | null> {
    const db = this.dbProvider();
    const [row] = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.clientId, clientId),
          eq(organizationMembers.status, "active"),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async findOrganizationById(orgId: string): Promise<Organization | null> {
    const db = this.dbProvider();
    const [row] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    return row ?? null;
  }

  async findOrganizationBySlug(slug: string): Promise<Organization | null> {
    const db = this.dbProvider();
    const [row] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, slug.trim().toLowerCase()))
      .limit(1);
    return row ?? null;
  }

  async findOrganizationByInviteCode(inviteCode: string): Promise<Organization | null> {
    const db = this.dbProvider();
    const [row] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.inviteCode, inviteCode.trim().toUpperCase()))
      .limit(1);
    return row ?? null;
  }

  async getLeaderAuthorization(clientId: string): Promise<CommunityLeaderAuthorization | null> {
    const db = this.dbProvider();
    const [row] = await db
      .select()
      .from(communityLeaderAuthorizations)
      .where(eq(communityLeaderAuthorizations.clientId, clientId))
      .limit(1);
    return row ?? null;
  }

  async countOwnedOrganizations(clientId: string): Promise<number> {
    const db = this.dbProvider();
    const [row] = await db
      .select({ total: count() })
      .from(organizations)
      .where(eq(organizations.originatorClientId, clientId));
    return Number(row?.total ?? 0);
  }

  async upsertLeaderRequest(data: {
    clientId: string;
    proposedCommunityName: string;
    businessModel: string;
    requestedByUserId: string;
  }): Promise<CommunityLeaderAuthorization> {
    const db = this.dbProvider();
    const now = new Date();
    const [row] = await db
      .insert(communityLeaderAuthorizations)
      .values({
        clientId: data.clientId,
        status: "pending",
        maxOwnedCommunities: null,
        proposedCommunityName: data.proposedCommunityName,
        businessModel: data.businessModel,
        reviewNotes: null,
        requestedByUserId: data.requestedByUserId,
        requestedAt: now,
        reviewedByUserId: null,
        reviewedAt: null,
        createdBy: data.requestedByUserId,
        updatedBy: data.requestedByUserId,
      })
      .onConflictDoUpdate({
        target: [communityLeaderAuthorizations.clientId],
        set: {
          status: "pending",
          proposedCommunityName: data.proposedCommunityName,
          businessModel: data.businessModel,
          reviewNotes: null,
          requestedByUserId: data.requestedByUserId,
          requestedAt: now,
          reviewedByUserId: null,
          reviewedAt: null,
          updatedAt: now,
          updatedBy: data.requestedByUserId,
        },
      })
      .returning();
    return row;
  }

  async upsertLeaderDecision(data: {
    clientId: string;
    status: "approved" | "rejected" | "revoked";
    maxOwnedCommunities: number | null;
    reviewNotes: string | null;
    reviewedByUserId: string;
  }): Promise<CommunityLeaderAuthorization> {
    const db = this.dbProvider();
    const now = new Date();
    const [row] = await db
      .insert(communityLeaderAuthorizations)
      .values({
        clientId: data.clientId,
        status: data.status,
        maxOwnedCommunities: data.status === "approved" ? data.maxOwnedCommunities : null,
        reviewNotes: data.reviewNotes,
        requestedAt: now,
        reviewedByUserId: data.reviewedByUserId,
        reviewedAt: now,
        createdBy: data.reviewedByUserId,
        updatedBy: data.reviewedByUserId,
      })
      .onConflictDoUpdate({
        target: [communityLeaderAuthorizations.clientId],
        set: {
          status: data.status,
          maxOwnedCommunities: data.status === "approved" ? data.maxOwnedCommunities : null,
          reviewNotes: data.reviewNotes,
          reviewedByUserId: data.reviewedByUserId,
          reviewedAt: now,
          updatedAt: now,
          updatedBy: data.reviewedByUserId,
        },
      })
      .returning();
    return row;
  }

  async createOrganization(data: {
    originatorClientId: string;
    name: string;
    slug?: string;
    description?: string | null;
    category?: string | null;
    visibility?: CommunityVisibility;
    sharePolicy?: CommunitySharePolicy;
    requireShareApproval?: boolean;
    moderationMode: CommunityModerationMode;
    inviteCode?: string;
    createdByUserId: string;
  }): Promise<{ org: Organization; member: OrganizationMember }> {
    const db = this.dbProvider();
    const baseSlug = slugifyCommunityName(data.slug || data.name);
    let finalSlug = baseSlug;
    const existingSlug = await this.findOrganizationBySlug(finalSlug);
    if (existingSlug) {
      finalSlug = `${baseSlug}-${randomBytes(2).toString("hex")}`;
    }
    const finalInviteCode = data.inviteCode || generateInviteCode();

    return db.transaction(async (tx: any) => {
      const [org] = await tx
        .insert(organizations)
        .values({
          originatorClientId: data.originatorClientId,
          name: data.name.trim(),
          slug: finalSlug,
          description: data.description?.trim() || null,
          category: data.category?.trim() || null,
          visibility: data.visibility ?? "private_invite",
          sharePolicy: data.sharePolicy ?? "leaders_only",
          requireShareApproval: data.requireShareApproval ?? true,
          moderationMode: data.moderationMode ?? "pre",
          inviteCode: finalInviteCode,
          status: "active",
          createdBy: data.createdByUserId,
          updatedBy: data.createdByUserId,
        })
        .returning();

      const [member] = await tx
        .insert(organizationMembers)
        .values({
          organizationId: org.id,
          clientId: data.originatorClientId,
          role: "originator",
          status: "active",
          createdBy: data.createdByUserId,
          updatedBy: data.createdByUserId,
        })
        .returning();

      return { org, member };
    });
  }

  async updateOrganizationSettings(
    organizationId: string,
    updates: Partial<{
      name: string;
      description: string | null;
      category: string | null;
      visibility: CommunityVisibility;
      sharePolicy: CommunitySharePolicy;
      requireShareApproval: boolean;
      moderationMode: CommunityModerationMode;
      inviteCode: string;
      status: CommunityOrganizationStatus;
    }>,
    actorUserId: string,
  ): Promise<Organization | null> {
    const db = this.dbProvider();
    const [updated] = await db
      .update(organizations)
      .set({
        ...(updates.name !== undefined ? { name: updates.name.trim() } : {}),
        ...(updates.description !== undefined ? { description: updates.description } : {}),
        ...(updates.category !== undefined ? { category: updates.category } : {}),
        ...(updates.visibility !== undefined ? { visibility: updates.visibility } : {}),
        ...(updates.sharePolicy !== undefined ? { sharePolicy: updates.sharePolicy } : {}),
        ...(updates.requireShareApproval !== undefined
          ? { requireShareApproval: updates.requireShareApproval }
          : {}),
        ...(updates.moderationMode !== undefined ? { moderationMode: updates.moderationMode } : {}),
        ...(updates.inviteCode !== undefined ? { inviteCode: updates.inviteCode } : {}),
        ...(updates.status !== undefined ? { status: updates.status } : {}),
        updatedAt: new Date(),
        updatedBy: actorUserId,
      })
      .where(eq(organizations.id, organizationId))
      .returning();
    return updated ?? null;
  }

  async createJoinRequest(data: {
    organizationId: string;
    clientId: string;
    requestedByUserId: string;
  }): Promise<{ id: string; status: string }> {
    const db = this.dbProvider();
    const [existing] = await db
      .select({ id: organizationJoinRequests.id, status: organizationJoinRequests.status })
      .from(organizationJoinRequests)
      .where(
        and(
          eq(organizationJoinRequests.organizationId, data.organizationId),
          eq(organizationJoinRequests.clientId, data.clientId),
          eq(organizationJoinRequests.status, "pending"),
        ),
      )
      .limit(1);

    if (existing) {
      return existing;
    }

    const [created] = await db
      .insert(organizationJoinRequests)
      .values({
        organizationId: data.organizationId,
        clientId: data.clientId,
        requestedByUserId: data.requestedByUserId,
        status: "pending",
        createdBy: data.requestedByUserId,
        updatedBy: data.requestedByUserId,
      })
      .returning({ id: organizationJoinRequests.id, status: organizationJoinRequests.status });

    return created;
  }

  async findJoinRequestById(requestId: string): Promise<{
    id: string;
    organizationId: string;
    clientId: string;
    status: string;
  } | null> {
    const db = this.dbProvider();
    const [row] = await db
      .select({
        id: organizationJoinRequests.id,
        organizationId: organizationJoinRequests.organizationId,
        clientId: organizationJoinRequests.clientId,
        status: organizationJoinRequests.status,
      })
      .from(organizationJoinRequests)
      .where(eq(organizationJoinRequests.id, requestId))
      .limit(1);
    return row ?? null;
  }

  async updateJoinRequestStatus(
    requestId: string,
    status: "accepted" | "rejected",
    decidedByUserId: string,
  ): Promise<void> {
    const db = this.dbProvider();
    const now = new Date();
    await db
      .update(organizationJoinRequests)
      .set({
        status,
        decidedByUserId,
        decidedAt: now,
        updatedAt: now,
        updatedBy: decidedByUserId,
      })
      .where(eq(organizationJoinRequests.id, requestId));
  }

  async addMember(data: {
    organizationId: string;
    clientId: string;
    role: CommunityMemberRole;
    createdByUserId: string;
  }): Promise<OrganizationMember> {
    const db = this.dbProvider();
    const existing = await this.findMembershipInOrg(data.organizationId, data.clientId);
    if (existing) return existing;

    const [created] = await db
      .insert(organizationMembers)
      .values({
        organizationId: data.organizationId,
        clientId: data.clientId,
        role: data.role,
        status: "active",
        joinedAt: new Date(),
        createdBy: data.createdByUserId,
        updatedBy: data.createdByUserId,
      })
      .returning();
    return created;
  }

  async createPromotion(data: {
    organizationId: string;
    targetClientId: string;
    promotedByClientId: string;
    createdByUserId: string;
  }): Promise<{ id: string; status: string }> {
    const db = this.dbProvider();
    const [existing] = await db
      .select({ id: organizationPromotions.id, status: organizationPromotions.status })
      .from(organizationPromotions)
      .where(
        and(
          eq(organizationPromotions.organizationId, data.organizationId),
          eq(organizationPromotions.targetClientId, data.targetClientId),
          eq(organizationPromotions.status, "pending"),
        ),
      )
      .limit(1);
    if (existing) return existing;

    const [created] = await db
      .insert(organizationPromotions)
      .values({
        organizationId: data.organizationId,
        targetClientId: data.targetClientId,
        promotedByClientId: data.promotedByClientId,
        status: "pending",
        createdBy: data.createdByUserId,
        updatedBy: data.createdByUserId,
      })
      .returning({ id: organizationPromotions.id, status: organizationPromotions.status });
    return created;
  }

  async findPromotionById(promotionId: string): Promise<{
    id: string;
    organizationId: string;
    targetClientId: string;
    status: string;
  } | null> {
    const db = this.dbProvider();
    const [row] = await db
      .select({
        id: organizationPromotions.id,
        organizationId: organizationPromotions.organizationId,
        targetClientId: organizationPromotions.targetClientId,
        status: organizationPromotions.status,
      })
      .from(organizationPromotions)
      .where(eq(organizationPromotions.id, promotionId))
      .limit(1);
    return row ?? null;
  }

  async updatePromotionStatus(
    promotionId: string,
    status: "accepted" | "rejected",
    acceptedByUserId: string,
  ): Promise<void> {
    const db = this.dbProvider();
    const now = new Date();
    await db
      .update(organizationPromotions)
      .set({
        status,
        acceptedByUserId,
        decidedAt: now,
        updatedAt: now,
        updatedBy: acceptedByUserId,
      })
      .where(eq(organizationPromotions.id, promotionId));
  }

  async updateMemberRole(
    organizationId: string,
    clientId: string,
    role: "co_leader" | "member",
  ): Promise<void> {
    const db = this.dbProvider();
    await db
      .update(organizationMembers)
      .set({ role, updatedAt: new Date() })
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.clientId, clientId),
          eq(organizationMembers.status, "active"),
        ),
      );
  }

  async setMemberLeft(organizationId: string, clientId: string): Promise<void> {
    const db = this.dbProvider();
    const now = new Date();
    await db
      .update(organizationMembers)
      .set({ status: "left", leftAt: now, updatedAt: now })
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.clientId, clientId),
          eq(organizationMembers.status, "active"),
        ),
      );
  }

  async setMemberSuspended(
    organizationId: string,
    clientId: string,
    actorUserId: string,
  ): Promise<void> {
    const db = this.dbProvider();
    const now = new Date();
    await db
      .update(organizationMembers)
      .set({ status: "suspended", leftAt: now, updatedAt: now, updatedBy: actorUserId })
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.clientId, clientId),
          eq(organizationMembers.status, "active"),
        ),
      );
  }

  async findClientBySlugOrEmail(slugOrEmail: string): Promise<{
    id: string;
    displayName: string;
    slug: string;
    contactEmail: string;
  } | null> {
    const db = this.dbProvider();
    const clean = slugOrEmail.trim().toLowerCase();
    const [row] = await db
      .select({
        id: clients.id,
        displayName: clients.displayName,
        slug: clients.slug,
        contactEmail: clients.contactEmail,
      })
      .from(clients)
      .where(
        and(
          ne(clients.lifecycleStatus, "baja"),
          or(
            eq(clients.slug, clean),
            eq(clients.contactEmail, clean),
            eq(clients.commercialEmail, clean),
          ),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async getClientBasicInfo(clientId: string): Promise<{
    id: string;
    displayName: string;
    slug: string;
    contactEmail: string;
  } | null> {
    const db = this.dbProvider();
    const [row] = await db
      .select({
        id: clients.id,
        displayName: clients.displayName,
        slug: clients.slug,
        contactEmail: clients.contactEmail,
      })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);
    return row ?? null;
  }

  async createInvitation(data: {
    organizationId: string;
    email: string;
    targetClientId: string | null;
    role: "member" | "co_leader";
    invitedByUserId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<{ id: string; status: string }> {
    const db = this.dbProvider();
    const [row] = await db
      .insert(organizationInvitations)
      .values({
        organizationId: data.organizationId,
        email: data.email.trim().toLowerCase(),
        targetClientId: data.targetClientId,
        role: data.role,
        invitedByUserId: data.invitedByUserId,
        status: "pending",
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
        createdBy: data.invitedByUserId,
        updatedBy: data.invitedByUserId,
      })
      .returning({ id: organizationInvitations.id, status: organizationInvitations.status });
    return row;
  }

  async findInvitationById(invitationId: string): Promise<{
    id: string;
    organizationId: string;
    email: string;
    targetClientId: string | null;
    role: "member" | "co_leader";
    status: string;
    expiresAt: Date;
  } | null> {
    const db = this.dbProvider();
    const [row] = await db
      .select({
        id: organizationInvitations.id,
        organizationId: organizationInvitations.organizationId,
        email: organizationInvitations.email,
        targetClientId: organizationInvitations.targetClientId,
        role: organizationInvitations.role,
        status: organizationInvitations.status,
        expiresAt: organizationInvitations.expiresAt,
      })
      .from(organizationInvitations)
      .where(eq(organizationInvitations.id, invitationId))
      .limit(1);
    if (!row) return null;
    return {
      ...row,
      role: row.role === "co_leader" ? "co_leader" : "member",
    };
  }

  async updateInvitationStatus(
    invitationId: string,
    status: "accepted" | "rejected" | "revoked" | "expired",
    actorUserId: string,
  ): Promise<void> {
    const db = this.dbProvider();
    await db
      .update(organizationInvitations)
      .set({ status, updatedAt: new Date(), updatedBy: actorUserId })
      .where(eq(organizationInvitations.id, invitationId));
  }

  async getTenantCommunitiesOverviewData(clientId: string): Promise<TenantCommunitiesOverviewDto> {
    const db = this.dbProvider();

    const [authRow, ownedCount, myMemberships, myClientRow] = await Promise.all([
      this.getLeaderAuthorization(clientId),
      this.countOwnedOrganizations(clientId),
      db
        .select()
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.clientId, clientId),
            eq(organizationMembers.status, "active"),
          ),
        )
        .orderBy(desc(organizationMembers.joinedAt)),
      db
        .select({
          id: clients.id,
          contactEmail: clients.contactEmail,
          commercialEmail: clients.commercialEmail,
        })
        .from(clients)
        .where(eq(clients.id, clientId))
        .limit(1),
    ]);

    const leaderStatus: LeaderAuthorizationStatus = (authRow?.status as LeaderAuthorizationStatus) ?? "none";
    const maxOwned = authRow?.maxOwnedCommunities ?? null;
    const canCreateMore =
      leaderStatus === "approved" && (maxOwned === null || ownedCount < maxOwned);

    const leaderAuthorization: LeaderAuthorizationStatusDto = {
      status: leaderStatus,
      maxOwnedCommunities: maxOwned,
      ownedCommunitiesCount: ownedCount,
      canCreateMoreCommunities: canCreateMore,
      proposedCommunityName: authRow?.proposedCommunityName ?? null,
      businessModel: authRow?.businessModel ?? null,
      reviewNotes: authRow?.reviewNotes ?? null,
      requestedAt: authRow?.requestedAt ? authRow.requestedAt.toISOString() : null,
      reviewedAt: authRow?.reviewedAt ? authRow.reviewedAt.toISOString() : null,
    };

    const myOrgIds = myMemberships.map((m: OrganizationMember) => m.organizationId);
    const membershipByOrg = new Map<string, OrganizationMember>(
      myMemberships.map((m: OrganizationMember) => [m.organizationId, m]),
    );

    const myOrgs: Organization[] =
      myOrgIds.length > 0
        ? await db.select().from(organizations).where(inArray(organizations.id, myOrgIds))
        : [];

    const allPublicOrgs: Organization[] = await db
      .select()
      .from(organizations)
      .where(
        and(
          eq(organizations.visibility, "request_to_join"),
          eq(organizations.status, "active"),
        ),
      )
      .orderBy(desc(organizations.createdAt));

    const directoryOrgs = allPublicOrgs.filter((o) => !membershipByOrg.has(o.id));
    const allRelevantOrgIds = Array.from(
      new Set([...myOrgIds, ...directoryOrgs.map((o) => o.id)]),
    );

    // Métricas y relaciones para organizaciones relevantes
    const [allMembers, allShares, allJoinReqs, allPosts, allPromos, allInvitations] =
      allRelevantOrgIds.length > 0
        ? await Promise.all([
            db
              .select()
              .from(organizationMembers)
              .where(
                and(
                  inArray(organizationMembers.organizationId, allRelevantOrgIds),
                  eq(organizationMembers.status, "active"),
                ),
              ),
            db
              .select({
                id: productShares.id,
                organizationId: productShares.organizationId,
                status: productShares.status,
                moderationStatus: productShares.moderationStatus,
              })
              .from(productShares)
              .where(inArray(productShares.organizationId, allRelevantOrgIds)),
            db
              .select()
              .from(organizationJoinRequests)
              .where(inArray(organizationJoinRequests.organizationId, allRelevantOrgIds)),
            db
              .select({
                id: feedPosts.id,
                organizationId: feedPosts.organizationId,
                status: feedPosts.status,
              })
              .from(feedPosts)
              .where(inArray(feedPosts.organizationId, allRelevantOrgIds)),
            myOrgIds.length > 0
              ? db
                  .select()
                  .from(organizationPromotions)
                  .where(inArray(organizationPromotions.organizationId, myOrgIds))
              : Promise.resolve([]),
            myOrgIds.length > 0
              ? db
                  .select()
                  .from(organizationInvitations)
                  .where(inArray(organizationInvitations.organizationId, myOrgIds))
              : Promise.resolve([]),
          ])
        : [[], [], [], [], [], []];

    const clientIdsToLoad = new Set<string>();
    for (const o of [...myOrgs, ...directoryOrgs]) clientIdsToLoad.add(o.originatorClientId);
    for (const m of allMembers) clientIdsToLoad.add(m.clientId);
    for (const r of allJoinReqs) clientIdsToLoad.add(r.clientId);
    for (const p of allPromos) clientIdsToLoad.add(p.targetClientId);

    const clientIdsArr = Array.from(clientIdsToLoad);
    const [clientRows, sharingProfilesRows] =
      clientIdsArr.length > 0
        ? await Promise.all([
            db
              .select({
                id: clients.id,
                displayName: clients.displayName,
                slug: clients.slug,
                contactEmail: clients.contactEmail,
                commercialEmail: clients.commercialEmail,
                phone: clients.phone,
              })
              .from(clients)
              .where(inArray(clients.id, clientIdsArr)),
            db
              .select()
              .from(clientSharingProfiles)
              .where(inArray(clientSharingProfiles.clientId, clientIdsArr)),
          ])
        : [[], []];

    const clientMap = new Map<string, (typeof clientRows)[number]>(
      clientRows.map((c: (typeof clientRows)[number]) => [c.id, c]),
    );
    const sharingMap = new Map<string, (typeof sharingProfilesRows)[number]>(
      sharingProfilesRows.map((s: (typeof sharingProfilesRows)[number]) => [s.clientId, s]),
    );

    const myCommunities: TenantCommunityDetailDto[] = myOrgs.map((org) => {
      const mem = membershipByOrg.get(org.id)!;
      const myRole = (mem.role as CommunityMemberRole) ?? "member";
      const isLeader = myRole === "originator" || myRole === "co_leader";
      const orgMembers = allMembers.filter((m: OrganizationMember) => m.organizationId === org.id);
      const orgShares = allShares.filter(
        (s: any) => s.organizationId === org.id && s.status === "active",
      );
      const orgReqs = allJoinReqs.filter(
        (r: any) => r.organizationId === org.id && r.status === "pending",
      );
      const orgPendingPosts = allPosts.filter(
        (p: any) => p.organizationId === org.id && p.status === "pending_review",
      );
      const orgPromos = allPromos.filter(
        (p: any) => p.organizationId === org.id && p.status === "pending",
      );
      const orgInvites = allInvitations.filter(
        (inv: any) => inv.organizationId === org.id && inv.status === "pending",
      );

      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        description: org.description ?? null,
        category: org.category ?? null,
        visibility: (org.visibility as CommunityVisibility) ?? "private_invite",
        sharePolicy: (org.sharePolicy as CommunitySharePolicy) ?? "leaders_only",
        requireShareApproval: Boolean(org.requireShareApproval),
        moderationMode: (org.moderationMode as CommunityModerationMode) ?? "pre",
        inviteCode: org.inviteCode,
        status: (org.status as CommunityOrganizationStatus) ?? "active",
        originatorClientId: org.originatorClientId,
        originatorName: clientMap.get(org.originatorClientId)?.displayName || "Comercio Líder",
        myRole,
        membersCount: orgMembers.length,
        sharesCount: orgShares.filter((s: any) => s.moderationStatus === "approved").length,
        pendingRequestsCount: orgReqs.length,
        pendingSharesCount: orgShares.filter((s: any) => s.moderationStatus === "pending_review")
          .length,
        pendingPostsCount: orgPendingPosts.length,
        joinedAt: mem.joinedAt.toISOString(),
        members: orgMembers.map((m: OrganizationMember) => {
          const c = clientMap.get(m.clientId);
          const sp = sharingMap.get(m.clientId);
          const shareEmail = sp ? sp.shareEmail : true;
          const sharePhone = sp ? sp.sharePhone : false;
          return {
            id: m.id,
            clientId: m.clientId,
            displayName: c?.displayName || "Comercio",
            slug: c?.slug || m.clientId.slice(0, 8),
            role: m.role as CommunityMemberRole,
            status: m.status,
            joinedAt: m.joinedAt.toISOString(),
            contactEmail: shareEmail
              ? (c?.commercialEmail || c?.contactEmail || undefined)
              : undefined,
            phone: sharePhone ? (c?.phone ?? undefined) : undefined,
          };
        }),
        joinRequests: isLeader
          ? orgReqs.map((r: any) => {
              const c = clientMap.get(r.clientId);
              return {
                id: r.id,
                organizationId: r.organizationId,
                clientId: r.clientId,
                clientName: c?.displayName || "Comercio",
                clientSlug: c?.slug || r.clientId.slice(0, 8),
                status: r.status,
                createdAt: r.createdAt.toISOString(),
              };
            })
          : [],
        invitations: isLeader
          ? orgInvites.map((inv: any) => ({
              id: inv.id,
              organizationId: inv.organizationId,
              organizationName: org.name,
              organizationSlug: org.slug,
              role: inv.role === "co_leader" ? "co_leader" : "member",
              email: inv.email,
              targetClientId: inv.targetClientId ?? null,
              inviterName: clientMap.get(org.originatorClientId)?.displayName || org.name,
              status: inv.status,
              expiresAt: inv.expiresAt.toISOString(),
              createdAt: inv.createdAt.toISOString(),
            }))
          : [],
        promotions: isLeader
          ? orgPromos.map((p: any) => ({
              id: p.id,
              organizationId: p.organizationId,
              organizationName: org.name,
              targetClientId: p.targetClientId,
              targetClientName: clientMap.get(p.targetClientId)?.displayName || "Comercio",
              promotedByClientId: p.promotedByClientId,
              status: p.status,
              createdAt: p.createdAt.toISOString(),
            }))
          : [],
      };
    });

    const directoryCommunities: CommunityDirectoryItemDto[] = directoryOrgs.map((org) => {
      const orgMembers = allMembers.filter((m: OrganizationMember) => m.organizationId === org.id);
      const orgShares = allShares.filter(
        (s: any) =>
          s.organizationId === org.id &&
          s.status === "active" &&
          s.moderationStatus === "approved",
      );
      const myReq = allJoinReqs.find(
        (r: any) => r.organizationId === org.id && r.clientId === clientId,
      );

      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        description: org.description ?? null,
        category: org.category ?? null,
        originatorClientId: org.originatorClientId,
        originatorName: clientMap.get(org.originatorClientId)?.displayName || "Comercio Líder",
        sharePolicy: (org.sharePolicy as CommunitySharePolicy) ?? "leaders_only",
        moderationMode: (org.moderationMode as CommunityModerationMode) ?? "pre",
        membersCount: orgMembers.length,
        sharesCount: orgShares.length,
        myRequestStatus:
          myReq?.status === "pending"
            ? "pending"
            : myReq?.status === "rejected"
              ? "rejected"
              : "none",
      };
    });

    // Invitaciones entrantes hacia este comercio (por targetClientId o email)
    const clientInfo = myClientRow[0];
    const matchEmails = [clientInfo?.contactEmail, clientInfo?.commercialEmail]
      .filter((e): e is string => Boolean(e))
      .map((e) => e.trim().toLowerCase());

    const incomingInvRows = await db
      .select()
      .from(organizationInvitations)
      .where(
        and(
          eq(organizationInvitations.status, "pending"),
          matchEmails.length > 0
            ? or(
                eq(organizationInvitations.targetClientId, clientId),
                inArray(organizationInvitations.email, matchEmails),
              )
            : eq(organizationInvitations.targetClientId, clientId),
        ),
      )
      .orderBy(desc(organizationInvitations.createdAt));

    const invOrgIds: string[] = Array.from(
      new Set(incomingInvRows.map((i: { organizationId: string }) => i.organizationId)),
    );
    const invOrgs =
      invOrgIds.length > 0
        ? await db.select().from(organizations).where(inArray(organizations.id, invOrgIds))
        : [];
    const invOrgMap = new Map<string, Organization>(invOrgs.map((o: Organization) => [o.id, o]));

    const now = Date.now();
    const pendingInvitations: CommunityInvitationDto[] = incomingInvRows
      .filter((inv: any) => new Date(inv.expiresAt).getTime() > now)
      .map((inv: any) => {
        const org = invOrgMap.get(inv.organizationId);
        return {
          id: inv.id,
          organizationId: inv.organizationId,
          organizationName: org?.name || "Comunidad",
          organizationSlug: org?.slug || "",
          role: inv.role === "co_leader" ? "co_leader" : "member",
          email: inv.email,
          targetClientId: inv.targetClientId ?? null,
          inviterName: org?.name || "Comunidad",
          status: inv.status,
          expiresAt: new Date(inv.expiresAt).toISOString(),
          createdAt: new Date(inv.createdAt).toISOString(),
        };
      });

    // Promociones entrantes a co-líder para este comercio
    const incomingPromoRows = await db
      .select()
      .from(organizationPromotions)
      .where(
        and(
          eq(organizationPromotions.targetClientId, clientId),
          eq(organizationPromotions.status, "pending"),
        ),
      )
      .orderBy(desc(organizationPromotions.createdAt));

    const promoOrgIds: string[] = Array.from(
      new Set(incomingPromoRows.map((p: { organizationId: string }) => p.organizationId)),
    );
    const promoOrgs =
      promoOrgIds.length > 0
        ? await db.select().from(organizations).where(inArray(organizations.id, promoOrgIds))
        : [];
    const promoOrgMap = new Map<string, Organization>(
      promoOrgs.map((o: Organization) => [o.id, o]),
    );

    const pendingPromotions: CommunityPromotionDto[] = incomingPromoRows.map((p: any) => ({
      id: p.id,
      organizationId: p.organizationId,
      organizationName: promoOrgMap.get(p.organizationId)?.name || "Comunidad",
      targetClientId: p.targetClientId,
      targetClientName: "",
      promotedByClientId: p.promotedByClientId,
      status: p.status,
      createdAt: p.createdAt.toISOString(),
    }));

    return {
      leaderAuthorization,
      myCommunities,
      directoryCommunities,
      pendingInvitations,
      pendingPromotions,
    };
  }

  async getAdminCommunitiesOverviewData(): Promise<AdminCommunitiesOverviewDto> {
    const db = getDb();

    const [authRows, orgRows, clientRows, planRows, memberRows, shareRows] = await Promise.all([
      db
        .select()
        .from(communityLeaderAuthorizations)
        .orderBy(desc(communityLeaderAuthorizations.requestedAt)),
      db.select().from(organizations).orderBy(desc(organizations.createdAt)),
      db
        .select({
          id: clients.id,
          displayName: clients.displayName,
          slug: clients.slug,
          contactEmail: clients.contactEmail,
          planId: clients.planId,
          locale: clients.locale,
          lifecycleStatus: clients.lifecycleStatus,
        })
        .from(clients)
        .where(ne(clients.lifecycleStatus, "baja")),
      db.select({ id: plans.id, code: plans.code, name: plans.name }).from(plans),
      db
        .select({
          organizationId: organizationMembers.organizationId,
          status: organizationMembers.status,
        })
        .from(organizationMembers),
      db
        .select({
          organizationId: productShares.organizationId,
          status: productShares.status,
        })
        .from(productShares),
    ]);

    const planMap = new Map<string, string>();
    for (const p of planRows) {
      const nameObj = p.name as { es?: string; en?: string } | null;
      planMap.set(p.id, nameObj?.es || nameObj?.en || p.code);
    }

    const clientMap = new Map(clientRows.map((c: (typeof clientRows)[number]) => [c.id, c]));
    const ownedCountMap = new Map<string, number>();
    for (const o of orgRows) {
      ownedCountMap.set(o.originatorClientId, (ownedCountMap.get(o.originatorClientId) ?? 0) + 1);
    }

    const authByClient = new Map<string, CommunityLeaderAuthorization>(
      authRows.map((a: CommunityLeaderAuthorization) => [a.clientId, a]),
    );

    const authorizations: AdminLeaderAuthorizationItemDto[] = authRows.map(
      (a: CommunityLeaderAuthorization) => {
        const c = clientMap.get(a.clientId);
        return {
          id: a.id,
          clientId: a.clientId,
          clientName: c?.displayName || "Comercio",
          clientSlug: c?.slug || a.clientId.slice(0, 8),
          contactEmail: c?.contactEmail || "",
          planName: c?.planId ? (planMap.get(c.planId) || "Plan") : "Plan",
          status: a.status as AdminLeaderAuthorizationItemDto["status"],
          maxOwnedCommunities: a.maxOwnedCommunities ?? null,
          ownedCommunitiesCount: ownedCountMap.get(a.clientId) ?? 0,
          proposedCommunityName: a.proposedCommunityName ?? null,
          businessModel: a.businessModel ?? null,
          reviewNotes: a.reviewNotes ?? null,
          requestedAt: a.requestedAt.toISOString(),
          reviewedAt: a.reviewedAt ? a.reviewedAt.toISOString() : null,
        };
      },
    );

    const organizationsSummary: AdminOrganizationSummaryDto[] = orgRows.map((o: Organization) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      description: o.description ?? null,
      category: o.category ?? null,
      originatorClientId: o.originatorClientId,
      originatorName: clientMap.get(o.originatorClientId)?.displayName || "Comercio",
      visibility: (o.visibility as CommunityVisibility) ?? "private_invite",
      sharePolicy: (o.sharePolicy as CommunitySharePolicy) ?? "leaders_only",
      moderationMode: (o.moderationMode as CommunityModerationMode) ?? "pre",
      status: (o.status as CommunityOrganizationStatus) ?? "active",
      membersCount: memberRows.filter(
        (m: any) => m.organizationId === o.id && m.status === "active",
      ).length,
      sharesCount: shareRows.filter(
        (s: any) => s.organizationId === o.id && s.status === "active",
      ).length,
      createdAt: o.createdAt.toISOString(),
    }));

    const tenants = clientRows.map((c: (typeof clientRows)[number]) => ({
      id: c.id,
      displayName: c.displayName,
      slug: c.slug,
      contactEmail: c.contactEmail,
      planName: c.planId ? (planMap.get(c.planId) || "Plan") : "Plan",
      leaderStatus: (authByClient.get(c.id)?.status as LeaderAuthorizationStatus) ?? "none",
    }));

    return {
      authorizations,
      organizations: organizationsSummary,
      tenants,
    };
  }
}

/**
 * Servicio de gobernanza de comunidades, autorizaciones de líderes, membresías, admisiones y promociones (`ADM-001 T-19/T-20`, `SPEC-15`).
 */
export class CommunitiesGovernanceService {
  constructor(private readonly repo: ICommunitiesGovernanceRepository) {}

  /**
   * Consulta el estado de autorización como Líder de Comunidad y la vista completa de comunidades del comercio.
   */
  async getTenantOverview(clientId: string): Promise<Result<TenantCommunitiesOverviewDto>> {
    try {
      if (!this.repo.getTenantCommunitiesOverviewData) {
        return err("Repositorio no soporta vista integral de comunidades.", "NOT_SUPPORTED");
      }
      const data = await this.repo.getTenantCommunitiesOverviewData(clientId);
      return ok(data);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[CommunitiesGovernance] Error al consultar resumen de comunidades: ${msg}`, error);
      return err(msg, "COMMUNITY_OVERVIEW_ERROR");
    }
  }

  /**
   * Envía o actualiza una solicitud para ser habilitado como Líder de Comunidad ante `platform_admin` (`SPEC-15`).
   */
  async requestLeaderAuthorization(params: {
    clientId: string;
    requestedByUserId: string;
    proposedCommunityName: string;
    businessModel: string;
  }): Promise<Result<LeaderAuthorizationStatusDto>> {
    try {
      if (!this.repo.upsertLeaderRequest || !this.repo.getLeaderAuthorization) {
        return err("Repositorio no soporta solicitudes de liderazgo.", "NOT_SUPPORTED");
      }
      const existing = await this.repo.getLeaderAuthorization(params.clientId);
      if (existing?.status === "approved") {
        return err("Tu comercio ya está autorizado para crear comunidades.", "ALREADY_AUTHORIZED_LEADER");
      }

      const saved = await this.repo.upsertLeaderRequest({
        clientId: params.clientId,
        proposedCommunityName: params.proposedCommunityName.trim(),
        businessModel: params.businessModel.trim(),
        requestedByUserId: params.requestedByUserId,
      });

      const ownedCount = this.repo.countOwnedOrganizations
        ? await this.repo.countOwnedOrganizations(params.clientId)
        : 0;

      appLogger.info("tenant.community.leader_requested", {
        clientId: params.clientId,
        proposedCommunityName: params.proposedCommunityName,
      });

      return ok({
        status: saved.status as LeaderAuthorizationStatus,
        maxOwnedCommunities: saved.maxOwnedCommunities ?? null,
        ownedCommunitiesCount: ownedCount,
        canCreateMoreCommunities: false,
        proposedCommunityName: saved.proposedCommunityName ?? null,
        businessModel: saved.businessModel ?? null,
        reviewNotes: saved.reviewNotes ?? null,
        requestedAt: saved.requestedAt.toISOString(),
        reviewedAt: saved.reviewedAt ? saved.reviewedAt.toISOString() : null,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[CommunitiesGovernance] Error en solicitud de líder: ${msg}`, error);
      return err(msg, "LEADER_REQUEST_ERROR");
    }
  }

  /**
   * Aprueba, rechaza o revoca la facultad de un comercio para crear comunidades (`platform_admin` / `platform_owner`).
   */
  async reviewLeaderAuthorization(params: {
    clientId: string;
    action: "approve" | "reject" | "revoke";
    maxOwnedCommunities?: number | null;
    reviewNotes?: string | null;
    reviewedByUserId: string;
  }): Promise<Result<CommunityLeaderAuthorization>> {
    try {
      if (!this.repo.upsertLeaderDecision) {
        return err("Repositorio no soporta revisión de liderazgo.", "NOT_SUPPORTED");
      }

      const statusMap = {
        approve: "approved",
        reject: "rejected",
        revoke: "revoked",
      } as const;

      const maxOwned =
        params.action === "approve"
          ? params.maxOwnedCommunities === undefined
            ? 3
            : params.maxOwnedCommunities
          : null;

      if (maxOwned !== null && (!Number.isInteger(maxOwned) || maxOwned <= 0)) {
        return err("El cupo de comunidades debe ser un entero positivo o ilimitado.", "INVALID_QUOTA");
      }

      const updated = await this.repo.upsertLeaderDecision({
        clientId: params.clientId,
        status: statusMap[params.action],
        maxOwnedCommunities: maxOwned,
        reviewNotes: params.reviewNotes?.trim() || null,
        reviewedByUserId: params.reviewedByUserId,
      });

      appLogger.info("admin.community.leader_decided", {
        clientId: params.clientId,
        action: params.action,
        maxOwnedCommunities: maxOwned,
        reviewedByUserId: params.reviewedByUserId,
      });

      // Notificación no bloqueante al comercio (SPEC-14)
      void this.notifyLeaderDecision(params.clientId, updated);

      return ok(updated);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[CommunitiesGovernance] Error al revisar autorización de líder: ${msg}`, error);
      return err(msg, "LEADER_REVIEW_ERROR");
    }
  }

  private async notifyLeaderDecision(
    clientId: string,
    auth: CommunityLeaderAuthorization,
  ): Promise<void> {
    try {
      const clientInfo = this.repo.getClientBasicInfo
        ? await this.repo.getClientBasicInfo(clientId)
        : null;
      const statusLabels: Record<string, string> = {
        approved: "Aprobada",
        rejected: "Rechazada",
        revoked: "Revocada",
      };
      const quotaText =
        auth.status === "approved"
          ? auth.maxOwnedCommunities === null
            ? "Ilimitado"
            : String(auth.maxOwnedCommunities)
          : "0";

      const dispatcher = getNotificationDispatcherService();
      await dispatcher.dispatchTenantNotification({
        clientId,
        eventKey: "community.leader_status",
        variables: {
          tenant_name: clientInfo?.displayName || "Comercio",
          status_label: statusLabels[auth.status] || auth.status,
          max_communities: quotaText,
          review_notes: auth.reviewNotes || "",
          community_url: "/workspace/community",
        },
        idempotencyKey: `leader-status:${clientId}:${auth.updatedAt.getTime()}`,
        inAppPayload: {
          title:
            auth.status === "approved"
              ? "Autorización de Líder de Comunidad aprobada"
              : `Autorización de Líder actualizada (${statusLabels[auth.status] || auth.status})`,
          body:
            auth.status === "approved"
              ? `Ya puedes crear tus propias comunidades (cupo: ${quotaText}) y compartir tu catálogo.`
              : auth.reviewNotes || "Revisa el detalle en la sección Comunidad de Comercios.",
          severity: auth.status === "approved" ? "success" : "warning",
          actionUrl: "/workspace/community",
        },
      });
    } catch (errNotify) {
      appLogger.warn("[CommunitiesGovernance] Fallo no bloqueante al notificar decisión de líder", {
        clientId,
        error: errNotify instanceof Error ? errNotify.message : String(errNotify),
      });
    }
  }

  /**
   * Lista resumen global de solicitudes de líderes y comunidades para el Backoffice SaaS (`/admin/communities`).
   */
  async getAdminOverview(): Promise<Result<AdminCommunitiesOverviewDto>> {
    try {
      if (!this.repo.getAdminCommunitiesOverviewData) {
        return err("Repositorio no soporta resumen administrativo.", "NOT_SUPPORTED");
      }
      const data = await this.repo.getAdminCommunitiesOverviewData();
      return ok(data);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[CommunitiesGovernance] Error en vista admin de comunidades: ${msg}`, error);
      return err(msg, "ADMIN_COMMUNITIES_ERROR");
    }
  }

  /**
   * Suspende o reactiva una comunidad desde el Backoffice SaaS (`platform_admin`).
   */
  async setOrganizationPlatformStatus(params: {
    organizationId: string;
    status: CommunityOrganizationStatus;
    actorUserId: string;
  }): Promise<Result<Organization>> {
    try {
      if (!this.repo.updateOrganizationSettings) {
        return err("Repositorio no soporta actualización de comunidad.", "NOT_SUPPORTED");
      }
      const updated = await this.repo.updateOrganizationSettings(
        params.organizationId,
        { status: params.status },
        params.actorUserId,
      );
      if (!updated) {
        return err("Comunidad no encontrada.", "ORGANIZATION_NOT_FOUND");
      }
      return ok(updated);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return err(msg, "UPDATE_ORG_STATUS_ERROR");
    }
  }

  /**
   * Crea una nueva organización de comunidad con el inquilino originador (`ADM-001 T-19`, `SPEC-15`).
   */
  async createOrganization(params: {
    originatorClientId: string;
    name: string;
    slug?: string;
    description?: string | null;
    category?: string | null;
    visibility?: CommunityVisibility;
    sharePolicy?: CommunitySharePolicy;
    requireShareApproval?: boolean;
    moderationMode?: CommunityModerationMode;
    createdByUserId: string;
  }): Promise<Result<Organization>> {
    try {
      if (!this.repo.supportsMultiCommunity) {
        // Modo compatibilidad con pruebas heredadas ADM-001
        const existing = await this.repo.findActiveMembership(params.originatorClientId);
        if (existing) {
          return err(
            "El inquilino ya pertenece a una comunidad activa. Debe desvincularse primero.",
            "TENANT_ALREADY_IN_COMMUNITY",
          );
        }
      } else {
        // SPEC-15: Multi-comunidad con autorización explícita de plataforma y cupo
        const leaderAuth = this.repo.getLeaderAuthorization
          ? await this.repo.getLeaderAuthorization(params.originatorClientId)
          : null;

        if (!leaderAuth || leaderAuth.status !== "approved") {
          return err(
            "Crear comunidades requiere aprobación previa de plataforma como Líder.",
            "LEADER_APPROVAL_REQUIRED",
          );
        }

        const ownedCount = this.repo.countOwnedOrganizations
          ? await this.repo.countOwnedOrganizations(params.originatorClientId)
          : 0;

        if (
          leaderAuth.maxOwnedCommunities !== null &&
          ownedCount >= leaderAuth.maxOwnedCommunities
        ) {
          return err(
            `Alcanzaste el cupo máximo de ${leaderAuth.maxOwnedCommunities} comunidades lideradas.`,
            "LEADER_QUOTA_EXCEEDED",
          );
        }
      }

      const res = await this.repo.createOrganization({
        originatorClientId: params.originatorClientId,
        name: params.name,
        slug: params.slug,
        description: params.description,
        category: params.category,
        visibility: params.visibility ?? "private_invite",
        sharePolicy: params.sharePolicy ?? "leaders_only",
        requireShareApproval: params.requireShareApproval ?? true,
        moderationMode: params.moderationMode ?? "pre",
        createdByUserId: params.createdByUserId,
      });

      appLogger.info("tenant.community.organization_created", {
        organizationId: res.org.id,
        originatorClientId: params.originatorClientId,
        visibility: res.org.visibility,
        sharePolicy: res.org.sharePolicy,
      });

      return ok(res.org);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[CommunitiesGovernance] Error al crear organización: ${msg}`, error);
      return err(msg, "CREATE_ORGANIZATION_ERROR");
    }
  }

  /**
   * Actualiza la configuración de una comunidad (solo `originator`).
   */
  async updateOrganizationSettings(params: {
    organizationId: string;
    actorClientId: string;
    actorUserId: string;
    name?: string;
    description?: string | null;
    category?: string | null;
    visibility?: CommunityVisibility;
    sharePolicy?: CommunitySharePolicy;
    requireShareApproval?: boolean;
    moderationMode?: CommunityModerationMode;
    regenerateInviteCode?: boolean;
  }): Promise<Result<Organization>> {
    try {
      const org = await this.repo.findOrganizationById(params.organizationId);
      if (!org) {
        return err("Comunidad no encontrada.", "ORGANIZATION_NOT_FOUND");
      }
      if (org.originatorClientId !== params.actorClientId) {
        return err(
          "Solo el comercio creador de la comunidad puede editar su configuración.",
          "UNAUTHORIZED_ORIGINATOR_ONLY",
        );
      }
      if (!this.repo.updateOrganizationSettings) {
        return err("Repositorio no soporta actualización.", "NOT_SUPPORTED");
      }

      const updated = await this.repo.updateOrganizationSettings(
        params.organizationId,
        {
          ...(params.name !== undefined ? { name: params.name } : {}),
          ...(params.description !== undefined ? { description: params.description } : {}),
          ...(params.category !== undefined ? { category: params.category } : {}),
          ...(params.visibility !== undefined ? { visibility: params.visibility } : {}),
          ...(params.sharePolicy !== undefined ? { sharePolicy: params.sharePolicy } : {}),
          ...(params.requireShareApproval !== undefined
            ? { requireShareApproval: params.requireShareApproval }
            : {}),
          ...(params.moderationMode !== undefined ? { moderationMode: params.moderationMode } : {}),
          ...(params.regenerateInviteCode ? { inviteCode: generateInviteCode() } : {}),
        },
        params.actorUserId,
      );

      if (!updated) {
        return err("Comunidad no encontrada.", "ORGANIZATION_NOT_FOUND");
      }
      return ok(updated);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return err(msg, "UPDATE_ORGANIZATION_ERROR");
    }
  }

  /**
   * Invita a otro comercio por slug o correo electrónico a unirse a la comunidad (`SPEC-15`).
   */
  async inviteTenant(params: {
    organizationId: string;
    inviterClientId: string;
    inviterUserId: string;
    targetClientSlugOrEmail: string;
    role?: "member" | "co_leader";
  }): Promise<Result<{ invitationId: string; targetClientId: string | null; inviteCode: string }>> {
    try {
      const org = await this.repo.findOrganizationById(params.organizationId);
      if (!org || org.status !== "active") {
        return err("Comunidad no encontrada o suspendida.", "ORGANIZATION_NOT_FOUND");
      }
      if (org.originatorClientId !== params.inviterClientId) {
        return err(
          "Solo el comercio creador posee permisos para invitar nuevos miembros.",
          "UNAUTHORIZED_ORIGINATOR_ONLY",
        );
      }
      if (!this.repo.createInvitation) {
        return err("Repositorio no soporta invitaciones.", "NOT_SUPPORTED");
      }

      const cleanTarget = params.targetClientSlugOrEmail.trim().toLowerCase();
      const matchedClient = this.repo.findClientBySlugOrEmail
        ? await this.repo.findClientBySlugOrEmail(cleanTarget)
        : null;

      if (matchedClient && matchedClient.id === params.inviterClientId) {
        return err("Tu comercio ya lidera esta comunidad.", "CANNOT_INVITE_SELF");
      }

      if (matchedClient && this.repo.findMembershipInOrg) {
        const existingMem = await this.repo.findMembershipInOrg(org.id, matchedClient.id);
        if (existingMem) {
          return err("Ese comercio ya es miembro activo de esta comunidad.", "ALREADY_COMMUNITY_MEMBER");
        }
      }

      const targetEmail = matchedClient ? matchedClient.contactEmail.toLowerCase() : cleanTarget;
      if (!targetEmail.includes("@")) {
        return err(
          "No encontramos un comercio registrado con ese identificador. Ingresa un correo electrónico válido o el slug exacto.",
          "TARGET_TENANT_NOT_FOUND",
        );
      }

      const rawToken = randomBytes(24).toString("hex");
      const tokenHash = createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const role = params.role ?? "member";

      const inv = await this.repo.createInvitation({
        organizationId: org.id,
        email: targetEmail,
        targetClientId: matchedClient?.id ?? null,
        role,
        invitedByUserId: params.inviterUserId,
        tokenHash,
        expiresAt,
      });

      if (matchedClient) {
        void this.notifyInvitation(matchedClient.id, org, role, inv.id);
      }

      return ok({
        invitationId: inv.id,
        targetClientId: matchedClient?.id ?? null,
        inviteCode: org.inviteCode,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[CommunitiesGovernance] Error al invitar comercio: ${msg}`, error);
      return err(msg, "INVITE_TENANT_ERROR");
    }
  }

  private async notifyInvitation(
    targetClientId: string,
    org: Organization,
    role: "member" | "co_leader",
    invitationId: string,
  ): Promise<void> {
    try {
      const [targetInfo, orgInfo] = await Promise.all([
        this.repo.getClientBasicInfo?.(targetClientId) ?? null,
        this.repo.getClientBasicInfo?.(org.originatorClientId) ?? null,
      ]);
      const dispatcher = getNotificationDispatcherService();
      await dispatcher.dispatchTenantNotification({
        clientId: targetClientId,
        eventKey: "community.invited",
        variables: {
          tenant_name: targetInfo?.displayName || "Comercio",
          community_name: org.name,
          inviter_name: orgInfo?.displayName || org.name,
          role_label: role === "co_leader" ? "Co-Líder" : "Miembro",
          invite_url: "/workspace/community",
        },
        idempotencyKey: `community-invite:${invitationId}`,
        inAppPayload: {
          title: `Invitación a la comunidad ${org.name}`,
          body: `${orgInfo?.displayName || org.name} te invitó a unirte a su red comercial.`,
          severity: "info",
          actionUrl: "/workspace/community",
        },
      });
    } catch {
      // No bloqueante
    }
  }

  /**
   * Responde a una invitación recibida (`accepted` | `rejected`).
   */
  async respondInvitation(params: {
    invitationId: string;
    clientId: string;
    userId: string;
    decision: "accepted" | "rejected";
  }): Promise<Result<{ status: string; organizationId: string }>> {
    try {
      if (!this.repo.findInvitationById || !this.repo.updateInvitationStatus) {
        return err("Repositorio no soporta invitaciones.", "NOT_SUPPORTED");
      }

      const inv = await this.repo.findInvitationById(params.invitationId);
      if (!inv || inv.status !== "pending") {
        return err("Invitación no encontrada o ya procesada.", "INVITATION_NOT_FOUND");
      }

      const clientInfo = this.repo.getClientBasicInfo
        ? await this.repo.getClientBasicInfo(params.clientId)
        : null;
      const matchesClient =
        inv.targetClientId === params.clientId ||
        (clientInfo && inv.email.toLowerCase() === clientInfo.contactEmail.toLowerCase());

      if (!matchesClient) {
        return err("Esta invitación pertenece a otro comercio.", "FORBIDDEN");
      }

      if (inv.expiresAt.getTime() < Date.now()) {
        await this.repo.updateInvitationStatus(inv.id, "expired", params.userId);
        return err("La invitación ha expirado.", "INVITATION_EXPIRED");
      }

      await this.repo.updateInvitationStatus(inv.id, params.decision, params.userId);
      if (params.decision === "accepted") {
        await this.repo.addMember({
          organizationId: inv.organizationId,
          clientId: params.clientId,
          role: inv.role,
          createdByUserId: params.userId,
        });
      }

      return ok({ status: params.decision, organizationId: inv.organizationId });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return err(msg, "RESPOND_INVITATION_ERROR");
    }
  }

  /**
   * Permite unirse a una comunidad directamente mediante su código compartible (`inviteCode`).
   */
  async joinByInviteCode(params: {
    inviteCode: string;
    clientId: string;
    userId: string;
  }): Promise<Result<{ organizationId: string; organizationName: string }>> {
    try {
      if (!this.repo.findOrganizationByInviteCode) {
        return err("Repositorio no soporta ingreso por código.", "NOT_SUPPORTED");
      }
      const org = await this.repo.findOrganizationByInviteCode(params.inviteCode);
      if (!org || org.status !== "active") {
        return err("El código de invitación no corresponde a una comunidad activa.", "INVALID_INVITE_CODE");
      }

      const existing = this.repo.findMembershipInOrg
        ? await this.repo.findMembershipInOrg(org.id, params.clientId)
        : null;
      if (existing) {
        return ok({ organizationId: org.id, organizationName: org.name });
      }

      await this.repo.addMember({
        organizationId: org.id,
        clientId: params.clientId,
        role: "member",
        createdByUserId: params.userId,
      });

      return ok({ organizationId: org.id, organizationName: org.name });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return err(msg, "JOIN_BY_CODE_ERROR");
    }
  }

  /**
   * Solicita admisión para unirse a una comunidad descubrible (`ADM-001 T-20`, `SPEC-15`).
   */
  async requestJoin(params: {
    organizationId: string;
    clientId: string;
    requestedByUserId: string;
  }): Promise<Result<{ requestId: string; status: string }>> {
    try {
      if (!this.repo.supportsMultiCommunity) {
        const active = await this.repo.findActiveMembership(params.clientId);
        if (active) {
          return err("El inquilino ya pertenece a una comunidad activa.", "TENANT_ALREADY_IN_COMMUNITY");
        }
      } else {
        const org = await this.repo.findOrganizationById(params.organizationId);
        if (!org || org.status !== "active") {
          return err("Comunidad no encontrada.", "ORGANIZATION_NOT_FOUND");
        }
        if (org.visibility !== "request_to_join") {
          return err("Esta comunidad es privada y solo acepta ingreso por invitación o código.", "COMMUNITY_PRIVATE");
        }
        const alreadyMember = this.repo.findMembershipInOrg
          ? await this.repo.findMembershipInOrg(params.organizationId, params.clientId)
          : null;
        if (alreadyMember) {
          return err("Tu comercio ya es miembro activo de esta comunidad.", "ALREADY_COMMUNITY_MEMBER");
        }
      }

      const request = await this.repo.createJoinRequest({
        organizationId: params.organizationId,
        clientId: params.clientId,
        requestedByUserId: params.requestedByUserId,
      });

      return ok({ requestId: request.id, status: request.status });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[CommunitiesGovernance] Error al solicitar unión: ${msg}`, error);
      return err(msg, "JOIN_REQUEST_ERROR");
    }
  }

  /**
   * Decide sobre una solicitud de admisión (`ADM-001 T-20, RF-08.6`).
   * Solo el `tenant_owner` del originador puede aceptar solicitudes.
   */
  async decideJoinRequest(params: {
    requestId: string;
    decision: "accepted" | "rejected";
    deciderClientId: string;
    decidedByUserId: string;
  }): Promise<Result<{ status: string }>> {
    try {
      const request = await this.repo.findJoinRequestById(params.requestId);
      if (!request || request.status !== "pending") {
        return err("Solicitud de admisión no encontrada o ya resuelta.", "REQUEST_NOT_FOUND");
      }

      const org = await this.repo.findOrganizationById(request.organizationId);
      if (!org) {
        return err("Organización no encontrada.", "ORGANIZATION_NOT_FOUND");
      }

      // Regla RF-08.6: Solo el originador acepta solicitudes (los co-líderes no admiten)
      if (org.originatorClientId !== params.deciderClientId) {
        return err(
          "Solo el inquilino originador posee permisos para admitir nuevos miembros.",
          "UNAUTHORIZED_ORIGINATOR_ONLY",
        );
      }

      await this.repo.updateJoinRequestStatus(
        params.requestId,
        params.decision,
        params.decidedByUserId,
      );

      if (params.decision === "accepted") {
        await this.repo.addMember({
          organizationId: org.id,
          clientId: request.clientId,
          role: "member",
          createdByUserId: params.decidedByUserId,
        });
        void this.notifyJoinAccepted(request.clientId, org, params.requestId);
      }

      appLogger.info("[CommunitiesGovernance] Solicitud de admisión resuelta", {
        requestId: params.requestId,
        decision: params.decision,
        clientId: request.clientId,
      });

      return ok({ status: params.decision });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[CommunitiesGovernance] Error al decidir solicitud de admisión: ${msg}`, error);
      return err(msg, "DECIDE_REQUEST_ERROR");
    }
  }

  private async notifyJoinAccepted(
    clientId: string,
    org: Organization,
    requestId: string,
  ): Promise<void> {
    try {
      const info = this.repo.getClientBasicInfo
        ? await this.repo.getClientBasicInfo(clientId)
        : null;
      const dispatcher = getNotificationDispatcherService();
      await dispatcher.dispatchTenantNotification({
        clientId,
        eventKey: "community.join_accepted",
        variables: {
          user_name: info?.displayName || "Comercio",
          community_name: org.name,
          community_url: "/workspace/community",
        },
        idempotencyKey: `join-accepted:${requestId}`,
        inAppPayload: {
          title: `Bienvenido a ${org.name}`,
          body: `Tu solicitud para unirte a la comunidad ${org.name} fue aceptada.`,
          severity: "success",
          actionUrl: "/workspace/community",
        },
      });
    } catch {
      // No bloqueante
    }
  }

  /**
   * Promueve un miembro a co-líder (`ADM-001 T-20, RF-08.2`).
   * Solo el inquilino originador puede iniciar la promoción.
   */
  async promoteMemberToCoLeader(params: {
    organizationId: string;
    originatorClientId: string;
    targetClientId: string;
    promotedByUserId: string;
  }): Promise<Result<{ promotionId: string; status: string }>> {
    try {
      const org = await this.repo.findOrganizationById(params.organizationId);
      if (!org || org.originatorClientId !== params.originatorClientId) {
        return err(
          "Solo el inquilino originador puede promover miembros a co-líderes.",
          "UNAUTHORIZED_ORIGINATOR_ONLY",
        );
      }

      const promo = await this.repo.createPromotion({
        organizationId: params.organizationId,
        targetClientId: params.targetClientId,
        promotedByClientId: params.originatorClientId,
        createdByUserId: params.promotedByUserId,
      });

      void this.notifyPromotionProposed(params.targetClientId, org, promo.id);

      return ok({ promotionId: promo.id, status: promo.status });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[CommunitiesGovernance] Error al promover a co-líder: ${msg}`, error);
      return err(msg, "PROMOTION_ERROR");
    }
  }

  private async notifyPromotionProposed(
    targetClientId: string,
    org: Organization,
    promotionId: string,
  ): Promise<void> {
    try {
      const info = this.repo.getClientBasicInfo
        ? await this.repo.getClientBasicInfo(targetClientId)
        : null;
      const dispatcher = getNotificationDispatcherService();
      await dispatcher.dispatchTenantNotification({
        clientId: targetClientId,
        eventKey: "community.role_promoted",
        variables: {
          user_name: info?.displayName || "Comercio",
          community_name: org.name,
          role: "Co-Líder (Pendiente de Aceptación)",
          community_url: "/workspace/community",
        },
        idempotencyKey: `promo-proposed:${promotionId}`,
        inAppPayload: {
          title: `Propuesta a Co-Líder en ${org.name}`,
          body: `Te propusieron asumir el rol de Co-Líder en ${org.name}. Acepta o rechaza desde Comunidad.`,
          severity: "info",
          actionUrl: "/workspace/community",
        },
      });
    } catch {
      // No bloqueante
    }
  }

  /**
   * Acepta formalmente la promoción a co-líder (`ADM-001 T-20, RF-08.2`).
   * Requiere aceptación expresa del `tenant_owner` del inquilino promovido.
   */
  async acceptPromotion(params: {
    promotionId: string;
    targetClientId: string;
    acceptedByUserId: string;
  }): Promise<Result<{ status: string }>> {
    try {
      const promo = await this.repo.findPromotionById(params.promotionId);
      if (!promo || promo.status !== "pending") {
        return err("Propuesta de promoción no encontrada o ya resuelta.", "PROMOTION_NOT_FOUND");
      }

      if (promo.targetClientId !== params.targetClientId) {
        return err("No está autorizado para responder a esta promoción.", "UNAUTHORIZED_TARGET_MISMATCH");
      }

      await this.repo.updatePromotionStatus(params.promotionId, "accepted", params.acceptedByUserId);
      await this.repo.updateMemberRole(promo.organizationId, promo.targetClientId, "co_leader");

      appLogger.info("[CommunitiesGovernance] Promoción a co-líder aceptada formalmente", {
        organizationId: promo.organizationId,
        clientId: promo.targetClientId,
      });

      return ok({ status: "accepted" });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[CommunitiesGovernance] Error al aceptar promoción: ${msg}`, error);
      return err(msg, "ACCEPT_PROMOTION_ERROR");
    }
  }

  /**
   * Rechaza la promoción a co-líder manteniendo la membresía regular.
   */
  async rejectPromotion(params: {
    promotionId: string;
    targetClientId: string;
    rejectedByUserId: string;
  }): Promise<Result<{ status: string }>> {
    try {
      const promo = await this.repo.findPromotionById(params.promotionId);
      if (!promo || promo.status !== "pending") {
        return err("Propuesta de promoción no encontrada o ya resuelta.", "PROMOTION_NOT_FOUND");
      }
      if (promo.targetClientId !== params.targetClientId) {
        return err("No está autorizado para responder a esta promoción.", "UNAUTHORIZED_TARGET_MISMATCH");
      }
      await this.repo.updatePromotionStatus(params.promotionId, "rejected", params.rejectedByUserId);
      return ok({ status: "rejected" });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return err(msg, "REJECT_PROMOTION_ERROR");
    }
  }

  /**
   * Retira/suspende a un miembro de la comunidad conservando sus clones (solo `originator`).
   */
  async removeMember(params: {
    organizationId: string;
    actorClientId: string;
    targetClientId: string;
    actorUserId: string;
  }): Promise<Result<{ status: string }>> {
    try {
      const org = await this.repo.findOrganizationById(params.organizationId);
      if (!org) {
        return err("Comunidad no encontrada.", "ORGANIZATION_NOT_FOUND");
      }
      if (org.originatorClientId !== params.actorClientId) {
        return err("Solo el originador puede retirar miembros.", "UNAUTHORIZED_ORIGINATOR_ONLY");
      }
      if (params.targetClientId === org.originatorClientId) {
        return err("El originador no puede expulsarse a sí mismo.", "CANNOT_REMOVE_ORIGINATOR");
      }
      if (this.repo.setMemberSuspended) {
        await this.repo.setMemberSuspended(params.organizationId, params.targetClientId, params.actorUserId);
      } else {
        await this.repo.setMemberLeft(params.organizationId, params.targetClientId);
      }
      return ok({ status: "suspended" });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return err(msg, "REMOVE_MEMBER_ERROR");
    }
  }

  /**
   * Desvinculación voluntaria de una comunidad conservando datos y clones (`ADM-001 RF-08.5`).
   */
  async leaveOrganization(params: {
    organizationId: string;
    clientId: string;
  }): Promise<Result<{ status: string }>> {
    try {
      if (this.repo.supportsMultiCommunity) {
        const org = await this.repo.findOrganizationById(params.organizationId);
        if (org && org.originatorClientId === params.clientId) {
          return err(
            "Como fundador de la comunidad no puedes abandonarla sin transferirla o suspenderla.",
            "ORIGINATOR_CANNOT_LEAVE",
          );
        }
      }
      await this.repo.setMemberLeft(params.organizationId, params.clientId);

      appLogger.info("[CommunitiesGovernance] Inquilino desvinculado de la comunidad", {
        organizationId: params.organizationId,
        clientId: params.clientId,
      });

      return ok({ status: "left" });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[CommunitiesGovernance] Error al desvincularse de organización: ${msg}`, error);
      return err(msg, "LEAVE_ORGANIZATION_ERROR");
    }
  }
}

let defaultGovernanceService: CommunitiesGovernanceService | null = null;

/**
 * Retorna la instancia singleton de {@link CommunitiesGovernanceService} respaldada por PostgreSQL (`SPEC-15`).
 */
export function getCommunitiesGovernanceService(): CommunitiesGovernanceService {
  if (!defaultGovernanceService) {
    defaultGovernanceService = new CommunitiesGovernanceService(
      new DrizzleCommunitiesGovernanceRepository(),
    );
  }
  return defaultGovernanceService;
}
