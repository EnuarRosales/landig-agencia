import type {
  AiProvider,
  AiModel,
  BotTone,
  BotPreset,
  BotDefault,
  ChatwootChannelType,
} from "../db/schemas/admin/bot-catalog";
import type {
  TenantBot,
  NewTenantBot,
  TenantAiProvider,
  NewTenantAiProvider,
  TenantBotChannel,
  NewTenantBotChannel,
  Wallet,
  AiUsageEvent,
  NewAiUsageEvent,
} from "../db/schemas/admin/bot-tenancy";

/**
 * Snapshot resuelto con defaults listos para el consumo por el motor de conversación BOT-002.
 */
export interface EffectiveBotSnapshot {
  bot: TenantBot;
  provider: AiProvider;
  model: AiModel;
  tone: BotTone;
  preset: BotPreset | null;
  resolvedTemperature: string;
  resolvedMaxTokens: number;
  channels: TenantBotChannel[];
}

/**
 * Contrato de repositorio para el catálogo global y la configuración de bots e IA en el Router Global.
 */
export interface IBotRepository {
  // Catálogo de plataforma
  listProviders(): Promise<AiProvider[]>;
  findProviderById(id: string): Promise<AiProvider | null>;
  findProviderByCode(code: string): Promise<AiProvider | null>;
  listModels(providerId?: string): Promise<AiModel[]>;
  findModelById(id: string): Promise<AiModel | null>;
  listTones(): Promise<BotTone[]>;
  findToneById(id: string): Promise<BotTone | null>;
  listPresets(): Promise<BotPreset[]>;
  findPresetById(id: string): Promise<BotPreset | null>;
  getBotDefaults(): Promise<BotDefault>;
  listChannelTypes(): Promise<ChatwootChannelType[]>;

  // Configuración del bot del inquilino
  findTenantBot(clientId: string): Promise<TenantBot | null>;
  upsertTenantBot(
    clientId: string,
    bot: Omit<NewTenantBot, "clientId">,
  ): Promise<TenantBot>;
  updateTenantBotStatus(
    clientId: string,
    botId: string,
    status: "draft" | "active" | "paused",
  ): Promise<TenantBot>;

  // Credenciales BYOK
  findTenantAiProvider(
    clientId: string,
    providerId: string,
  ): Promise<TenantAiProvider | null>;
  listTenantAiProviders(clientId: string): Promise<TenantAiProvider[]>;
  saveTenantAiProvider(provider: NewTenantAiProvider): Promise<TenantAiProvider>;
  disableTenantAiProvider(clientId: string, providerId: string): Promise<void>;

  // Canales asociados
  listTenantBotChannels(botId: string): Promise<TenantBotChannel[]>;
  upsertTenantBotChannel(channel: NewTenantBotChannel): Promise<TenantBotChannel>;

  // Billetera y consumo
  getWallet(clientId: string): Promise<Wallet | null>;
  recordUsageEvent(event: NewAiUsageEvent): Promise<AiUsageEvent>;
}

