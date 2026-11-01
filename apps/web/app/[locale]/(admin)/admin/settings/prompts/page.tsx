import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { locales } from "@/i18n/routing";
import { PromptLibraryTable } from "@/components/admin/ai-assist/prompt-library-table";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.promptLibrary" });

  return {
    title: `${t("title")} | Mocter Admin`,
    description: t("subtitle"),
  };
}

/**
 * Vista administrativa de la biblioteca de prompts maestros de AI Assist (AI-001 T-03, RF-02).
 */
export default async function PromptLibrarySettingsPage({ params }: Props) {
  return (
    <main className="min-h-screen bg-background py-8">
      <PromptLibraryTable
        userRole="platform_admin"
        fields={[
          {
            fieldKey: "bot.objective",
            entity: "tenant_bots",
            columnName: "objective",
            labels: { es: "Objetivo Del Bot", en: "Bot Objective" },
            isActive: true,
            totalVersions: 2,
            activePrompt: {
              id: "prompt-1",
              version: 2,
              masterPrompt:
                "Eres un especialista en diseño conversacional. Transforma el borrador en un objetivo operativo directo y medible.",
              inputHint: "Describe qué quieres que logre el bot al interactuar con tus clientes.",
              status: "active",
            },
          },
          {
            fieldKey: "bot.tone",
            entity: "tenant_bots",
            columnName: "tone",
            labels: { es: "Tono Y Voz", en: "Tone And Voice" },
            isActive: true,
            totalVersions: 1,
            activePrompt: {
              id: "prompt-2",
              version: 1,
              masterPrompt:
                "Eres un director de marca y tono. Ajusta las directivas de tono asegurando calidez, profesionalismo y cercanía.",
              inputHint: "Indica cómo debe hablar tu bot (ej. formal, relajado, alegre).",
              status: "active",
            },
          },
          {
            fieldKey: "product.description",
            entity: "products",
            columnName: "description",
            labels: { es: "Descripción Del Producto", en: "Product Description" },
            isActive: true,
            totalVersions: 1,
            activePrompt: {
              id: "prompt-3",
              version: 1,
              masterPrompt:
                "Eres un copywriter de e-commerce. Transforma características técnicas en beneficios claros y atractivos para el comprador.",
              inputHint: "Detalla las características clave, materiales o ventajas de tu producto.",
              status: "active",
            },
          },
        ]}
      />
    </main>
  );
}
