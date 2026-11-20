import { and, asc, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { CellPoolError, withTenantCellTransaction } from "../db/cell-client";
import {
  cellOrders,
  cellTenantPaymentChannels,
  type CellTenantPaymentChannel,
} from "../db/schemas/tenant/orders";
import { cellClientBusinessInfo } from "../db/schemas/tenant/tenancy-catalog";
import { ok, err, type Result } from "../types/result";
import { appLogger } from "../utils/logger";
import { isTenantProfileWriterRole } from "./tenant-profile.service";

export const TENANT_PAYMENT_CHANNEL_CODES = [
  "nequi",
  "daviplata",
  "bancolombia",
  "bre_b",
  "pse",
  "card_link",
  "cash_on_delivery",
  "efecty",
  "bank_transfer",
  "other",
] as const;

export type TenantPaymentChannelCode = (typeof TENANT_PAYMENT_CHANNEL_CODES)[number];

export interface TenantPaymentChannelDto {
  id: string;
  clientId: string;
  channelCode: TenantPaymentChannelCode;
  displayName: string;
  accountIdentifier: string | null;
  accountHolderName: string | null;
  instructions: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

const SENSITIVE_CREDENTIAL_PATTERN =
  /\b(cvv|cvc|ccv|pin\s+secreto|clave\s+cajero|contraseñ?a|password|private[_\s-]?key|secret[_\s-]?token|bearer\s+)\b/i;

function containsProhibitedSecret(text: string | null | undefined): boolean {
  if (!text) return false;
  return SENSITIVE_CREDENTIAL_PATTERN.test(text);
}

const optionalTrimmedString = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().trim().max(max).nullable().optional(),
  );

export const createPaymentChannelSchema = z.object({
  channelCode: z.enum(TENANT_PAYMENT_CHANNEL_CODES),
  displayName: z
    .string()
    .trim()
    .min(2, "El nombre visible del canal debe tener al menos 2 caracteres.")
    .max(120, "El nombre visible no puede superar 120 caracteres."),
  accountIdentifier: optionalTrimmedString(160),
  accountHolderName: optionalTrimmedString(160),
  instructions: optionalTrimmedString(1000),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional().default(0),
});

export const updatePaymentChannelSchema = z.object({
  channelCode: z.enum(TENANT_PAYMENT_CHANNEL_CODES).optional(),
  displayName: z
    .string()
    .trim()
    .min(2, "El nombre visible del canal debe tener al menos 2 caracteres.")
    .max(120, "El nombre visible no puede superar 120 caracteres.")
    .optional(),
  accountIdentifier: optionalTrimmedString(160),
  accountHolderName: optionalTrimmedString(160),
  instructions: optionalTrimmedString(1000),
  isActive: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
});

export type CreatePaymentChannelInput = z.infer<typeof createPaymentChannelSchema>;
export type UpdatePaymentChannelInput = z.infer<typeof updatePaymentChannelSchema>;

export interface ITenantPaymentChannelsRepository {
  listByClient(clientId: string): Promise<CellTenantPaymentChannel[]>;
  getById(clientId: string, channelId: string): Promise<CellTenantPaymentChannel | null>;
  create(
    clientId: string,
    input: CreatePaymentChannelInput,
    actor: string,
  ): Promise<CellTenantPaymentChannel>;
  update(
    clientId: string,
    channelId: string,
    input: UpdatePaymentChannelInput,
    actor: string,
  ): Promise<CellTenantPaymentChannel | null>;
  isChannelUsedInOrders(
    clientId: string,
    channel: Pick<CellTenantPaymentChannel, "id" | "channelCode" | "displayName">,
  ): Promise<boolean>;
  deleteAndSyncSummary(clientId: string, channelId: string, actor: string): Promise<boolean>;
}

/**
 * Repositorio Drizzle aislado por RLS celular (`pg-cell-XX`, `SET LOCAL app.current_client_id`).
 * Cada mutación mantiene sincronizada la proyección resumida `cell_client_business_info.payment_methods`.
 */
export class DrizzleTenantPaymentChannelsRepository implements ITenantPaymentChannelsRepository {
  private async syncBusinessInfoSummary(
    tx: Parameters<Parameters<typeof withTenantCellTransaction>[1]>[0],
    clientId: string,
    actor: string,
  ): Promise<void> {
    const activeChannels = await tx
      .select({ displayName: cellTenantPaymentChannels.displayName })
      .from(cellTenantPaymentChannels)
      .where(
        and(
          eq(cellTenantPaymentChannels.clientId, clientId),
          eq(cellTenantPaymentChannels.isActive, true),
        ),
      )
      .orderBy(asc(cellTenantPaymentChannels.sortOrder), asc(cellTenantPaymentChannels.createdAt));

    const summaryNames = activeChannels.map((c) => c.displayName);

    await tx
      .insert(cellClientBusinessInfo)
      .values({
        clientId,
        paymentMethods: summaryNames,
        createdBy: actor,
        updatedBy: actor,
      })
      .onConflictDoUpdate({
        target: cellClientBusinessInfo.clientId,
        set: {
          paymentMethods: summaryNames,
          updatedAt: new Date(),
          updatedBy: actor,
        },
      });
  }

  async listByClient(clientId: string): Promise<CellTenantPaymentChannel[]> {
    return await withTenantCellTransaction(clientId, async (tx) => {
      return await tx
        .select()
        .from(cellTenantPaymentChannels)
        .where(eq(cellTenantPaymentChannels.clientId, clientId))
        .orderBy(asc(cellTenantPaymentChannels.sortOrder), asc(cellTenantPaymentChannels.createdAt));
    });
  }

  async getById(clientId: string, channelId: string): Promise<CellTenantPaymentChannel | null> {
    return await withTenantCellTransaction(clientId, async (tx) => {
      const [row] = await tx
        .select()
        .from(cellTenantPaymentChannels)
        .where(
          and(
            eq(cellTenantPaymentChannels.clientId, clientId),
            eq(cellTenantPaymentChannels.id, channelId),
          ),
        )
        .limit(1);
      return row ?? null;
    });
  }

  async create(
    clientId: string,
    input: CreatePaymentChannelInput,
    actor: string,
  ): Promise<CellTenantPaymentChannel> {
    return await withTenantCellTransaction(clientId, async (tx) => {
      const [inserted] = await tx
        .insert(cellTenantPaymentChannels)
        .values({
          clientId,
          channelCode: input.channelCode.toLowerCase(),
          displayName: input.displayName,
          accountIdentifier: input.accountIdentifier ?? null,
          accountHolderName: input.accountHolderName ?? null,
          instructions: input.instructions ?? null,
          isActive: input.isActive,
          sortOrder: input.sortOrder,
          createdBy: actor,
          updatedBy: actor,
        })
        .returning();

      await this.syncBusinessInfoSummary(tx, clientId, actor);
      return inserted;
    });
  }

  async update(
    clientId: string,
    channelId: string,
    input: UpdatePaymentChannelInput,
    actor: string,
  ): Promise<CellTenantPaymentChannel | null> {
    return await withTenantCellTransaction(clientId, async (tx) => {
      const patch: Partial<typeof cellTenantPaymentChannels.$inferInsert> = {
        updatedAt: new Date(),
        updatedBy: actor,
      };
      if (input.channelCode !== undefined) patch.channelCode = input.channelCode.toLowerCase();
      if (input.displayName !== undefined) patch.displayName = input.displayName;
      if (input.accountIdentifier !== undefined) patch.accountIdentifier = input.accountIdentifier;
      if (input.accountHolderName !== undefined) patch.accountHolderName = input.accountHolderName;
      if (input.instructions !== undefined) patch.instructions = input.instructions;
      if (input.isActive !== undefined) patch.isActive = input.isActive;
      if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;

      const [updated] = await tx
        .update(cellTenantPaymentChannels)
        .set(patch)
        .where(
          and(
            eq(cellTenantPaymentChannels.clientId, clientId),
            eq(cellTenantPaymentChannels.id, channelId),
          ),
        )
        .returning();

      if (!updated) {
        return null;
      }

      await this.syncBusinessInfoSummary(tx, clientId, actor);
      return updated;
    });
  }

  async isChannelUsedInOrders(
    clientId: string,
    channel: Pick<CellTenantPaymentChannel, "id" | "channelCode" | "displayName">,
  ): Promise<boolean> {
    return await withTenantCellTransaction(clientId, async (tx) => {
      const codeLower = channel.channelCode.toLowerCase();
      const nameLower = channel.displayName.toLowerCase();
      const [match] = await tx
        .select({ id: cellOrders.id })
        .from(cellOrders)
        .where(
          and(
            eq(cellOrders.clientId, clientId),
            or(
              eq(cellOrders.paymentChannelId, channel.id),
              sql`lower(${cellOrders.paymentMethod}) = ${codeLower}`,
              sql`lower(${cellOrders.paymentMethod}) = ${nameLower}`,
            ),
          ),
        )
        .limit(1);

      return Boolean(match);
    });
  }

  async deleteAndSyncSummary(clientId: string, channelId: string, actor: string): Promise<boolean> {
    return await withTenantCellTransaction(clientId, async (tx) => {
      const deleted = await tx
        .delete(cellTenantPaymentChannels)
        .where(
          and(
            eq(cellTenantPaymentChannels.clientId, clientId),
            eq(cellTenantPaymentChannels.id, channelId),
          ),
        )
        .returning({ id: cellTenantPaymentChannels.id });

      if (deleted.length === 0) {
        return false;
      }

      await this.syncBusinessInfoSummary(tx, clientId, actor);
      return true;
    });
  }
}

function mapChannelDto(row: CellTenantPaymentChannel): TenantPaymentChannelDto {
  return {
    id: row.id,
    clientId: row.clientId,
    channelCode: row.channelCode as TenantPaymentChannelCode,
    displayName: row.displayName,
    accountIdentifier: row.accountIdentifier ?? null,
    accountHolderName: row.accountHolderName ?? null,
    instructions: row.instructions ?? null,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

/**
 * Servicio autoritativo de canales de pago informativos del comercio en celda (`SPEC-05`).
 *
 * Garantiza:
 * - Solo el propietario (`tenant_owner`/`tenancy_owner`) muta; agentes tienen lectura operativa (`RN-SPEC-05-04`).
 * - Prohibición de capturar credenciales bancarias secretas (`CVV`, claves, tokens privados).
 * - Protección histórica: canales ya referenciados en pedidos retornan `CHANNEL_USED_IN_ORDERS` (`409`).
 */
export class TenantPaymentChannelsService {
  constructor (
    private readonly repo: ITenantPaymentChannelsRepository = new DrizzleTenantPaymentChannelsRepository(),
  ) { }

  private handleCellPersistenceError<T>(operation: string, clientId: string, error: unknown): Result<T> {
    const msg = error instanceof Error ? error.message : String(error);
    const isCellError =
      error instanceof CellPoolError || (error instanceof Error && error.name === "CellPoolError");
    if (isCellError) {
      appLogger.warn(`[TenantPaymentChannelsService.${operation}] Celda no disponible`, {
        clientId,
        error: msg,
      });
      return err(
        "La celda de datos del comercio no está disponible temporalmente.",
        "CELL_UNAVAILABLE",
      );
    }
    appLogger.error(`[TenantPaymentChannelsService.${operation}] Error inesperado`, error, {
      clientId,
    });
    return err("No fue posible procesar los canales de pago del comercio.", "DB_ERROR");
  }

  async listChannels(clientId: string): Promise<Result<TenantPaymentChannelDto[]>> {
    try {
      const rows = await this.repo.listByClient(clientId);
      return ok(rows.map(mapChannelDto));
    } catch (error) {
      return this.handleCellPersistenceError("listChannels", clientId, error);
    }
  }

  async createChannel(
    clientId: string,
    actorRole: string,
    rawInput: unknown,
    actor: string,
    effectiveRoles: string[] = [],
  ): Promise<Result<TenantPaymentChannelDto>> {
    if (!isTenantProfileWriterRole(actorRole, effectiveRoles)) {
      return err(
        "Permiso denegado: únicamente el propietario del comercio puede configurar canales de pago.",
        "FORBIDDEN",
      );
    }

    const parsed = createPaymentChannelSchema.safeParse(rawInput);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return err(firstIssue?.message || "Datos de canal de pago inválidos.", "VALIDATION_ERROR");
    }

    const data = parsed.data;
    if (
      containsProhibitedSecret(data.accountIdentifier) ||
      containsProhibitedSecret(data.instructions)
    ) {
      return err(
        "Por seguridad está prohibido registrar contraseñas, CVV, PIN o tokens privados en canales informativos.",
        "SENSITIVE_CREDENTIAL_FORBIDDEN",
      );
    }

    try {
      const created = await this.repo.create(clientId, data, actor);
      return ok(mapChannelDto(created));
    } catch (error) {
      return this.handleCellPersistenceError("createChannel", clientId, error);
    }
  }

  async updateChannel(
    clientId: string,
    actorRole: string,
    channelId: string,
    rawInput: unknown,
    actor: string,
    effectiveRoles: string[] = [],
  ): Promise<Result<TenantPaymentChannelDto>> {
    if (!isTenantProfileWriterRole(actorRole, effectiveRoles)) {
      return err(
        "Permiso denegado: únicamente el propietario del comercio puede editar canales de pago.",
        "FORBIDDEN",
      );
    }

    const parsed = updatePaymentChannelSchema.safeParse(rawInput);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return err(firstIssue?.message || "Datos de actualización de canal inválidos.", "VALIDATION_ERROR");
    }

    const data = parsed.data;
    if (
      containsProhibitedSecret(data.accountIdentifier) ||
      containsProhibitedSecret(data.instructions)
    ) {
      return err(
        "Por seguridad está prohibido registrar contraseñas, CVV, PIN o tokens privados en canales informativos.",
        "SENSITIVE_CREDENTIAL_FORBIDDEN",
      );
    }

    try {
      const updated = await this.repo.update(clientId, channelId, data, actor);
      if (!updated) {
        return err("El canal de pago especificado no existe.", "CHANNEL_NOT_FOUND");
      }

      return ok(mapChannelDto(updated));
    } catch (error) {
      return this.handleCellPersistenceError("updateChannel", clientId, error);
    }
  }

  async deleteChannel(
    clientId: string,
    actorRole: string,
    channelId: string,
    actor: string,
    effectiveRoles: string[] = [],
  ): Promise<Result<{ deleted: true; id: string }>> {
    if (!isTenantProfileWriterRole(actorRole, effectiveRoles)) {
      return err(
        "Permiso denegado: únicamente el propietario del comercio puede eliminar canales de pago.",
        "FORBIDDEN",
      );
    }

    try {
      const existing = await this.repo.getById(clientId, channelId);
      if (!existing) {
        return err("El canal de pago especificado no existe.", "CHANNEL_NOT_FOUND");
      }

      const usedInOrders = await this.repo.isChannelUsedInOrders(clientId, {
        id: existing.id,
        channelCode: existing.channelCode,
        displayName: existing.displayName,
      });

      if (usedInOrders) {
        return err(
          "Este canal de pago ya fue utilizado en pedidos históricos y no puede eliminarse físicamente. Inactívalo para conservar la trazabilidad.",
          "CHANNEL_USED_IN_ORDERS",
        );
      }

      await this.repo.deleteAndSyncSummary(clientId, channelId, actor);
      return ok({ deleted: true, id: channelId });
    } catch (error) {
      return this.handleCellPersistenceError("deleteChannel", clientId, error);
    }
  }
}

export const tenantPaymentChannelsService = new TenantPaymentChannelsService();
