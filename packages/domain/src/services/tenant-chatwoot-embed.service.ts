import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { withTenantCellTransaction } from "../db/cell-client";
import { chatwootAccounts } from "../db/schemas/admin/chatwoot-media-onboarding";
import { cellTenantUsers } from "../db/schemas/tenant/tenancy-catalog";
import {
  ChatwootHttpPlatformGateway,
  type IChatwootPlatformGateway,
} from "./chatwoot-provisioning.service";
import { appLogger } from "../utils/logger";
import { env } from "../utils/env";

/**
 * Estados posibles de la bandeja de conversaciones del comercio en `/workspace/conversations` (`SPEC-13`).
 */
export type WorkspaceConversationsPageStatus =
  | "ready"
  | "no_capability"
  | "access_denied"
  | "not_provisioned"
  | "provisioning"
  | "suspended"
  | "failed";

/**
 * Resultado del preflight server-side para renderizar `/workspace/conversations` sin exponer errores en el iframe.
 */
export interface WorkspaceConversationsPageState {
  status: WorkspaceConversationsPageStatus;
  accountId: number | null;
  isOwner: boolean;
}

/**
 * Códigos de error controlados para el flujo SSO del workspace (`SPEC-13`).
 */
export type TenantChatwootEmbedErrorCode =
  | "FORBIDDEN_NO_CLIENT"
  | "FORBIDDEN_NO_CAPABILITY"
  | "FORBIDDEN_CHATWOOT_ACCESS"
  | "CHATWOOT_ACCOUNT_MISMATCH"
  | "CHATWOOT_ACCOUNT_NOT_ACTIVE"
  | "CHATWOOT_CONFIG_MISSING"
  | "CHATWOOT_SSO_UNAVAILABLE";

/**
 * Fila mínima consultada en `admin.chatwoot_accounts`.
 */
export interface TenantChatwootAccountSummary {
  state: string;
  chatwootAccountId: number | null;
}

/**
 * Fila mínima de membresía consultada en `cell_tenant_users`.
 */
export interface TenantChatwootMembershipSummary {
  status: string;
  grantChatwootAccess: boolean;
  chatwootAgentId?: number | null;
}

/**
 * Dependencias inyectables de {@link TenantChatwootEmbedService} para pruebas unitarias aisladas.
 */
export interface TenantChatwootEmbedDeps {
  findAccountByClientId?: (clientId: string) => Promise<TenantChatwootAccountSummary | null>;
  findCellMembership?: (
    clientId: string,
    userId: string,
  ) => Promise<TenantChatwootMembershipSummary | null>;
  updateCellChatwootAgentId?: (
    clientId: string,
    userId: string,
    chatwootUserId: number,
  ) => Promise<void>;
  createGateway?: () => IChatwootPlatformGateway;
  resolvePublicBaseUrl?: () => string | undefined;
}

/**
 * Parámetros de entrada para resolver el estado de página de `/workspace/conversations`.
 */
export interface ResolveWorkspacePageStateInput {
  clientId: string | null | undefined;
  userId: string;
  role?: string | null;
  effectiveRoles?: string[] | null;
  hasCapability: boolean;
}

/**
 * Parámetros de entrada para emitir la redirección SSO HTTP 307 hacia el dashboard de Chatwoot del comercio.
 */
export interface ResolveWorkspaceEmbedRedirectInput {
  clientId: string | null | undefined;
  user: {
    id: string;
    email: string;
    displayName?: string | null;
  };
  role?: string | null;
  effectiveRoles?: string[] | null;
  hasCapability: boolean;
  publicBaseUrl?: string | null;
  requestedAccountId?: string | null;
  requestId?: string;
}

/**
 * Resultado discriminado de {@link TenantChatwootEmbedService.resolveWorkspaceEmbedRedirect}.
 */
export type ResolveWorkspaceEmbedRedirectResult =
  | {
      ok: true;
      data: {
        redirectUrl: string;
        targetPath: string;
        accountId: number;
        chatwootUserId: number;
        mappedRole: "administrator" | "agent";
      };
    }
  | {
      ok: false;
      status: 403 | 404 | 502;
      code: TenantChatwootEmbedErrorCode;
      error: string;
    };

/**
 * Determina si el usuario en sesión tiene rol propietario del comercio (`tenant_owner`).
 */
export function isTenantOwnerRole(
  role?: string | null,
  effectiveRoles?: string[] | null,
): boolean {
  const roles = Array.isArray(effectiveRoles) ? effectiveRoles : [];
  return roles.includes("tenant_owner") || role === "tenant_owner";
}

/**
 * Normaliza y valida la URL pública base de Chatwoot (`NEXT_PUBLIC_CHATWOOT_URL`) sin puertos hardcoded.
 */
function normalizeValidChatwootPublicUrl(rawUrl?: string | null): string | null {
  const trimmed = rawUrl?.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return trimmed.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

/**
 * Servicio de dominio dedicado al acceso embebido de Chatwoot para inquilinos (`SPEC-13`).
 *
 * Aísla el preflight de estados de `/workspace/conversations` y la emisión de redirección SSO
 * `scope=workspace` respecto al flujo administrativo SaaS (`scope=admin`).
 */
export class TenantChatwootEmbedService {
  private readonly findAccountByClientId: (
    clientId: string,
  ) => Promise<TenantChatwootAccountSummary | null>;
  private readonly findCellMembership: (
    clientId: string,
    userId: string,
  ) => Promise<TenantChatwootMembershipSummary | null>;
  private readonly updateCellChatwootAgentId: (
    clientId: string,
    userId: string,
    chatwootUserId: number,
  ) => Promise<void>;
  private readonly createGateway: () => IChatwootPlatformGateway;
  private readonly resolvePublicBaseUrl: () => string | undefined;

  constructor(deps: TenantChatwootEmbedDeps = {}) {
    this.findAccountByClientId =
      deps.findAccountByClientId ??
      (async (clientId: string) => {
        const db = getDb();
        const [row] = await db
          .select({
            state: chatwootAccounts.state,
            chatwootAccountId: chatwootAccounts.chatwootAccountId,
          })
          .from(chatwootAccounts)
          .where(eq(chatwootAccounts.clientId, clientId))
          .limit(1);
        return row ?? null;
      });

    this.findCellMembership =
      deps.findCellMembership ??
      (async (clientId: string, userId: string) => {
        return await withTenantCellTransaction(clientId, async (tx) => {
          const [row] = await tx
            .select({
              status: cellTenantUsers.status,
              grantChatwootAccess: cellTenantUsers.grantChatwootAccess,
              chatwootAgentId: cellTenantUsers.chatwootAgentId,
            })
            .from(cellTenantUsers)
            .where(
              and(eq(cellTenantUsers.clientId, clientId), eq(cellTenantUsers.userId, userId)),
            )
            .orderBy(desc(cellTenantUsers.joinedAt))
            .limit(1);
          return row ?? null;
        });
      });

    this.updateCellChatwootAgentId =
      deps.updateCellChatwootAgentId ??
      (async (clientId: string, userId: string, chatwootUserId: number) => {
        try {
          await withTenantCellTransaction(clientId, async (tx) => {
            await tx
              .update(cellTenantUsers)
              .set({
                chatwootAgentId: chatwootUserId,
                updatedAt: new Date(),
                updatedBy: "spec13_chatwoot_embed_sync",
              })
              .where(
                and(eq(cellTenantUsers.clientId, clientId), eq(cellTenantUsers.userId, userId)),
              );
          });
        } catch {
          // Fail-soft: no interrumpir el handoff SSO si el espejo celular no puede escribirse
        }
      });

    this.createGateway = deps.createGateway ?? (() => new ChatwootHttpPlatformGateway());
    this.resolvePublicBaseUrl = deps.resolvePublicBaseUrl ?? (() => env.NEXT_PUBLIC_CHATWOOT_URL);
  }

  /**
   * Resuelve el estado operativo de `/workspace/conversations` antes de montar el iframe.
   */
  async resolveWorkspacePageState(
    input: ResolveWorkspacePageStateInput,
  ): Promise<WorkspaceConversationsPageState> {
    const isOwner = isTenantOwnerRole(input.role, input.effectiveRoles);

    if (!input.hasCapability || !input.clientId) {
      return {
        status: "no_capability",
        accountId: null,
        isOwner,
      };
    }

    if (!isOwner) {
      try {
        const membership = await this.findCellMembership(input.clientId, input.userId);
        if (!membership || membership.status !== "active" || !membership.grantChatwootAccess) {
          return {
            status: "access_denied",
            accountId: null,
            isOwner: false,
          };
        }
      } catch (error) {
        appLogger.warn("tenant.chatwoot.membership_preflight_failed", {
          clientId: input.clientId,
          userId: input.userId,
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          status: "access_denied",
          accountId: null,
          isOwner: false,
        };
      }
    }

    const account = await this.findAccountByClientId(input.clientId);
    if (!account) {
      return {
        status: "not_provisioned",
        accountId: null,
        isOwner,
      };
    }

    if (account.state === "pending" || account.state === "provisioning") {
      return {
        status: "provisioning",
        accountId: account.chatwootAccountId,
        isOwner,
      };
    }

    if (account.state === "suspended") {
      return {
        status: "suspended",
        accountId: account.chatwootAccountId,
        isOwner,
      };
    }

    if (account.state === "failed") {
      return {
        status: "failed",
        accountId: account.chatwootAccountId,
        isOwner,
      };
    }

    if (account.state !== "active" || account.chatwootAccountId === null) {
      return {
        status: "not_provisioned",
        accountId: null,
        isOwner,
      };
    }

    return {
      status: "ready",
      accountId: account.chatwootAccountId,
      isOwner,
    };
  }

  /**
   * Valida permisos de celda/plan y resuelve la URL final de redirección SSO HTTP 307 para `scope=workspace`.
   */
  async resolveWorkspaceEmbedRedirect(
    input: ResolveWorkspaceEmbedRedirectInput,
  ): Promise<ResolveWorkspaceEmbedRedirectResult> {
    if (!input.clientId) {
      return {
        ok: false,
        status: 403,
        code: "FORBIDDEN_NO_CLIENT",
        error: "No hay un comercio activo asignado a la sesión actual.",
      };
    }

    if (!input.hasCapability) {
      return {
        ok: false,
        status: 403,
        code: "FORBIDDEN_NO_CAPABILITY",
        error: "Tu plan comercial no incluye buzones de atención omnicanal.",
      };
    }

    const cwAccount = await this.findAccountByClientId(input.clientId);
    const requestedAccountRaw = input.requestedAccountId?.trim();

    if (requestedAccountRaw) {
      const parsedRequested = Number(requestedAccountRaw);
      const isPositiveInt = Number.isInteger(parsedRequested) && parsedRequested > 0;
      if (
        !isPositiveInt ||
        !cwAccount ||
        cwAccount.chatwootAccountId === null ||
        parsedRequested !== cwAccount.chatwootAccountId
      ) {
        appLogger.warn("tenant.chatwoot.account_mismatch", {
          requestId: input.requestId,
          clientId: input.clientId,
          userId: input.user.id,
          requestedAccountId: requestedAccountRaw,
          resolvedAccountId: cwAccount?.chatwootAccountId ?? null,
        });
        return {
          ok: false,
          status: 403,
          code: "CHATWOOT_ACCOUNT_MISMATCH",
          error: "Acceso denegado: la cuenta solicitada no corresponde al comercio en sesión.",
        };
      }
    }

    if (!cwAccount || cwAccount.state !== "active" || cwAccount.chatwootAccountId === null) {
      return {
        ok: false,
        status: 404,
        code: "CHATWOOT_ACCOUNT_NOT_ACTIVE",
        error:
          "La bandeja de atención de este comercio no se encuentra activa o está en proceso de aprovisionamiento.",
      };
    }

    const isOwner = isTenantOwnerRole(input.role, input.effectiveRoles);
    const mappedRole: "administrator" | "agent" = isOwner ? "administrator" : "agent";

    let existingMembership: TenantChatwootMembershipSummary | null = null;
    if (!isOwner) {
      existingMembership = await this.findCellMembership(input.clientId, input.user.id);
      if (
        !existingMembership ||
        existingMembership.status !== "active" ||
        !existingMembership.grantChatwootAccess
      ) {
        return {
          ok: false,
          status: 403,
          code: "FORBIDDEN_CHATWOOT_ACCESS",
          error: "Tu usuario no tiene habilitado el acceso a la bandeja de atención omnicanal.",
        };
      }
    }

    const normalizedPublicUrl = normalizeValidChatwootPublicUrl(
      input.publicBaseUrl ?? this.resolvePublicBaseUrl(),
    );
    if (!normalizedPublicUrl) {
      appLogger.error(
        "tenant.chatwoot.embed_failed",
        new Error("NEXT_PUBLIC_CHATWOOT_URL no configurada o inválida"),
        {
          requestId: input.requestId,
          clientId: input.clientId,
          chatwootAccountId: cwAccount.chatwootAccountId,
        },
      );
      return {
        ok: false,
        status: 502,
        code: "CHATWOOT_CONFIG_MISSING",
        error: "La configuración pública de la bandeja de conversaciones no está disponible.",
      };
    }

    try {
      const gateway = this.createGateway();
      if (!gateway.ensureMemberUserInAccount || !gateway.getUserSsoLoginUrl) {
        throw new Error("Gateway de Chatwoot sin soporte de enlace SSO para operadores.");
      }

      const memberUser = await gateway.ensureMemberUserInAccount({
        accountId: cwAccount.chatwootAccountId,
        email: input.user.email,
        name: input.user.displayName || "Operador",
        role: mappedRole,
      });

      if (
        !isOwner &&
        existingMembership &&
        existingMembership.chatwootAgentId !== memberUser.userId
      ) {
        await this.updateCellChatwootAgentId(
          input.clientId,
          input.user.id,
          memberUser.userId,
        );
      }

      const ssoRes = await gateway.getUserSsoLoginUrl({ userId: memberUser.userId });
      const ssoUrl = new URL(ssoRes.url);

      const targetPath = `/app/accounts/${cwAccount.chatwootAccountId}/dashboard`;
      ssoUrl.searchParams.set("redirect_to", targetPath);
      ssoUrl.searchParams.set("sso_account_id", String(cwAccount.chatwootAccountId));

      const redirectUrl = `${normalizedPublicUrl}${ssoUrl.pathname}${ssoUrl.search}`;

      appLogger.info("tenant.chatwoot.embed_resolved", {
        requestId: input.requestId,
        clientId: input.clientId,
        userId: input.user.id,
        chatwootUserId: memberUser.userId,
        chatwootAccountId: cwAccount.chatwootAccountId,
        role: mappedRole,
      });

      return {
        ok: true,
        data: {
          redirectUrl,
          targetPath,
          accountId: cwAccount.chatwootAccountId,
          chatwootUserId: memberUser.userId,
          mappedRole,
        },
      };
    } catch (error) {
      appLogger.error("tenant.chatwoot.embed_failed", error, {
        requestId: input.requestId,
        clientId: input.clientId,
        userId: input.user.id,
        chatwootAccountId: cwAccount.chatwootAccountId,
      });
      return {
        ok: false,
        status: 502,
        code: "CHATWOOT_SSO_UNAVAILABLE",
        error:
          "No fue posible conectar con la bandeja de conversaciones en este momento. Intenta nuevamente.",
      };
    }
  }
}

/**
 * Instancia compartida por defecto de {@link TenantChatwootEmbedService}.
 */
export const tenantChatwootEmbedService = new TenantChatwootEmbedService();
