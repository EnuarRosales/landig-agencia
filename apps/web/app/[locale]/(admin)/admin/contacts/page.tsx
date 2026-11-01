import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { locales } from "@/i18n/routing";
import { ContactsDashboard, type CrmContactItem, type CrmQualityMetricsData } from "@/components/admin/crm/contacts-dashboard";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.contacts" });

  return {
    title: `${t("title")} | Mocter Admin`,
    description: t("subtitle"),
  };
}

const mockMetrics: CrmQualityMetricsData = {
  totalContacts: 142,
  accuracyRate: 98,
  uniquenessRate: 95,
  completenessRate: 92,
  recencyRate: 85,
  consentRate: 78,
};

const mockContacts: CrmContactItem[] = [
  {
    id: "cont-101",
    fullName: "Inversiones La Sabana SAS",
    email: "compras@sabana.com.co",
    phoneMobile: "+573001112233",
    documentType: "NIT",
    documentNumber: "901234567-8",
    stage: "qualified",
    source: "whatsapp",
    channel: "whatsapp",
    chatwootContactId: 4421,
    notes: "Interés alto en integración API y catálogo completo",
    lastSeenAt: "2026-10-29T16:00:00.000Z",
    consentStatus: "granted",
    hasCommercialConsent: true,
    policyVersion: "1.0.0",
  },
  {
    id: "cont-102",
    fullName: "Carlos Eduardo Mendoza",
    email: "carlos.mendoza@gmail.com",
    phoneMobile: "+573108889900",
    documentType: "CC",
    documentNumber: "79876543",
    stage: "in_conversation",
    source: "whatsapp",
    channel: "whatsapp",
    chatwootContactId: 4422,
    notes: "Preguntó por tiempos de envío a Medellín",
    lastSeenAt: "2026-10-30T11:20:00.000Z",
    consentStatus: "granted",
    hasCommercialConsent: false,
    policyVersion: "1.0.0",
  },
  {
    id: "cont-103",
    fullName: "Distribuidora El Triunfo",
    email: null,
    phoneMobile: "+573157776655",
    documentType: "NIT",
    documentNumber: "800999111-2",
    stage: "new",
    source: "manual",
    channel: "manual",
    chatwootContactId: null,
    notes: "Contacto ingresado en feria comercial",
    lastSeenAt: "2026-10-31T09:15:00.000Z",
    consentStatus: "pending",
    hasCommercialConsent: false,
    policyVersion: "1.0.0",
  },
];

/**
 * Vista de administración de prospectos y contactos del inquilino (CRM-001 T-09, RF-05.1, RF-05.3).
 */
export default async function ContactsPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.contacts" });

  const translations = {
    title: t("title"),
    subtitle: t("subtitle"),
    kpiAccuracy: t("kpiAccuracy"),
    kpiUniqueness: t("kpiUniqueness"),
    kpiCompleteness: t("kpiCompleteness"),
    kpiRecency: t("kpiRecency"),
    kpiConsent: t("kpiConsent"),
    searchPlaceholder: t("searchPlaceholder"),
    filterAllStages: t("filterAllStages"),
    stageNew: t("stageNew"),
    stageInConversation: t("stageInConversation"),
    stageQualified: t("stageQualified"),
    stageCustomer: t("stageCustomer"),
    stageDiscarded: t("stageDiscarded"),
    newContactButton: t("newContactButton"),
    tableContact: t("tableContact"),
    tableStage: t("tableStage"),
    tableChannel: t("tableChannel"),
    tableConsent: t("tableConsent"),
    tableLastSeen: t("tableLastSeen"),
    tableActions: t("tableActions"),
    consentGranted: t("consentGranted"),
    consentPending: t("consentPending"),
    consentRevoked: t("consentRevoked"),
    modalNewTitle: t("modalNewTitle"),
    modalEditTitle: t("modalEditTitle"),
    modalConsentTitle: t("modalConsentTitle"),
    labelFullName: t("labelFullName"),
    labelEmail: t("labelEmail"),
    labelPhoneMobile: t("labelPhoneMobile"),
    labelDocumentType: t("labelDocumentType"),
    labelDocumentNumber: t("labelDocumentNumber"),
    labelStage: t("labelStage"),
    labelSource: t("labelSource"),
    labelNotes: t("labelNotes"),
    saveButton: t("saveButton"),
    cancelButton: t("cancelButton"),
    closeButton: t("closeButton"),
    revokeConsentButton: t("revokeConsentButton"),
    grantConsentButton: t("grantConsentButton"),
    anonymizeButton: t("anonymizeButton"),
    confirmAnonymizeTitle: t("confirmAnonymizeTitle"),
    confirmAnonymizeDesc: t("confirmAnonymizeDesc"),
    confirmAnonymizeAction: t("confirmAnonymizeAction"),
    emptyState: t("emptyState"),
  };

  return (
    <main className="min-h-screen bg-background py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <ContactsDashboard
          initialContacts={mockContacts}
          initialMetrics={mockMetrics}
          t={translations}
        />
      </div>
    </main>
  );
}
