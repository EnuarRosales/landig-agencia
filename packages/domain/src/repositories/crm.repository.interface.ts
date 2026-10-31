import type {
  CellContact,
  NewCellContact,
  CellProspectConsent,
  NewCellProspectConsent,
  CellPrivacyNotice,
  NewCellPrivacyNotice,
  CellContactMemory,
  NewCellContactMemory,
} from "../db/schemas/tenant/crm";

/**
 * Filtros de búsqueda y paginación para el maestro de prospectos y contactos.
 */
export interface ListContactsFilter {
  /** Búsqueda textual sobre nombre, teléfono o correo. */
  query?: string;
  /** Filtro por etapa del embudo comercial. */
  stage?: "new" | "in_conversation" | "qualified" | "customer" | "discarded";
  /** Filtro por usuario agente asignado. */
  assignedUserId?: string;
  /** Filtro por canal o fuente de adquisición. */
  source?: "whatsapp" | "web" | "email" | "manual" | "referral" | "other";
  /** Incluir registros suprimidos o anonimizados (por defecto false). */
  includeDeleted?: boolean;
  /** Límite de paginación. */
  limit?: number;
  /** Desplazamiento de paginación. */
  offset?: number;
}

/**
 * Métricas cuantitativas de calidad de datos del CRM por inquilino (CRM-001 §4, RF-05.1).
 */
export interface CrmQualityMetrics {
  /** Total de prospectos analizados. */
  totalContacts: number;
  /** Porcentaje de registros con formatos válidos (E.164, email normalizado, documento). */
  accuracyRate: number;
  /** Porcentaje de registros únicos sin duplicidad detectada en teléfono o correo. */
  uniquenessRate: number;
  /** Porcentaje de prospectos con nombre y al menos un canal de contacto. */
  completenessRate: number;
  /** Porcentaje de prospectos con interacción en los últimos 90 días. */
  recencyRate: number;
  /** Porcentaje de prospectos con consentimiento comercial vigente otorgado. */
  consentRate: number;
}

/**
 * Contrato de repositorio para el dominio de CRM, contactos y consentimientos en celdas de datos.
 */
export interface ICrmRepository {
  /** Crea un prospecto o contacto en la celda del inquilino fijando el contexto RLS. */
  createContact(
    cellId: string,
    clientId: string,
    contact: Omit<NewCellContact, "clientId">,
  ): Promise<CellContact>;

  /** Actualiza atributos de un contacto respetando el aislamiento RLS del inquilino. */
  updateContact(
    cellId: string,
    clientId: string,
    id: string,
    patch: Partial<Omit<NewCellContact, "id" | "clientId">>,
  ): Promise<CellContact | null>;

  /** Consulta un prospecto por su identificador UUID en la celda. */
  findContactById(
    cellId: string,
    clientId: string,
    id: string,
  ): Promise<CellContact | null>;

  /** Consulta un prospecto por su ID de contacto correlacionado en Chatwoot. */
  findContactByChatwootId(
    cellId: string,
    clientId: string,
    chatwootContactId: number,
  ): Promise<CellContact | null>;

  /** Consulta prospectos por coincidencia exacta de teléfono móvil E.164. */
  findContactsByPhone(
    cellId: string,
    clientId: string,
    phoneMobile: string,
  ): Promise<CellContact[]>;

  /** Lista contactos aplicando filtros y paginación bajo RLS. */
  listContacts(
    cellId: string,
    clientId: string,
    filters?: ListContactsFilter,
  ): Promise<{ items: CellContact[]; total: number }>;

  /** Ejecuta la baja lógica con anonimización irreversible (Habeas Data D-04, Ley 1581). */
  anonymizeContact(
    cellId: string,
    clientId: string,
    id: string,
    deletedBy: string,
  ): Promise<CellContact | null>;

  /** Registra un nuevo otorgamiento o revocación en el historial inmutable de consentimientos. */
  createConsent(
    cellId: string,
    clientId: string,
    consent: Omit<NewCellProspectConsent, "clientId">,
  ): Promise<CellProspectConsent>;

  /** Consulta el consentimiento activo vigente para un prospecto y propósito determinado. */
  findActiveConsent(
    cellId: string,
    clientId: string,
    prospectId: string,
    purpose: "data_treatment" | "commercial_comms",
  ): Promise<CellProspectConsent | null>;

  /** Revoca formalmente un consentimiento vigente registrando marca de tiempo. */
  revokeConsent(
    cellId: string,
    clientId: string,
    consentId: string,
    revokedBy: string,
  ): Promise<CellProspectConsent | null>;

  /** Lista la totalidad de eventos de consentimiento otorgados o revocados para un prospecto. */
  listConsentsByProspect(
    cellId: string,
    clientId: string,
    prospectId: string,
  ): Promise<CellProspectConsent[]>;

  /** Crea o registra una nueva versión de aviso de privacidad para el inquilino. */
  createPrivacyNotice(
    cellId: string,
    clientId: string,
    notice: Omit<NewCellPrivacyNotice, "clientId">,
  ): Promise<CellPrivacyNotice>;

  /** Consulta el aviso de privacidad publicado y vigente para el inquilino en un idioma dado. */
  findPublishedPrivacyNotice(
    cellId: string,
    clientId: string,
    locale: "es" | "en",
  ): Promise<CellPrivacyNotice | null>;

  /** Guarda o actualiza la ficha viva 1:1 de perfil de un contacto en memorias desacopladas. */
  upsertContactProfile(
    cellId: string,
    clientId: string,
    contactId: string,
    profile: Omit<NewCellContactMemory, "clientId" | "contactId" | "kind">,
  ): Promise<CellContactMemory>;

  /** Agrega un nuevo episodio histórico 1:N a la memoria del contacto. */
  appendContactEpisode(
    cellId: string,
    clientId: string,
    contactId: string,
    episode: Omit<NewCellContactMemory, "clientId" | "contactId" | "kind">,
  ): Promise<CellContactMemory>;

  /** Calcula en caliente los cinco indicadores de calidad de datos del inquilino. */
  getQualityMetrics(
    cellId: string,
    clientId: string,
  ): Promise<CrmQualityMetrics>;
}
