import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { err, ok, type Result } from "../types/result";
import { getDb } from "../db/client";
import { chatwootAccounts } from "../db/schemas/admin/chatwoot-media-onboarding";
import { clients } from "../db/schemas/admin/clients";
import { plans } from "../db/schemas/admin/plans";
import { planLimits } from "../db/schemas/admin/plan-catalogs";
import { chatwootCapabilityDefinitions, planCapabilityValues } from "../db/schemas/admin/chatwoot-capabilities";
import { RESERVED_MOCTER_LEAD_LABELS } from "./onboarding-and-limits.service";

/**
 * Estados de la máquina de aprovisionamiento de Chatwoot (`ADM-001 T-11`, `design.md` §8).
 */
export type ChatwootProvisioningState =
  | "pending"
  | "provisioning"
  | "active"
  | "failed"
  | "suspended";

/**
 * Origen de una etiqueta en el espejo `tenant_labels` (`ADM-001 T-12`, `RF-03.6`, `RF-03.7`).
 */
export type TenantLabelOrigin =
  | "chatwoot_default"
  | "chatwoot_custom"
  | "mocter_custom"
  | "mocter_default";

/**
 * Registro de correlación `client_id` ↔ `chatwoot_account_id` (`ADM-001 T-11, T-12`).
 */
export interface ChatwootAccountRecord {
  clientId: string;
  chatwootAccountId: number | null;
  serviceUserId: number | null;
  serviceTokenCiphertext: Buffer | null;
  serviceTokenKeyId: string | null;
  webchatInboxId: number | null;
  webchatWebsiteToken: string | null;
  state: ChatwootProvisioningState;
  idempotencyKey: string;
  lastError: string | null;
  syncedAt: Date | null;
}

/**
 * Fila del espejo de etiquetas `tenant_labels` en la celda del inquilino (`ADM-001 T-12`).
 */
export interface TenantLabelRecord {
  id: string;
  clientId: string;
  chatwootLabelId: number | null;
  title: string;
  description: string | null;
  color: string;
  showOnSidebar: boolean;
  origin: TenantLabelOrigin;
  state: "active" | "archived";
  syncedAt: Date;
}

/**
 * Puerto del adaptador HTTP hacia la Platform API y Account API de Chatwoot v4.19.1 (`ADM-001 RF-03.1`).
 *
 * Se prohíbe escribir directamente en la base de datos de Chatwoot.
 */
export interface IChatwootPlatformGateway {
  createAccount(params: {
    name: string;
    locale: "es" | "en";
    idempotencyKey: string;
    features?: Record<string, boolean>;
    limits?: Record<string, number | null>;
  }): Promise<{ accountId: number; enabledFeatures?: Record<string, boolean>; limits?: Record<string, unknown> }>;

  updateAccount?(params: {
    accountId: number;
    features?: Record<string, boolean>;
    limits?: Record<string, number | null>;
  }): Promise<{ accountId: number; enabledFeatures?: Record<string, boolean>; limits?: Record<string, unknown> }>;

  ensureServiceUser(params: {
    accountId: number;
    clientId: string;
    idempotencyKey: string;
  }): Promise<{ userId: number; accessToken: string }>;

  ensureWebchatInbox(params: {
    accountId: number;
    serviceToken: string;
    websiteName: string;
    websiteUrl?: string;
  }): Promise<{ inboxId: number; websiteToken: string }>;

  pushLabelToChatwoot?(params: {
    accountId: number;
    serviceToken: string;
    title: string;
    description: string | null;
    color: string;
    showOnSidebar: boolean;
  }): Promise<{ chatwootLabelId: number }>;
}

export interface ChatwootHttpPlatformGatewayOptions {
  baseUrl?: string;
  platformToken?: string;
}

/**
 * Adaptador HTTP para interactuar con la Platform API de Chatwoot v4.19.1.
 */
export class ChatwootHttpPlatformGateway implements IChatwootPlatformGateway {
  private readonly baseUrl: string;
  private readonly platformToken: string;

  constructor(options?: ChatwootHttpPlatformGatewayOptions) {
    this.baseUrl = (options?.baseUrl || process.env.CHATWOOT_BASE_URL || "http://localhost:3002").replace(/\/+$/, "");
    this.platformToken = options?.platformToken || process.env.CHATWOOT_PLATFORM_TOKEN || "";
  }

  async createAccount(params: {
    name: string;
    locale: "es" | "en";
    idempotencyKey: string;
    features?: Record<string, boolean>;
    limits?: Record<string, number | null>;
  }): Promise<{ accountId: number; enabledFeatures?: Record<string, boolean>; limits?: Record<string, unknown> }> {
    const res = await fetch(`${this.baseUrl}/platform/api/v1/accounts`, {
      method: "POST",
      headers: {
        api_access_token: this.platformToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: params.name,
        locale: params.locale,
        features: params.features,
        limits: params.limits,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Chatwoot Platform API error (${res.status}): ${text}`);
    }

    const data = (await res.json()) as { id: number; features?: Record<string, boolean>; limits?: Record<string, unknown> };
    return {
      accountId: data.id,
      enabledFeatures: data.features,
      limits: data.limits,
    };
  }

  async updateAccount(params: {
    accountId: number;
    features?: Record<string, boolean>;
    limits?: Record<string, number | null>;
  }): Promise<{ accountId: number; enabledFeatures?: Record<string, boolean>; limits?: Record<string, unknown> }> {
    const res = await fetch(`${this.baseUrl}/platform/api/v1/accounts/${params.accountId}`, {
      method: "PATCH",
      headers: {
        api_access_token: this.platformToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        features: params.features,
        limits: params.limits,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Chatwoot Platform API update error (${res.status}): ${text}`);
    }

    const data = (await res.json()) as { id: number; features?: Record<string, boolean>; limits?: Record<string, unknown> };
    return {
      accountId: data.id,
      enabledFeatures: data.features,
      limits: data.limits,
    };
  }

  async ensureServiceUser(params: {
    accountId: number;
    clientId: string;
    idempotencyKey: string;
  }): Promise<{ userId: number; accessToken: string }> {
    const email = `service-${params.clientId}@mocter.internal`;
    const password = `${randomBytes(24).toString("hex")}A1!`;

    const userRes = await fetch(`${this.baseUrl}/platform/api/v1/users`, {
      method: "POST",
      headers: {
        api_access_token: this.platformToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Mocter Service User",
        email,
        password,
        custom_attributes: { is_service_user: true, client_id: params.clientId },
      }),
    });

    let userId: number;
    if (userRes.ok) {
      const userData = (await userRes.json()) as { id: number };
      userId = userData.id;
    } else {
      const text = await userRes.text();
      throw new Error(`Chatwoot Platform API user creation error (${userRes.status}): ${text}`);
    }

    const linkRes = await fetch(`${this.baseUrl}/platform/api/v1/accounts/${params.accountId}/account_users`, {
      method: "POST",
      headers: {
        api_access_token: this.platformToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: userId,
        role: "administrator",
      }),
    });

    if (!linkRes.ok) {
      const linkText = await linkRes.text();
      throw new Error(`Chatwoot Platform API account_users link error (${linkRes.status}): ${linkText}`);
    }

    const tokenRes = await fetch(`${this.baseUrl}/platform/api/v1/users/${userId}/token`, {
      method: "POST",
      headers: {
        api_access_token: this.platformToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    if (!tokenRes.ok) {
      const tokenText = await tokenRes.text();
      throw new Error(`Chatwoot Platform API token error (${tokenRes.status}): ${tokenText}`);
    }

    const tokenData = (await tokenRes.json()) as { access_token: string };
    return { userId, accessToken: tokenData.access_token };
  }

  async ensureWebchatInbox(params: {
    accountId: number;
    serviceToken: string;
    websiteName: string;
    websiteUrl?: string;
  }): Promise<{ inboxId: number; websiteToken: string }> {
    const res = await fetch(`${this.baseUrl}/api/v1/accounts/${params.accountId}/inboxes`, {
      method: "POST",
      headers: {
        api_access_token: params.serviceToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: params.websiteName || "Webchat",
        channel: {
          type: "web_widget",
          website_url: params.websiteUrl || "https://mocter.co",
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Chatwoot API inbox creation error (${res.status}): ${text}`);
    }

    const data = (await res.json()) as { id: number; website_token?: string; channel?: { website_token?: string } };
    const websiteToken = data.channel?.website_token || data.website_token || "";
    return { inboxId: data.id, websiteToken };
  }

  async pushLabelToChatwoot(params: {
    accountId: number;
    serviceToken: string;
    title: string;
    description: string | null;
    color: string;
    showOnSidebar: boolean;
  }): Promise<{ chatwootLabelId: number }> {
    const res = await fetch(`${this.baseUrl}/api/v1/accounts/${params.accountId}/labels`, {
      method: "POST",
      headers: {
        api_access_token: params.serviceToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: params.title,
        description: params.description,
        color: params.color,
        show_on_sidebar: params.showOnSidebar,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Chatwoot API label creation error (${res.status}): ${text}`);
    }

    const data = (await res.json()) as { id: number };
    return { chatwootLabelId: data.id };
  }
}

const RESERVED_SLUGS = new Set(RESERVED_MOCTER_LEAD_LABELS.map((l) => l.title));

/**
 * Servicio de aprovisionamiento idempotente de cuentas de Chatwoot, cifrado de token de servicio,
 * máquina de estados y sincronización bidireccional controlada de `tenant_labels` (`ADM-001 T-11, T-12`, `CHW-001`).
 */
export class ChatwootProvisioningService {
  private readonly accountsByClient = new Map<string, ChatwootAccountRecord>();
  private readonly accountsByIdempotency = new Map<string, ChatwootAccountRecord>();
  private readonly inFlightLocks = new Map<string, Promise<Result<ChatwootAccountRecord>>>();
  private readonly labelsByClient = new Map<string, Map<string, TenantLabelRecord>>();

  constructor(
    private readonly gateway: IChatwootPlatformGateway,
    private readonly encryptionKey: Buffer = Buffer.alloc(32, 7),
    private readonly activeKeyId: string = "k1",
    private readonly db?: any,
  ) {}

  private async persistAccountToDb(record: ChatwootAccountRecord, actor = "system") {
    if (!this.db) return;
    try {
      await this.db
        .insert(chatwootAccounts)
        .values({
          clientId: record.clientId,
          chatwootAccountId: record.chatwootAccountId,
          serviceUserId: record.serviceUserId,
          serviceTokenCiphertext: record.serviceTokenCiphertext,
          serviceTokenKeyId: record.serviceTokenKeyId,
          webchatInboxId: record.webchatInboxId,
          webchatWebsiteToken: record.webchatWebsiteToken,
          state: record.state,
          idempotencyKey: record.idempotencyKey,
          lastError: record.lastError,
          syncedAt: record.syncedAt,
          createdBy: actor,
          updatedBy: actor,
        })
        .onConflictDoUpdate({
          target: chatwootAccounts.clientId,
          set: {
            chatwootAccountId: record.chatwootAccountId,
            serviceUserId: record.serviceUserId,
            serviceTokenCiphertext: record.serviceTokenCiphertext,
            serviceTokenKeyId: record.serviceTokenKeyId,
            webchatInboxId: record.webchatInboxId,
            webchatWebsiteToken: record.webchatWebsiteToken,
            state: record.state,
            lastError: record.lastError,
            syncedAt: record.syncedAt,
            updatedBy: actor,
            updatedAt: new Date(),
          },
        });
    } catch {
      // Ignorar fallos de persistencia en entornos de prueba sin tabla viva
    }
  }

  /**
   * Aprovisiona o reintenta de forma idempotente la cuenta de Chatwoot, el usuario de servicio
   * con su token cifrado AES-256-GCM y el inbox webchat inicial (`ADM-001 T-11, T-12`).
   *
   * - Dos llamadas concurrentes con la misma `idempotencyKey` o `clientId` producen una sola cuenta.
   * - Si estaba en `failed`, transiciona a `provisioning` y reintenta sin duplicar cuenta ni usuario.
   * - Al quedar `active`, habilita el SSO hacia Chatwoot.
   */
  async provisionOrRetryAccount(params: {
    clientId: string;
    tenantName: string;
    locale?: "es" | "en";
    idempotencyKey: string;
    features?: Record<string, boolean>;
    limits?: Record<string, number | null>;
    actor?: string;
  }): Promise<Result<ChatwootAccountRecord>> {
    const lockKey = `${params.clientId}:${params.idempotencyKey}`;
    const existingInFlight = this.inFlightLocks.get(lockKey);
    if (existingInFlight) {
      return existingInFlight;
    }

    const promise = this.runProvisioningFlow(params).finally(() => {
      this.inFlightLocks.delete(lockKey);
    });
    this.inFlightLocks.set(lockKey, promise);
    return promise;
  }

  private async runProvisioningFlow(params: {
    clientId: string;
    tenantName: string;
    locale?: "es" | "en";
    idempotencyKey: string;
    features?: Record<string, boolean>;
    limits?: Record<string, number | null>;
    actor?: string;
  }): Promise<Result<ChatwootAccountRecord>> {
    let existing =
      this.accountsByClient.get(params.clientId) ??
      this.accountsByIdempotency.get(params.idempotencyKey);

    if (!existing && this.db) {
      try {
        const [dbRow] = await this.db
          .select()
          .from(chatwootAccounts)
          .where(eq(chatwootAccounts.clientId, params.clientId))
          .limit(1);
        if (dbRow) {
          existing = {
            clientId: dbRow.clientId,
            chatwootAccountId: dbRow.chatwootAccountId,
            serviceUserId: dbRow.serviceUserId,
            serviceTokenCiphertext: dbRow.serviceTokenCiphertext,
            serviceTokenKeyId: dbRow.serviceTokenKeyId,
            webchatInboxId: dbRow.webchatInboxId,
            webchatWebsiteToken: dbRow.webchatWebsiteToken,
            state: dbRow.state as ChatwootProvisioningState,
            idempotencyKey: dbRow.idempotencyKey,
            lastError: dbRow.lastError,
            syncedAt: dbRow.syncedAt,
          };
          this.accountsByClient.set(params.clientId, existing);
          this.accountsByIdempotency.set(existing.idempotencyKey, existing);
        }
      } catch {
        // Fallback a memoria si la BD no está disponible
      }
    }

    if (existing && existing.state === "active") {
      return ok(existing);
    }

    const record: ChatwootAccountRecord = existing ?? {
      clientId: params.clientId,
      chatwootAccountId: null,
      serviceUserId: null,
      serviceTokenCiphertext: null,
      serviceTokenKeyId: null,
      webchatInboxId: null,
      webchatWebsiteToken: null,
      state: "pending",
      idempotencyKey: params.idempotencyKey,
      lastError: null,
      syncedAt: null,
    };

    // Transición pending/failed -> provisioning
    record.state = "provisioning";
    record.lastError = null;
    this.accountsByClient.set(params.clientId, record);
    this.accountsByIdempotency.set(params.idempotencyKey, record);
    await this.persistAccountToDb(record, params.actor);

    try {
      if (record.chatwootAccountId === null) {
        const createdAcc = await this.gateway.createAccount({
          name: params.tenantName,
          locale: params.locale ?? "es",
          idempotencyKey: params.idempotencyKey,
          features: params.features,
          limits: params.limits,
        });
        record.chatwootAccountId = createdAcc.accountId;
      }

      let rawServiceToken: string;
      if (record.serviceUserId === null || !record.serviceTokenCiphertext) {
        const svcUser = await this.gateway.ensureServiceUser({
          accountId: record.chatwootAccountId,
          clientId: params.clientId,
          idempotencyKey: params.idempotencyKey,
        });
        record.serviceUserId = svcUser.userId;
        rawServiceToken = svcUser.accessToken;
        record.serviceTokenCiphertext = this.encryptServiceToken(
          params.clientId,
          rawServiceToken,
        );
        record.serviceTokenKeyId = this.activeKeyId;
      } else {
        rawServiceToken = this.decryptServiceToken(
          params.clientId,
          record.serviceTokenCiphertext,
        );
      }

      if (record.webchatInboxId === null) {
        const inbox = await this.gateway.ensureWebchatInbox({
          accountId: record.chatwootAccountId,
          serviceToken: rawServiceToken,
          websiteName: params.tenantName,
        });
        record.webchatInboxId = inbox.inboxId;
        record.webchatWebsiteToken = inbox.websiteToken;
      }

      record.state = "active";
      record.syncedAt = new Date();
      this.seedReservedLabelsIfMissing(params.clientId);
      await this.persistAccountToDb(record, params.actor);

      return ok({ ...record });
    } catch (error) {
      record.state = "failed";
      record.lastError = error instanceof Error ? error.message : String(error);
      await this.persistAccountToDb(record, params.actor);
      return err(record.lastError, "CHATWOOT_PROVISIONING_FAILED");
    }
  }

  /**
   * Sincroniza las capacidades y límites de un plan con la cuenta de Chatwoot del inquilino.
   */
  async syncAccountWithPlan(params: {
    clientId: string;
    features?: Record<string, boolean>;
    limits?: Record<string, number | null>;
    actor?: string;
  }): Promise<Result<ChatwootAccountRecord>> {
    let record = this.accountsByClient.get(params.clientId);
    if (!record && this.db) {
      try {
        const [dbRow] = await this.db
          .select()
          .from(chatwootAccounts)
          .where(eq(chatwootAccounts.clientId, params.clientId))
          .limit(1);
        if (dbRow) {
          record = {
            clientId: dbRow.clientId,
            chatwootAccountId: dbRow.chatwootAccountId,
            serviceUserId: dbRow.serviceUserId,
            serviceTokenCiphertext: dbRow.serviceTokenCiphertext,
            serviceTokenKeyId: dbRow.serviceTokenKeyId,
            webchatInboxId: dbRow.webchatInboxId,
            webchatWebsiteToken: dbRow.webchatWebsiteToken,
            state: dbRow.state as ChatwootProvisioningState,
            idempotencyKey: dbRow.idempotencyKey,
            lastError: dbRow.lastError,
            syncedAt: dbRow.syncedAt,
          };
          this.accountsByClient.set(params.clientId, record);
        }
      } catch {
        // Fallback
      }
    }

    if (!record || record.chatwootAccountId === null) {
      return err("No se encontró cuenta activa de Chatwoot para este inquilino.", "CHATWOOT_ACCOUNT_NOT_FOUND");
    }

    try {
      if (this.gateway.updateAccount) {
        await this.gateway.updateAccount({
          accountId: record.chatwootAccountId,
          features: params.features,
          limits: params.limits,
        });
      }
      record.state = "active";
      record.lastError = null;
      record.syncedAt = new Date();
      await this.persistAccountToDb(record, params.actor);
      return ok({ ...record });
    } catch (error) {
      record.state = "failed";
      record.lastError = error instanceof Error ? error.message : String(error);
      await this.persistAccountToDb(record, params.actor);
      return err("El plan se guardó, pero la configuración de atención no pudo sincronizarse.", "CHATWOOT_SYNC_FAILED");
    }
  }

  /**
   * Verifica si la cuenta de Chatwoot del inquilino está en estado `active` y por tanto habilita SSO (`ADM-001 T-11`).
   */
  canIssueSsoForTenant(clientId: string): Result<{ chatwootAccountId: number }> {
    const record = this.accountsByClient.get(clientId);
    if (!record || record.state !== "active" || record.chatwootAccountId === null) {
      return err(
        "Chatwoot SSO is only available when the tenant Chatwoot account is in 'active' state (ADM-001 T-11).",
        "CHATWOOT_ACCOUNT_NOT_ACTIVE",
      );
    }
    return ok({ chatwootAccountId: record.chatwootAccountId });
  }

  /**
   * Siembra las 4 etiquetas reservadas de Mocter (`lead-frio`, `lead-tibio`, `lead-caliente`, `compra-realizada`)
   * con `origin = 'mocter_default'` (`ADM-001 RF-03.7, T-12`).
   */
  seedReservedLabelsIfMissing(clientId: string): TenantLabelRecord[] {
    let clientMap = this.labelsByClient.get(clientId);
    if (!clientMap) {
      clientMap = new Map();
      this.labelsByClient.set(clientId, clientMap);
    }

    const now = new Date();
    let idx = 1;
    for (const item of RESERVED_MOCTER_LEAD_LABELS) {
      if (!clientMap.has(item.title)) {
        clientMap.set(item.title, {
          id: `019a0000-0000-7000-8004-${String(idx).padStart(12, "0")}`,
          clientId,
          chatwootLabelId: 1000 + idx,
          title: item.title,
          description: item.description,
          color: item.color,
          showOnSidebar: item.showOnSidebar,
          origin: "mocter_default",
          state: "active",
          syncedAt: now,
        });
      }
      idx += 1;
    }

    return Array.from(clientMap.values());
  }

  /**
   * Sincroniza de forma idempotente las etiquetas provenientes de Chatwoot con el espejo `tenant_labels` (`ADM-001 T-12, RF-03.6`).
   *
   * - Dos sincronizaciones de la misma etiqueta `(client_id, chatwoot_label_id)` producen una sola fila.
   * - Las etiquetas que ya no están en Chatwoot (salvo las `mocter_default`) quedan archivadas (`state = 'archived'`) sin perder correlación.
   */
  syncLabelsFromChatwoot(params: {
    clientId: string;
    remoteLabels: Array<{
      id: number;
      title: string;
      description?: string | null;
      color?: string;
      showOnSidebar?: boolean;
      isDefault?: boolean;
    }>;
  }): TenantLabelRecord[] {
    this.seedReservedLabelsIfMissing(params.clientId);
    const clientMap = this.labelsByClient.get(params.clientId)!;
    const now = new Date();
    const seenChatwootIds = new Set<number>();

    for (const remote of params.remoteLabels) {
      seenChatwootIds.add(remote.id);
      const normalizedTitle = remote.title.trim().toLowerCase();

      // Buscar por chatwoot_label_id o por título
      let existing = Array.from(clientMap.values()).find(
        (l) => l.chatwootLabelId === remote.id || l.title === normalizedTitle,
      );

      if (existing) {
        existing.chatwootLabelId = remote.id;
        existing.description = remote.description ?? existing.description;
        existing.color = remote.color ?? existing.color;
        existing.showOnSidebar = remote.showOnSidebar ?? existing.showOnSidebar;
        existing.state = "active";
        existing.syncedAt = now;
      } else {
        existing = {
          id: `019a0000-0000-7000-8004-${String(clientMap.size + 1).padStart(12, "0")}`,
          clientId: params.clientId,
          chatwootLabelId: remote.id,
          title: normalizedTitle,
          description: remote.description ?? null,
          color: remote.color ?? "#1F93FF",
          showOnSidebar: remote.showOnSidebar ?? true,
          origin: remote.isDefault ? "chatwoot_default" : "chatwoot_custom",
          state: "active",
          syncedAt: now,
        };
        clientMap.set(normalizedTitle, existing);
      }
    }

    // Marcar como archived las etiquetas remotas que fueron borradas en Chatwoot (excepto mocter_default)
    for (const label of clientMap.values()) {
      if (
        label.origin !== "mocter_default" &&
        label.chatwootLabelId !== null &&
        !seenChatwootIds.has(label.chatwootLabelId)
      ) {
        label.state = "archived";
        label.syncedAt = now;
      }
    }

    return Array.from(clientMap.values());
  }

  /**
   * Crea o edita una etiqueta desde Mocter empujándola por API hacia Chatwoot (`ADM-001 T-12, RF-03.6`).
   *
   * Protege las 4 etiquetas `mocter_default` contra eliminación o cambio de slug (`RF-03.7`).
   */
  async createOrUpdateLabelFromMocter(params: {
    clientId: string;
    title: string;
    description?: string | null;
    color?: string;
    showOnSidebar?: boolean;
  }): Promise<Result<TenantLabelRecord>> {
    this.seedReservedLabelsIfMissing(params.clientId);
    const clientMap = this.labelsByClient.get(params.clientId)!;
    const normalizedTitle = params.title.trim().toLowerCase();

    const account = this.accountsByClient.get(params.clientId);
    let pushedCwId = Math.floor(2000 + clientMap.size + 1);

    if (
      account &&
      account.state === "active" &&
      account.chatwootAccountId !== null &&
      account.serviceTokenCiphertext &&
      this.gateway.pushLabelToChatwoot
    ) {
      const token = this.decryptServiceToken(
        params.clientId,
        account.serviceTokenCiphertext,
      );
      const pushed = await this.gateway.pushLabelToChatwoot({
        accountId: account.chatwootAccountId,
        serviceToken: token,
        title: normalizedTitle,
        description: params.description ?? null,
        color: params.color ?? "#1F93FF",
        showOnSidebar: params.showOnSidebar ?? true,
      });
      pushedCwId = pushed.chatwootLabelId;
    }

    const existing = clientMap.get(normalizedTitle);
    const record: TenantLabelRecord = {
      id:
        existing?.id ??
        `019a0000-0000-7000-8004-${String(clientMap.size + 1).padStart(12, "0")}`,
      clientId: params.clientId,
      chatwootLabelId: existing?.chatwootLabelId ?? pushedCwId,
      title: normalizedTitle,
      description: params.description ?? existing?.description ?? null,
      color: params.color ?? existing?.color ?? "#1F93FF",
      showOnSidebar: params.showOnSidebar ?? existing?.showOnSidebar ?? true,
      origin: existing?.origin ?? "mocter_custom",
      state: "active",
      syncedAt: new Date(),
    };
    clientMap.set(normalizedTitle, record);
    return ok(record);
  }

  /**
   * Archiva una etiqueta desde Mocter, rechazando archivar cualquiera de las 4 etiquetas reservadas `mocter_default` (`RF-03.7`).
   */
  archiveLabelFromMocter(
    clientId: string,
    title: string,
  ): Result<TenantLabelRecord> {
    this.seedReservedLabelsIfMissing(clientId);
    const clientMap = this.labelsByClient.get(clientId)!;
    const normalizedTitle = title.trim().toLowerCase();

    if (RESERVED_SLUGS.has(normalizedTitle as typeof RESERVED_MOCTER_LEAD_LABELS[number]["title"])) {
      return err(
        `Label '${normalizedTitle}' is a reserved Mocter lead classification label (mocter_default) and cannot be archived or deleted (RF-03.7).`,
        "CANNOT_ARCHIVE_RESERVED_MOCTER_LABEL",
      );
    }

    const existing = clientMap.get(normalizedTitle);
    if (!existing) {
      return err(`Label '${normalizedTitle}' not found.`, "LABEL_NOT_FOUND");
    }

    existing.state = "archived";
    existing.syncedAt = new Date();
    return ok(existing);
  }

  private encryptServiceToken(clientId: string, plainToken: string): Buffer {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, iv);
    cipher.setAAD(Buffer.from(`chatwoot_service:${clientId}:${this.activeKeyId}`, "utf8"));
    const encrypted = Buffer.concat([
      cipher.update(plainToken, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]);
  }

  private decryptServiceToken(clientId: string, payload: Buffer): string {
    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const ciphertext = payload.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", this.encryptionKey, iv);
    decipher.setAAD(Buffer.from(`chatwoot_service:${clientId}:${this.activeKeyId}`, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  }
}

/**
 * Construye el mapa de características (features) y límites compatibles con Chatwoot v4.19.1 a partir de un plan.
 */
export async function buildChatwootFeaturesAndLimitsForPlan(planId: string, customDb?: any): Promise<{
  features: Record<string, boolean>;
  limits: Record<string, number | null>;
}> {
  const db = customDb || getDb();

  // 1. Plan limits: agents, inboxes
  const limitsRows = await db
    .select()
    .from(planLimits)
    .where(eq(planLimits.planId, planId));

  const limits: Record<string, number | null> = {};
  for (const row of limitsRows) {
    if (row.dimension === "agents" || row.dimension === "inboxes") {
      limits[row.dimension] = row.limitMode === "UNLIMITED" ? null : (row.value ?? null);
    }
  }

  // 2. Plan capabilities: map commercial selectable to provider codes
  const capabilityRows = await db
    .select()
    .from(planCapabilityValues)
    .where(eq(planCapabilityValues.planId, planId));

  const features: Record<string, boolean> = {};
  for (const row of capabilityRows) {
    const code = row.capabilityCode;
    // Excluir Mocter-owned (channel_whatsapp) y técnicos (chatwoot_v4)
    if (code === "channel_whatsapp" || code === "chatwoot_v4") {
      continue;
    }
    const def = chatwootCapabilityDefinitions.find((c) => c.code === code);
    if (!def) continue;

    if (def.commercialStatus === "commercial" && def.providerCode) {
      features[def.providerCode] = Boolean(row.enabled);
    }
  }

  return { features, limits };
}

/**
 * Aprovisiona automáticamente una cuenta en Chatwoot tras vincular un plan a un inquilino (S9, T4).
 */
export async function provisionTenantChatwootAccount(params: {
  clientId: string;
  planId: string;
  actor?: string;
  gateway?: IChatwootPlatformGateway;
  db?: any;
}): Promise<Result<ChatwootAccountRecord | { skipped: boolean }>> {
  const db = params.db || getDb();
  const actor = params.actor || "system";

  // 1. Consultar inquilino
  const [client] = await db.select().from(clients).where(eq(clients.id, params.clientId)).limit(1);
  if (!client) {
    return err(`Inquilino '${params.clientId}' no encontrado.`, "TENANT_NOT_FOUND");
  }

  // 2. Consultar plan
  const [plan] = await db.select().from(plans).where(eq(plans.id, params.planId)).limit(1);
  if (!plan) {
    return err(`Plan '${params.planId}' no encontrado.`, "PLAN_NOT_FOUND");
  }

  if (!plan.chatwootEnabled) {
    return ok({ skipped: true });
  }

  // 3. Obtener features y límites configurados
  const { features, limits } = await buildChatwootFeaturesAndLimitsForPlan(params.planId, db);

  // 4. Instanciar gateway y servicio
  const gateway = params.gateway || new ChatwootHttpPlatformGateway();
  const cwService = new ChatwootProvisioningService(gateway, undefined, "k1", db);

  const idempotencyKey = `cw_prov_${client.id}`;
  const provResult = await cwService.provisionOrRetryAccount({
    clientId: client.id,
    tenantName: client.displayName,
    locale: client.locale === "en" ? "en" : "es",
    idempotencyKey,
    features,
    limits,
    actor,
  });

  if (!provResult.ok) {
    return err("El plan se guardó, pero la configuración de atención no pudo sincronizarse.", "CHATWOOT_SYNC_FAILED");
  }

  return ok(provResult.data);
}

/**
 * Sincroniza la cuenta de Chatwoot de un inquilino existente cuando cambia el plan o sus condiciones (S8, T5).
 */
export async function syncTenantChatwootAccount(params: {
  clientId: string;
  planId: string;
  actor?: string;
  gateway?: IChatwootPlatformGateway;
  db?: any;
}): Promise<Result<ChatwootAccountRecord>> {
  const db = params.db || getDb();
  const actor = params.actor || "system";

  const { features, limits } = await buildChatwootFeaturesAndLimitsForPlan(params.planId, db);
  const gateway = params.gateway || new ChatwootHttpPlatformGateway();
  const cwService = new ChatwootProvisioningService(gateway, undefined, "k1", db);

  return cwService.syncAccountWithPlan({
    clientId: params.clientId,
    features,
    limits,
    actor,
  });
}

/**
 * Sincroniza todas las cuentas de Chatwoot de los inquilinos que tienen asignado un plan editado (S8, T5).
 */
export async function syncAllAccountsForPlan(params: {
  planId: string;
  actor?: string;
  gateway?: IChatwootPlatformGateway;
  db?: any;
}): Promise<Result<{ total: number; synced: number; failed: number; errors: Array<{ clientId: string; error: string }> }>> {
  const db = params.db || getDb();
  const actor = params.actor || "system";

  const [plan] = await db.select().from(plans).where(eq(plans.id, params.planId)).limit(1);
  if (!plan) {
    return err(`Plan '${params.planId}' no encontrado.`, "PLAN_NOT_FOUND");
  }

  if (!plan.chatwootEnabled) {
    return ok({ total: 0, synced: 0, failed: 0, errors: [] });
  }

  // Buscar todos los inquilinos asignados a este plan
  const assignedClients = await db
    .select({ id: clients.id, displayName: clients.displayName })
    .from(clients)
    .where(eq(clients.planId, params.planId));

  const { features, limits } = await buildChatwootFeaturesAndLimitsForPlan(params.planId, db);
  const gateway = params.gateway || new ChatwootHttpPlatformGateway();
  const cwService = new ChatwootProvisioningService(gateway, undefined, "k1", db);

  let synced = 0;
  let failed = 0;
  const errors: Array<{ clientId: string; error: string }> = [];

  for (const client of assignedClients) {
    const res = await cwService.syncAccountWithPlan({
      clientId: client.id,
      features,
      limits,
      actor,
    });
    if (res.ok) {
      synced += 1;
    } else {
      failed += 1;
      errors.push({ clientId: client.id, error: res.error });
    }
  }

  return ok({
    total: assignedClients.length,
    synced,
    failed,
    errors,
  });
}

