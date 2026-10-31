import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { err, ok, type Result } from "../types/result";
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
  }): Promise<{ accountId: number }>;

  ensureServiceUser(params: {
    accountId: number;
    clientId: string;
    idempotencyKey: string;
  }): Promise<{ userId: number; accessToken: string }>;

  ensureWebchatInbox(params: {
    accountId: number;
    serviceToken: string;
    websiteName: string;
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
  ) {}

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
  }): Promise<Result<ChatwootAccountRecord>> {
    const existing =
      this.accountsByClient.get(params.clientId) ??
      this.accountsByIdempotency.get(params.idempotencyKey);

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

    try {
      if (record.chatwootAccountId === null) {
        const createdAcc = await this.gateway.createAccount({
          name: params.tenantName,
          locale: params.locale ?? "es",
          idempotencyKey: params.idempotencyKey,
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

      return ok({ ...record });
    } catch (error) {
      record.state = "failed";
      record.lastError = error instanceof Error ? error.message : String(error);
      return err(record.lastError, "CHATWOOT_PROVISIONING_FAILED");
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

