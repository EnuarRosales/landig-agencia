import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { err, ok, type Result } from "../types/result";
import { getDb } from "../db/client";
import { withTenantCellTransaction } from "../db/cell-client";
import { chatwootAccounts } from "../db/schemas/admin/chatwoot-media-onboarding";
import { clients } from "../db/schemas/admin/clients";
import { plans } from "../db/schemas/admin/plans";
import { planLimits } from "../db/schemas/admin/plan-catalogs";
import { chatwootCapabilityDefinitions, planCapabilityValues } from "../db/schemas/admin/chatwoot-capabilities";
import { cellTenantLabels } from "../db/schemas/tenant";
import { RESERVED_MOCTER_LEAD_LABELS } from "./onboarding-and-limits.service";
import { appLogger } from "../utils/logger";
import { env } from "../utils/env";

/**
 * Catálogo canónico de las 6 etiquetas reservadas de Chatwoot (CHW-002 RF-02.5, D-08).
 */
export const RESERVED_CANONICAL_LABELS = [
  {
    title: "lead-frio",
    description: "Prospecto con bajo interés inicial",
    color: "#64748B",
    showOnSidebar: true,
  },
  {
    title: "lead-tibio",
    description: "Prospecto con interés moderado",
    color: "#F59E0B",
    showOnSidebar: true,
  },
  {
    title: "lead-caliente",
    description: "Prospecto con alta intención de compra",
    color: "#EF4444",
    showOnSidebar: true,
  },
  {
    title: "compra-realizada",
    description: "Cliente que completó una transacción",
    color: "#10B981",
    showOnSidebar: true,
  },
  {
    title: "soporte",
    description: "Atención y soporte post-venta",
    color: "#3B82F6",
    showOnSidebar: true,
  },
  {
    title: "escalation-humano",
    description: "Escalamiento a agente humano",
    color: "#8B5CF6",
    showOnSidebar: true,
  },
] as const;

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

export interface ChatwootWebhookRegistrationResult {
  id: number;
  url: string;
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

  ensureAccountWebhook?(params: {
    accountId: number;
    serviceToken: string;
    webhookUrl: string;
    subscriptions?: string[];
  }): Promise<ChatwootWebhookRegistrationResult>;

  ensureMemberUserInAccount?(params: {
    accountId: number;
    email: string;
    name: string;
    role: "administrator" | "agent";
  }): Promise<{ userId: number }>;

  getUserSsoLoginUrl?(params: {
    userId: number;
  }): Promise<{ url: string }>;
}

export interface ChatwootHttpPlatformGatewayOptions {
  baseUrl?: string;
  platformToken?: string;
}

/**
 * Resuelve la configuración HTTP para el gateway de Chatwoot priorizando CHATWOOT_INTERNAL_URL.
 */
export function getChatwootHttpConfig(options?: ChatwootHttpPlatformGatewayOptions): {
  baseUrl: string;
  platformToken: string;
} {
  const baseUrl = (
    options?.baseUrl ||
    env.CHATWOOT_INTERNAL_URL ||
    env.CHATWOOT_BASE_URL ||
    process.env.CHATWOOT_INTERNAL_URL ||
    process.env.CHATWOOT_BASE_URL ||
    "http://localhost:3000"
  ).replace(/\/+$/, "");

  const platformToken =
    options?.platformToken ||
    env.CHATWOOT_PLATFORM_TOKEN ||
    process.env.CHATWOOT_PLATFORM_TOKEN ||
    "";

  return { baseUrl, platformToken };
}

/**
 * Adaptador HTTP para interactuar con la Platform API de Chatwoot v4.19.1.
 */
export class ChatwootHttpPlatformGateway implements IChatwootPlatformGateway {
  private readonly baseUrl: string;
  private readonly platformToken: string;

  constructor(options?: ChatwootHttpPlatformGatewayOptions) {
    const config = getChatwootHttpConfig(options);
    this.baseUrl = config.baseUrl;
    this.platformToken = config.platformToken;
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
    } else if (userRes.status === 422) {
      // Si el usuario técnico ya existe en Chatwoot (reintento o aprovisionamiento idempotente), localizarlo
      const listRes = await fetch(`${this.baseUrl}/platform/api/v1/users`, {
        headers: { api_access_token: this.platformToken },
      });
      if (listRes.ok) {
        const usersList: any = await listRes.json();
        const usersArray: Array<{ id: number; email: string }> = Array.isArray(usersList)
          ? usersList
          : (usersList?.payload || []);
        const found = usersArray.find((u) => u.email?.toLowerCase() === email.toLowerCase());
        if (found) {
          userId = found.id;
        } else {
          const text = await userRes.text();
          throw new Error(`Chatwoot Platform API service user creation error (${userRes.status}): ${text}`);
        }
      } else {
        const text = await userRes.text();
        throw new Error(`Chatwoot Platform API service user creation error (${userRes.status}): ${text}`);
      }
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

    if (!linkRes.ok && linkRes.status !== 422) {
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
    // 1. Consultar inboxes existentes para garantizar idempotencia en reintentos
    const listRes = await fetch(`${this.baseUrl}/api/v1/accounts/${params.accountId}/inboxes`, {
      method: "GET",
      headers: {
        api_access_token: params.serviceToken,
        "Content-Type": "application/json",
      },
    });

    if (listRes.ok) {
      const listData: any = await listRes.json();
      const inboxes: any[] = Array.isArray(listData) ? listData : (listData?.payload || []);
      const existingWebWidget = inboxes.find(
        (i) => i.channel_type === "Channel::WebWidget" || i.channel?.type === "web_widget",
      );
      if (existingWebWidget) {
        const websiteToken =
          existingWebWidget.channel?.website_token || existingWebWidget.website_token || "";
        return { inboxId: existingWebWidget.id, websiteToken };
      }
    }

    // 2. Crear inbox por defecto si no existe
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

    if (res.ok) {
      const data = (await res.json()) as { id?: number; payload?: { id: number } };
      const chatwootLabelId = data.payload?.id ?? data.id;
      if (typeof chatwootLabelId === "number") {
        return { chatwootLabelId };
      }
    }

    if (res.status === 422) {
      // Si la etiqueta ya existe en Chatwoot (reintento idempotente), consultar para obtener su ID
      const listRes = await fetch(`${this.baseUrl}/api/v1/accounts/${params.accountId}/labels`, {
        method: "GET",
        headers: {
          api_access_token: params.serviceToken,
          "Content-Type": "application/json",
        },
      });
      if (listRes.ok) {
        const listData: any = await listRes.json();
        const labels: any[] = Array.isArray(listData) ? listData : (listData?.payload || []);
        const found = labels.find((l) => l.title?.toLowerCase() === params.title.toLowerCase());
        if (found && typeof found.id === "number") {
          return { chatwootLabelId: found.id };
        }
      }
    }

    const text = await res.text();
    throw new Error(`Chatwoot API label creation error (${res.status}): ${text}`);
  }

  async ensureAccountWebhook(params: {
    accountId: number;
    serviceToken: string;
    webhookUrl: string;
    subscriptions?: string[];
  }): Promise<ChatwootWebhookRegistrationResult> {
    const defaultSubscriptions = [
      "conversation_created",
      "conversation_status_changed",
      "conversation_updated",
      "message_created",
      "message_updated",
    ];
    const subscriptions = params.subscriptions || defaultSubscriptions;

    // 1. Consultar si ya existe un webhook registrado con esa URL
    const listRes = await fetch(`${this.baseUrl}/api/v1/accounts/${params.accountId}/webhooks`, {
      method: "GET",
      headers: {
        api_access_token: params.serviceToken,
        "Content-Type": "application/json",
      },
    });

    if (listRes.ok) {
      const listData: any = await listRes.json();
      const webhooks: Array<{ id: number; url: string }> = Array.isArray(listData)
        ? listData
        : (listData?.payload || []);
      const existing = webhooks.find((w) => w.url === params.webhookUrl);
      if (existing) {
        return { id: existing.id, url: existing.url };
      }
    }

    // 2. Registrar el webhook vía POST
    const createRes = await fetch(`${this.baseUrl}/api/v1/accounts/${params.accountId}/webhooks`, {
      method: "POST",
      headers: {
        api_access_token: params.serviceToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        webhook: {
          url: params.webhookUrl,
          subscriptions,
        },
      }),
    });

    if (!createRes.ok) {
      const text = await createRes.text();
      throw new Error(`Chatwoot API webhook registration error (${createRes.status}): ${text}`);
    }

    const data: any = await createRes.json();
    const created = data?.payload?.webhook || data?.payload || data;
    return { id: created.id, url: created.url || params.webhookUrl };
  }

  async ensureMemberUserInAccount(params: {
    accountId: number;
    email: string;
    name: string;
    role: "administrator" | "agent";
  }): Promise<{ userId: number }> {
    let userId: number;

    const userRes = await fetch(`${this.baseUrl}/platform/api/v1/users`, {
      method: "POST",
      headers: {
        api_access_token: this.platformToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: params.name,
        email: params.email,
        password: `${randomBytes(24).toString("hex")}A1!`,
        custom_attributes: { mocter_member: true },
      }),
    });

    if (userRes.ok) {
      const userData = (await userRes.json()) as { id: number };
      userId = userData.id;
    } else if (userRes.status === 422) {
      // El usuario ya existe en Chatwoot; buscar su ID
      const listRes = await fetch(`${this.baseUrl}/platform/api/v1/users`, {
        headers: { api_access_token: this.platformToken },
      });
      if (listRes.ok) {
        const usersList: any = await listRes.json();
        const usersArray: Array<{ id: number; email: string }> = Array.isArray(usersList)
          ? usersList
          : (usersList?.payload || []);
        const found = usersArray.find((u) => u.email?.toLowerCase() === params.email.toLowerCase());
        if (found) {
          userId = found.id;
        } else {
          const text = await userRes.text();
          throw new Error(`Chatwoot user already exists but could not be located (${userRes.status}): ${text}`);
        }
      } else {
        const text = await userRes.text();
        throw new Error(`Chatwoot Platform API user creation error (${userRes.status}): ${text}`);
      }
    } else {
      const text = await userRes.text();
      throw new Error(`Chatwoot Platform API user creation error (${userRes.status}): ${text}`);
    }

    // Vincular usuario a la cuenta con su rol correspondiente
    const linkRes = await fetch(
      `${this.baseUrl}/platform/api/v1/accounts/${params.accountId}/account_users`,
      {
        method: "POST",
        headers: {
          api_access_token: this.platformToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: userId,
          role: params.role,
        }),
      },
    );

    if (!linkRes.ok && linkRes.status !== 422) {
      const linkText = await linkRes.text();
      throw new Error(`Chatwoot Platform API account_users link error (${linkRes.status}): ${linkText}`);
    }

    return { userId };
  }

  async getUserSsoLoginUrl(params: {
    userId: number;
  }): Promise<{ url: string }> {
    const res = await fetch(`${this.baseUrl}/platform/api/v1/users/${params.userId}/login`, {
      method: "GET",
      headers: {
        api_access_token: this.platformToken,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Chatwoot Platform API user login error (${res.status}): ${text}`);
    }

    const data = (await res.json()) as { url: string };
    return { url: data.url };
  }
}

const RESERVED_SLUGS = new Set<string>(RESERVED_CANONICAL_LABELS.map((l) => l.title));

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

  /**
   * Obtiene el registro de aprovisionamiento de Chatwoot para un inquilino.
   */
  async getAccountRecord(clientId: string): Promise<ChatwootAccountRecord | null> {
    const memRecord = this.accountsByClient.get(clientId);
    if (memRecord) {
      return memRecord;
    }
    if (this.db) {
      try {
        const [dbRow] = await this.db
          .select()
          .from(chatwootAccounts)
          .where(eq(chatwootAccounts.clientId, clientId))
          .limit(1);
        if (dbRow) {
          const record: ChatwootAccountRecord = {
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
          this.accountsByClient.set(clientId, record);
          return record;
        }
      } catch {
        return null;
      }
    }
    return null;
  }

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

      // 1. Sembrar etiquetas reservadas en Chatwoot y sincronizar en pg-cell-XX (CHW-002 T-04, RF-02.5, D-08)
      this.seedReservedLabelsIfMissing(params.clientId);
      if (this.gateway.pushLabelToChatwoot) {
        for (const label of RESERVED_CANONICAL_LABELS) {
          try {
            const pushed = await this.gateway.pushLabelToChatwoot({
              accountId: record.chatwootAccountId,
              serviceToken: rawServiceToken,
              title: label.title,
              description: label.description,
              color: label.color,
              showOnSidebar: label.showOnSidebar,
            });

            const clientMap = this.labelsByClient.get(params.clientId);
            if (clientMap) {
              const existingLabel = clientMap.get(label.title);
              if (existingLabel) {
                existingLabel.chatwootLabelId = pushed.chatwootLabelId;
              } else {
                const isMocterLead = RESERVED_MOCTER_LEAD_LABELS.some((m) => m.title === label.title);
                clientMap.set(label.title, {
                  id: `019a0000-0000-7000-8004-${String(clientMap.size + 1).padStart(12, "0")}`,
                  clientId: params.clientId,
                  chatwootLabelId: pushed.chatwootLabelId,
                  title: label.title,
                  description: label.description,
                  color: label.color,
                  showOnSidebar: label.showOnSidebar,
                  origin: isMocterLead ? "mocter_default" : "chatwoot_default",
                  state: "active",
                  syncedAt: new Date(),
                });
              }
            }

            if (this.db) {
              try {
                const isMocterLead = RESERVED_MOCTER_LEAD_LABELS.some((m) => m.title === label.title);
                await withTenantCellTransaction(params.clientId, async (tx) => {
                  await tx
                    .insert(cellTenantLabels)
                    .values({
                      clientId: params.clientId,
                      title: label.title,
                      description: label.description,
                      color: label.color,
                      showOnSidebar: label.showOnSidebar,
                      origin: isMocterLead ? "mocter_default" : "chatwoot_default",
                      chatwootLabelId: pushed.chatwootLabelId,
                      state: "active",
                      syncedAt: new Date(),
                      createdBy: params.actor || "system",
                      updatedBy: params.actor || "system",
                    })
                    .onConflictDoUpdate({
                      target: [cellTenantLabels.clientId, cellTenantLabels.title],
                      set: {
                        chatwootLabelId: pushed.chatwootLabelId,
                        syncedAt: new Date(),
                        updatedAt: new Date(),
                      },
                    });
                });
              } catch {
                // Fail-soft si la celda aún no tiene asignación activa o no responde
              }
            }
          } catch (labelErr) {
            appLogger.warn(`[runProvisioningFlow] Error sembrando etiqueta '${label.title}' en Chatwoot`, {
              clientId: params.clientId,
              error: labelErr instanceof Error ? labelErr.message : String(labelErr),
            });
          }
        }
      }

      // 2. Registrar webhook de la cuenta hacia mocter-admin (CHW-002 T-04, RF-02.6)
      if (this.gateway.ensureAccountWebhook) {
        const webhookUrl =
          env.CHATWOOT_WEBHOOK_URL ||
          process.env.CHATWOOT_WEBHOOK_URL ||
          "http://admin-portal:3003/api/webhooks/chatwoot";

        await this.gateway.ensureAccountWebhook({
          accountId: record.chatwootAccountId,
          serviceToken: rawServiceToken,
          webhookUrl,
        });
      }

      record.state = "active";
      record.syncedAt = new Date();
      await this.persistAccountToDb(record, params.actor);

      return ok({ ...record });
    } catch (error) {
      record.state = "failed";
      record.lastError = error instanceof Error ? error.message : String(error);
      appLogger.warn("[ChatwootProvisioningService.runProvisioningFlow] Fallo en aprovisionamiento de Chatwoot (Fail-Soft)", {
        clientId: params.clientId,
        error: record.lastError,
      });
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
   * Siembra las 4 etiquetas reservadas de clasificación de prospectos (ADM-001 RF-03.7, T-12)
   * con `origin = 'mocter_default'`.
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
 * Evalúa si un plan tiene Chatwoot habilitado según sus límites (chatwoot_agents o chatwoot_inboxes),
 * capacidades activas en plan_capability_values, o la bandera directa plan.chatwootEnabled (CHW-002 RF-01.1).
 */
export async function isChatwootEnabledForPlan(planId: string, customDb?: any): Promise<boolean> {
  const db = customDb || getDb();

  // 1. Consultar si tiene plan.chatwootEnabled
  try {
    const [plan]: any = await db
      .select()
      .from(plans)
      .where(eq(plans.id, planId))
      .limit(1);

    if (plan && typeof plan.chatwootEnabled === "boolean") {
      return plan.chatwootEnabled;
    }
  } catch {
    // Si la tabla o columna no está disponible, continuar con limits y capacidades
  }

  // 2. Consultar dimensiones en plan_limits: chatwoot_agents o chatwoot_inboxes
  try {
    const limitsRows = await db
      .select({ dimension: planLimits.dimension, mode: planLimits.mode, value: planLimits.value })
      .from(planLimits)
      .where(eq(planLimits.planId, planId));

    if (Array.isArray(limitsRows)) {
      for (const row of limitsRows) {
        if (row.dimension === "chatwoot_agents" || row.dimension === "chatwoot_inboxes") {
          if (row.mode === "UNLIMITED" || (row.mode !== "DISABLED" && (row.value ?? 0) > 0)) {
            return true;
          }
        }
      }
    }
  } catch {
    // Fallback
  }

  // 3. Consultar capacidades activas en plan_capability_values
  try {
    const caps = await db
      .select({ enabled: planCapabilityValues.enabled })
      .from(planCapabilityValues)
      .where(and(eq(planCapabilityValues.planId, planId), eq(planCapabilityValues.enabled, true)))
      .limit(1);

    return Array.isArray(caps) && caps.length > 0;
  } catch {
    return false;
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

  // 1. Plan limits: agents, inboxes (CHW-002 T-03, RF-02.1)
  const limitsRows = await db
    .select()
    .from(planLimits)
    .where(eq(planLimits.planId, planId));

  const limits: Record<string, number | null> = {};
  if (Array.isArray(limitsRows)) {
    for (const row of limitsRows) {
      const rawMode = (row.mode || row.limitMode) as string | undefined;
      const resolvedLimit =
        rawMode === "UNLIMITED"
          ? null
          : rawMode === "DISABLED"
            ? 0
            : (row.value ?? null);

      if (row.dimension === "chatwoot_agents" || row.dimension === "agents") {
        limits.agents = resolvedLimit;
      } else if (row.dimension === "chatwoot_inboxes" || row.dimension === "inboxes") {
        limits.inboxes = resolvedLimit;
      }
    }
  }

  // 2. Plan capabilities: map commercial selectable to provider codes
  const capabilityRows = await db
    .select()
    .from(planCapabilityValues)
    .where(eq(planCapabilityValues.planId, planId));

  const features: Record<string, boolean> = {};
  if (Array.isArray(capabilityRows)) {
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

  const isEnabled = (plan as any).chatwootEnabled ?? (await isChatwootEnabledForPlan(params.planId, db));
  if (!isEnabled) {
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
    return err(
      provResult.error || "El plan se guardó, pero la configuración de atención no pudo sincronizarse.",
      provResult.code || "CHATWOOT_SYNC_FAILED",
    );
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

  const isEnabled = (plan as any).chatwootEnabled ?? (await isChatwootEnabledForPlan(params.planId, db));
  if (!isEnabled) {
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

/**
 * Consulta el estado y registro de aprovisionamiento de Chatwoot para un inquilino en la base de datos administrativa.
 */
export async function getTenantChatwootAccount(params: {
  clientId: string;
  db?: any;
}): Promise<ChatwootAccountRecord | null> {
  const db = params.db || getDb();
  try {
    const [dbRow] = await db
      .select()
      .from(chatwootAccounts)
      .where(eq(chatwootAccounts.clientId, params.clientId))
      .limit(1);

    if (!dbRow) return null;

    return {
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
  } catch {
    return null;
  }
}


