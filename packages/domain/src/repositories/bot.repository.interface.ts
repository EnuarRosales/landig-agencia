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
  WalletTransaction,
  AiUsageEvent,
  NewAiUsageEvent,
} from "../db/schemas/admin/bot-tenancy";
import type {
  AuditLogEntry,
  NewAuditLogEntry,
} from "../db/schemas/admin/chatwoot-media-onboarding";
import type {
  BotFollowup,
  NewBotFollowup,
  BotFollowupStep,
  NewBotFollowupStep,
  BotFollowupRun,
  NewBotFollowupRun,
} from "../db/schemas/admin/bot-followups";

/**
 * Métricas consolidadas de consumo y recaudación de IA en la plataforma (BOT-001 T-16, OPS-001).
 */
export interface PlatformAiRevenueMetrics {
  totalRechargedUsdCents: number;
  totalCostUsdCents: number;
  totalTokensConsumed: number;
  tokensByPurpose: {
    bot: number;
    assist: number;
    trial: number;
  };
  eventsCount: number;
}

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
  updateProvider(id: string, patch: Partial<AiProvider>): Promise<AiProvider | null>;
  listModels(providerId?: string): Promise<AiModel[]>;
  findModelById(id: string): Promise<AiModel | null>;
  updateModel(id: string, patch: Partial<AiModel>): Promise<AiModel | null>;
  listTones(): Promise<BotTone[]>;
  findToneById(id: string): Promise<BotTone | null>;
  listPresets(): Promise<BotPreset[]>;
  findPresetById(id: string): Promise<BotPreset | null>;
  getBotDefaults(): Promise<BotDefault>;
  listChannelTypes(): Promise<ChatwootChannelType[]>;
  findChannelTypeByCode(code: string): Promise<ChatwootChannelType | null>;
  findChannelTypeById(id: string): Promise<ChatwootChannelType | null>;

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

  // Billetera y consumo (BOT-001 T-13, T-14, T-15)
  getWallet(clientId: string): Promise<Wallet | null>;
  findWalletTransactionByReference(
    clientId: string,
    reference: string,
  ): Promise<WalletTransaction | null>;
  listWalletTransactions(clientId: string, limit?: number): Promise<WalletTransaction[]>;
  listUsageEvents(clientId: string, limit?: number): Promise<AiUsageEvent[]>;
  executeRechargeTransaction(params: {
    clientId: string;
    amountUsdCents: number;
    currency: string;
    amountLocalCents?: number;
    fxRate?: string;
    reference: string;
    actor: string;
  }): Promise<{ wallet: Wallet; transaction: WalletTransaction }>;
  executeConsumptionTransaction(params: {
    clientId: string;
    botId?: string;
    providerId: string;
    modelId: string;
    purpose: "bot" | "assist" | "trial";
    inputTokens: number;
    outputTokens: number;
    costUsdCents: number;
    reference: string;
    actor: string;
  }): Promise<{ wallet: Wallet; transaction: WalletTransaction; usageEvent: AiUsageEvent }>;
  recordUsageEvent(event: NewAiUsageEvent): Promise<AiUsageEvent>;

  // Auditoría y observabilidad de recaudación (BOT-001 T-16, OPS-001)
  recordAuditLog(entry: NewAuditLogEntry): Promise<AuditLogEntry>;
  getPlatformAiRevenueMetrics(start?: Date, end?: Date): Promise<PlatformAiRevenueMetrics>;

  // Secuencias de recordatorios y seguimientos (BOT-001 T-20, T-21, T-22, RF-11)
  createFollowupSequence(params: {
    clientId: string;
    botId?: string | null;
    name: string;
    triggerInactivityMinutes: number;
    origin?: "platform_default" | "tenant_custom";
    steps: Array<{ position: number; delayMinutes: number; message: string }>;
    actor: string;
  }): Promise<{ followup: BotFollowup; steps: BotFollowupStep[] }>;
  listFollowups(clientId: string): Promise<Array<BotFollowup & { steps: BotFollowupStep[] }>>;
  findFollowupById(id: string): Promise<(BotFollowup & { steps: BotFollowupStep[] }) | null>;
  updateFollowupStatus(
    id: string,
    status: "draft" | "active" | "paused",
    actor: string,
  ): Promise<BotFollowup>;
  findActiveFollowupRun(
    clientId: string,
    prospectContactId: string,
  ): Promise<BotFollowupRun | null>;
  createFollowupRun(run: NewBotFollowupRun): Promise<BotFollowupRun>;
  updateFollowupRun(id: string, patch: Partial<BotFollowupRun>): Promise<BotFollowupRun>;
  stopFollowupRunsForProspect(
    clientId: string,
    prospectContactId: string,
    stopReason: string,
    actor: string,
  ): Promise<number>;
}

