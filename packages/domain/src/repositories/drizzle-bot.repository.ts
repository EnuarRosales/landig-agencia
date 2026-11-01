import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getDb } from "../db/client";
import * as schema from "../db/schemas";
import {
  aiProviders,
  aiModels,
  botTones,
  botPresets,
  botDefaults,
  chatwootChannelTypes,
  type AiProvider,
  type AiModel,
  type BotTone,
  type BotPreset,
  type BotDefault,
  type ChatwootChannelType,
} from "../db/schemas/admin/bot-catalog";
import {
  tenantBots,
  tenantAiProviders,
  tenantBotChannels,
  wallets,
  aiUsageEvents,
  type TenantBot,
  type NewTenantBot,
  type TenantAiProvider,
  type NewTenantAiProvider,
  type TenantBotChannel,
  type NewTenantBotChannel,
  type Wallet,
  type AiUsageEvent,
  type NewAiUsageEvent,
} from "../db/schemas/admin/bot-tenancy";
import type { IBotRepository } from "./bot.repository.interface";

/**
 * Implementación Drizzle ORM del repositorio de gobernanza de bots e IA en el Router Global.
 */
export class DrizzleBotRepository implements IBotRepository {
  constructor(private readonly db: PostgresJsDatabase<typeof schema> = getDb()) {}

  async listProviders(): Promise<AiProvider[]> {
    return await this.db
      .select()
      .from(aiProviders)
      .where(eq(aiProviders.isActive, true))
      .orderBy(aiProviders.sortOrder);
  }

  async findProviderById(id: string): Promise<AiProvider | null> {
    const [provider] = await this.db
      .select()
      .from(aiProviders)
      .where(eq(aiProviders.id, id))
      .limit(1);
    return provider ?? null;
  }

  async findProviderByCode(code: string): Promise<AiProvider | null> {
    const [provider] = await this.db
      .select()
      .from(aiProviders)
      .where(eq(aiProviders.code, code))
      .limit(1);
    return provider ?? null;
  }

  async updateProvider(id: string, patch: Partial<AiProvider>): Promise<AiProvider | null> {
    const [updated] = await this.db
      .update(aiProviders)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(aiProviders.id, id))
      .returning();
    return updated ?? null;
  }

  async listModels(providerId?: string): Promise<AiModel[]> {
    const conditions = [eq(aiModels.isActive, true)];
    if (providerId) {
      conditions.push(eq(aiModels.providerId, providerId));
    }
    return await this.db
      .select()
      .from(aiModels)
      .where(and(...conditions))
      .orderBy(aiModels.sortOrder);
  }

  async findModelById(id: string): Promise<AiModel | null> {
    const [model] = await this.db
      .select()
      .from(aiModels)
      .where(eq(aiModels.id, id))
      .limit(1);
    return model ?? null;
  }

  async updateModel(id: string, patch: Partial<AiModel>): Promise<AiModel | null> {
    const [updated] = await this.db
      .update(aiModels)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(aiModels.id, id))
      .returning();
    return updated ?? null;
  }

  async listTones(): Promise<BotTone[]> {
    return await this.db
      .select()
      .from(botTones)
      .where(eq(botTones.isActive, true))
      .orderBy(botTones.sortOrder);
  }

  async findToneById(id: string): Promise<BotTone | null> {
    const [tone] = await this.db
      .select()
      .from(botTones)
      .where(eq(botTones.id, id))
      .limit(1);
    return tone ?? null;
  }

  async listPresets(): Promise<BotPreset[]> {
    return await this.db
      .select()
      .from(botPresets)
      .where(eq(botPresets.isActive, true))
      .orderBy(botPresets.sortOrder);
  }

  async findPresetById(id: string): Promise<BotPreset | null> {
    const [preset] = await this.db
      .select()
      .from(botPresets)
      .where(eq(botPresets.id, id))
      .limit(1);
    return preset ?? null;
  }

  async getBotDefaults(): Promise<BotDefault> {
    const [defaults] = await this.db
      .select()
      .from(botDefaults)
      .orderBy(desc(botDefaults.version))
      .limit(1);

    if (!defaults) {
      throw new Error("No se encontró la configuración singleton de bot_defaults.");
    }
    return defaults;
  }

  async listChannelTypes(): Promise<ChatwootChannelType[]> {
    return await this.db
      .select()
      .from(chatwootChannelTypes)
      .where(eq(chatwootChannelTypes.isAdmissible, true))
      .orderBy(chatwootChannelTypes.sortOrder);
  }

  async findTenantBot(clientId: string): Promise<TenantBot | null> {
    const [bot] = await this.db
      .select()
      .from(tenantBots)
      .where(and(eq(tenantBots.clientId, clientId), isNull(tenantBots.deletedAt)))
      .limit(1);
    return bot ?? null;
  }

  async upsertTenantBot(
    clientId: string,
    bot: Omit<NewTenantBot, "clientId">,
  ): Promise<TenantBot> {
    const existing = await this.findTenantBot(clientId);

    if (existing) {
      const [updated] = await this.db
        .update(tenantBots)
        .set({
          ...bot,
          revision: existing.revision + 1,
          updatedAt: sql`NOW()`,
        })
        .where(eq(tenantBots.id, existing.id))
        .returning();
      return updated!;
    }

    const [inserted] = await this.db
      .insert(tenantBots)
      .values({
        ...bot,
        clientId,
        revision: 1,
      })
      .returning();
    return inserted!;
  }

  async updateTenantBotStatus(
    clientId: string,
    botId: string,
    status: "draft" | "active" | "paused",
  ): Promise<TenantBot> {
    const [updated] = await this.db
      .update(tenantBots)
      .set({
        status,
        updatedAt: sql`NOW()`,
      })
      .where(
        and(
          eq(tenantBots.clientId, clientId),
          eq(tenantBots.id, botId),
          isNull(tenantBots.deletedAt),
        ),
      )
      .returning();

    if (!updated) {
      throw new Error(`Bot ${botId} no encontrado para actualizar su estado.`);
    }
    return updated;
  }

  async findTenantAiProvider(
    clientId: string,
    providerId: string,
  ): Promise<TenantAiProvider | null> {
    const [record] = await this.db
      .select()
      .from(tenantAiProviders)
      .where(
        and(
          eq(tenantAiProviders.clientId, clientId),
          eq(tenantAiProviders.providerId, providerId),
          isNull(tenantAiProviders.deletedAt),
        ),
      )
      .limit(1);
    return record ?? null;
  }

  async listTenantAiProviders(clientId: string): Promise<TenantAiProvider[]> {
    return await this.db
      .select()
      .from(tenantAiProviders)
      .where(
        and(
          eq(tenantAiProviders.clientId, clientId),
          isNull(tenantAiProviders.deletedAt),
        ),
      )
      .orderBy(tenantAiProviders.createdAt);
  }

  async saveTenantAiProvider(
    provider: NewTenantAiProvider,
  ): Promise<TenantAiProvider> {
    const existing = await this.findTenantAiProvider(
      provider.clientId,
      provider.providerId,
    );

    if (existing) {
      const [updated] = await this.db
        .update(tenantAiProviders)
        .set({
          apiKeyCiphertext: provider.apiKeyCiphertext,
          apiKeyKeyId: provider.apiKeyKeyId,
          apiKeyLast4: provider.apiKeyLast4,
          status: provider.status ?? "active",
          updatedAt: sql`NOW()`,
        })
        .where(eq(tenantAiProviders.id, existing.id))
        .returning();
      return updated!;
    }

    const [inserted] = await this.db
      .insert(tenantAiProviders)
      .values(provider)
      .returning();
    return inserted!;
  }

  async disableTenantAiProvider(
    clientId: string,
    providerId: string,
  ): Promise<void> {
    await this.db
      .update(tenantAiProviders)
      .set({
        status: "disabled",
        updatedAt: sql`NOW()`,
      })
      .where(
        and(
          eq(tenantAiProviders.clientId, clientId),
          eq(tenantAiProviders.providerId, providerId),
          isNull(tenantAiProviders.deletedAt),
        ),
      );
  }

  async listTenantBotChannels(botId: string): Promise<TenantBotChannel[]> {
    return await this.db
      .select()
      .from(tenantBotChannels)
      .where(eq(tenantBotChannels.botId, botId));
  }

  async upsertTenantBotChannel(
    channel: NewTenantBotChannel,
  ): Promise<TenantBotChannel> {
    const [upserted] = await this.db
      .insert(tenantBotChannels)
      .values(channel)
      .onConflictDoUpdate({
        target: [
          tenantBotChannels.botId,
          tenantBotChannels.channelTypeId,
          tenantBotChannels.inboxId,
        ],
        set: {
          enabled: channel.enabled ?? true,
          inboxName: channel.inboxName,
          greetingOverride: channel.greetingOverride,
          updatedAt: sql`NOW()`,
        },
      })
      .returning();
    return upserted!;
  }

  async getWallet(clientId: string): Promise<Wallet | null> {
    const [wallet] = await this.db
      .select()
      .from(wallets)
      .where(eq(wallets.clientId, clientId))
      .limit(1);
    return wallet ?? null;
  }

  async recordUsageEvent(event: NewAiUsageEvent): Promise<AiUsageEvent> {
    const [inserted] = await this.db
      .insert(aiUsageEvents)
      .values(event)
      .returning();
    return inserted!;
  }
}

