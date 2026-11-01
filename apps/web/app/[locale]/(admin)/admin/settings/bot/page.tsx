import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { locales } from "@/i18n/routing";
import {
  BotConfigurationView,
  type BotConfigData,
  type BotToneOption,
  type BotPresetOption,
  type BotProviderOption,
  type BotModelOption,
  type BotChannelOption,
  type ByokKeyItem,
} from "@/components/admin/bot/bot-configuration-view";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.bot" });

  return {
    title: `${t("title")} | Mocter Admin`,
    description: t("subtitle"),
  };
}

const mockBotData: BotConfigData = {
  id: "bot-01930000-0000-7000-8000-000000000001",
  name: "Mocter Bot Ventas",
  objective: "Atención comercial, calificación de prospectos y agendamiento de citas",
  toneId: "tone-profesional",
  presetId: "preset-balanced",
  providerId: null,
  modelId: null,
  status: "active",
  persona: "Asistente comercial consultivo, empático, estructurado y enfocado en resolver consultas y agendar citas.",
  greetingMessage: "¡Hola! Te damos la bienvenida a Mocter. ¿En qué podemos asesorarte el día de hoy?",
  fallbackMessage: "Disculpa, no logré comprender tu consulta con exactitud. Te transferiré de inmediato con uno de nuestros asesores comerciales.",
  answerPolicy: "solo_conocimiento",
};

const mockTones: BotToneOption[] = [
  {
    id: "tone-profesional",
    code: "profesional",
    label: "Profesional Y Cercano",
    description: "Tono formal, respetuoso y cálido, idóneo para empresas y servicios corporativos.",
  },
  {
    id: "tone-amigable",
    code: "amigable",
    label: "Amigable Y Dinámico",
    description: "Tono relajado y enérgico, recomendado para tiendas virtuales y marcas juveniles.",
  },
  {
    id: "tone-autoritario",
    code: "tecnico",
    label: "Técnico Y Especializado",
    description: "Enfoque clínico y riguroso para áreas de salud, leyes o ingeniería.",
  },
];

const mockPresets: BotPresetOption[] = [
  {
    id: "preset-fast",
    code: "fast",
    label: "Respuesta Ultrarrápida",
    modelName: "Haiku 3.5 / Flash 2.0",
    recommendedFor: "Soporte de alto tráfico y consultas frecuentes simples",
  },
  {
    id: "preset-balanced",
    code: "balanced",
    label: "Equilibrado (Ventas Y Calificación)",
    modelName: "Claude 3.5 Sonnet / GPT-4o Mini",
    recommendedFor: "Procesamiento de prospectos, ventas y agendamientos guiados",
  },
  {
    id: "preset-smart",
    code: "smart",
    label: "Alta Capacidad De Razonamiento",
    modelName: "Claude 3.5 Sonnet / GPT-4o",
    recommendedFor: "Cotizaciones complejas y análisis de requerimientos profundos",
  },
];

const mockProviders: BotProviderOption[] = [
  { id: "prov-anthropic", code: "anthropic", name: "Anthropic" },
  { id: "prov-openai", code: "openai", name: "OpenAI" },
  { id: "prov-google", code: "google", name: "Google Vertex / Gemini" },
];

const mockModels: BotModelOption[] = [
  {
    id: "mod-sonnet",
    providerId: "prov-anthropic",
    modelId: "claude-3-5-sonnet",
    displayName: "Claude 3.5 Sonnet",
  },
  {
    id: "mod-gpt4o",
    providerId: "prov-openai",
    modelId: "gpt-4o",
    displayName: "GPT-4o",
  },
  {
    id: "mod-flash",
    providerId: "prov-google",
    modelId: "gemini-2.0-flash",
    displayName: "Gemini 2.0 Flash",
  },
];

const mockChannels: BotChannelOption[] = [
  {
    id: "chan-whatsapp",
    code: "whatsapp_cloud",
    label: "WhatsApp Cloud Oficial",
    provisioning: "oauth",
    isConfigured: true,
    inboxId: 101,
    enabled: true,
  },
  {
    id: "chan-website",
    code: "website",
    label: "Widget Web Live Chat",
    provisioning: "api",
    isConfigured: true,
    inboxId: 102,
    enabled: true,
  },
  {
    id: "chan-instagram",
    code: "instagram",
    label: "Instagram Direct",
    provisioning: "oauth",
    isConfigured: false,
    enabled: false,
  },
];

const mockByokKeys: ByokKeyItem[] = [
  {
    id: "byok-01",
    providerId: "prov-anthropic",
    providerName: "Anthropic",
    maskedApiKey: "sk-ant-...wK9L",
    status: "active",
  },
];

/**
 * Página de configuración del Bot de Atención Automatizada (BOT-001 T-03, T-05, T-10).
 * Integra gobernanza de prompts, selección de presets/modelos, canales admisibles y credenciales BYOK.
 */
export default async function BotSettingsPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.bot" });

  const translations = {
    title: t("title"),
    subtitle: t("subtitle"),
    statusDraft: t("statusDraft"),
    statusActive: t("statusActive"),
    statusPaused: t("statusPaused"),
    labelName: t("labelName"),
    labelObjective: t("labelObjective"),
    labelTone: t("labelTone"),
    labelModelSelection: t("labelModelSelection"),
    modelStrategyPreset: t("modelStrategyPreset"),
    modelStrategyCustom: t("modelStrategyCustom"),
    labelPreset: t("labelPreset"),
    labelProvider: t("labelProvider"),
    labelModel: t("labelModel"),
    labelPersona: t("labelPersona"),
    labelGreeting: t("labelGreeting"),
    labelFallback: t("labelFallback"),
    labelAnswerPolicy: t("labelAnswerPolicy"),
    policyOnlyKnowledge: t("policyOnlyKnowledge"),
    policyFree: t("policyFree"),
    channelsSectionTitle: t("channelsSectionTitle"),
    channelsSectionDesc: t("channelsSectionDesc"),
    channelProvisionApi: t("channelProvisionApi"),
    channelProvisionOAuth: t("channelProvisionOAuth"),
    channelEnable: t("channelEnable"),
    channelDisable: t("channelDisable"),
    byokSectionTitle: t("byokSectionTitle"),
    byokSectionDesc: t("byokSectionDesc"),
    labelApiKey: t("labelApiKey"),
    saveKeyButton: t("saveKeyButton"),
    saveBotButton: t("saveBotButton"),
    activateBotButton: t("activateBotButton"),
    pauseBotButton: t("pauseBotButton"),
    saveSuccess: t("saveSuccess"),
  };

  return (
    <main className="min-h-screen bg-bg text-txt py-8">
      <BotConfigurationView
        initialBot={mockBotData}
        tones={mockTones}
        presets={mockPresets}
        providers={mockProviders}
        models={mockModels}
        channels={mockChannels}
        byokKeys={mockByokKeys}
        t={translations}
      />
    </main>
  );
}

