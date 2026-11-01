import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { locales } from "@/i18n/routing";
import { ChatwootEmbeddedView } from "@/components/admin/chatwoot/chatwoot-embedded-view";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.conversations" });

  return {
    title: `${t("title")} | Mocter Admin`,
    description: t("subtitle"),
  };
}

/**
 * Vista de conversaciones y bandeja de atención al cliente embebida en mocter-admin (ADM-001 T-36, D-32, RF-02.4).
 * Presenta Chatwoot en un iframe same-site manteniendo al operador dentro de la shell unificada.
 */
export default async function ConversationsAdminPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const sParams = await searchParams;
  const clientId =
    typeof sParams?.client_id === "string" ? sParams.client_id : "01930000-0000-7000-8000-000000000001";

  const t = await getTranslations({ locale, namespace: "admin.conversations" });

  return (
    <main className="min-h-screen bg-bg text-txt">
      <ChatwootEmbeddedView
        clientId={clientId}
        t={{
          title: t("title"),
          subtitle: t("subtitle"),
          loading: t("loading"),
          errorTitle: t("errorTitle"),
          errorMessage: t("errorMessage"),
          retryButton: t("retryButton"),
          reconnectButton: t("reconnectButton"),
        }}
      />
    </main>
  );
}

