import type {
  CellContact,
  NewCellContact,
  CellContactRating,
  NewCellContactRating,
  CellContactAddress,
  NewCellContactAddress,
  CellProspectConsent,
  NewCellProspectConsent,
  CellPrivacyNotice,
  NewCellPrivacyNotice,
  CellContactMemory,
  NewCellContactMemory,
} from "../db/schemas/tenant/crm";
import type {
  ContactSource,
  ContactStage,
  WhatsappWindowStatus,
} from "../services/crm-omnichannel.helpers";

/**
 * Criterios de ordenamiento soportados para el listado CRM (`SPEC-09`).
 */
export type ContactListSortBy =
  | "whatsapp_priority"
  | "last_inbound"
  | "created_at"
  | "rating"
  | "full_name";

/**
 * Filtros de búsqueda, segmentación omnicanal y paginación para el maestro de prospectos y contactos.
 */
export interface ListContactsFilter {
  /** Búsqueda textual sobre nombre, empresa, teléfono, correo o ciudad. */
  query?: string;
  /** Filtro por etapa del embudo comercial. */
  stage?: ContactStage;
  /** Filtro por usuario agente asignado. */
  assignedUserId?: string;
  /** Filtro por origen de adquisición inicial (`source`). */
  source?: ContactSource;
  /** Filtro por canal preferido o último canal activo. */
  channel?: string;
  /** Filtro por estado de la ventana de atención de 24h de WhatsApp. */
  whatsappWindow?: WhatsappWindowStatus;
  /** Calificación mínima en estrellas (1..5). */
  minRating?: number;
  /** Criterio de ordenamiento (por defecto prioridad WhatsApp o creación). */
  sortBy?: ContactListSortBy;
  /** Dirección de ordenamiento. */
  sortDir?: "asc" | "desc";
  /** Incluir registros suprimidos o anonimizados (por defecto false). */
  includeDeleted?: boolean;
  /** Límite de paginación. */
  limit?: number;
  /** Desplazamiento de paginación. */
  offset?: number;
}

/**
 * Criterios de búsqueda para detección de contactos duplicados activos en el comercio.
 */
export interface ContactDuplicateCriteria {
  phoneMobile?: string | null;
  email?: string | null;
  documentType?: string | null;
  documentNumber?: string | null;
  excludeContactId?: string;
}

/**
 * Entrada de creación o actualización de dirección de un contacto (`SPEC-09`).
 */
export interface ContactAddressWriteInput {
  label: string;
  country?: string;
  countryCode?: string | null;
  state?: string | null;
  subdivisionCode?: string | null;
  city: string;
  addressLine: string;
  addressComplement?: string | null;
  neighborhood?: string | null;
  postalCode?: string | null;
  referenceNotes?: string | null;
  isDefault?: boolean;
  actor: string;
}

/**
 * Resumen compacto de pedidos recientes asociados al contacto (`SPEC-09`).
 */
export interface ContactRecentOrderSummary {
  id: string;
  number: string;
  status: string;
  paymentStatus: string;
  totalCents: number;
  currency: string;
  createdAt: string;
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
 * Contrato de repositorio para el dominio de CRM, contactos, calificaciones, direcciones y consentimientos en celdas de datos.
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

  /** Consulta un prospecto activo por su identificador UUID en la celda. */
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

  /** Consulta prospectos activos por coincidencia exacta de teléfono móvil E.164. */
  findContactsByPhone(
    cellId: string,
    clientId: string,
    phoneMobile: string,
  ): Promise<CellContact[]>;

  /** Consulta prospectos activos por coincidencia exacta de correo electrónico normalizado. */
  findContactsByEmail?(
    cellId: string,
    clientId: string,
    email: string,
  ): Promise<CellContact[]>;

  /** Busca un contacto activo duplicado por teléfono, correo o documento. */
  findActiveDuplicateContact?(
    cellId: string,
    clientId: string,
    criteria: ContactDuplicateCriteria,
  ): Promise<CellContact | null>;

  /** Lista contactos aplicando filtros omnicanal, ordenamiento y paginación bajo RLS. */
  listContacts(
    cellId: string,
    clientId: string,
    filters?: ListContactsFilter,
  ): Promise<{ items: CellContact[]; total: number }>;

  /** Ejecuta borrado lógico preservando historial de pedidos (`SPEC-09 RN-07`). */
  softDeleteContact?(
    cellId: string,
    clientId: string,
    id: string,
    deletedBy: string,
  ): Promise<CellContact | null>;

  /** Ejecuta la baja lógica con anonimización irreversible (Habeas Data D-04, Ley 1581). */
  anonymizeContact(
    cellId: string,
    clientId: string,
    id: string,
    deletedBy: string,
  ): Promise<CellContact | null>;

  /** Inserta una calificación histórica y actualiza la cabecera del contacto en transacción (`SPEC-09`). */
  addContactRating?(
    cellId: string,
    clientId: string,
    rating: Omit<NewCellContactRating, "clientId">,
  ): Promise<{ rating: CellContactRating; contact: CellContact } | null>;

  /** Lista el historial cronológico descendente de calificaciones de un contacto (`SPEC-09`). */
  listContactRatings?(
    cellId: string,
    clientId: string,
    contactId: string,
  ): Promise<CellContactRating[]>;

  /** Lista todas las direcciones guardadas de un contacto (`SPEC-09`). */
  listContactAddresses?(
    cellId: string,
    clientId: string,
    contactId: string,
  ): Promise<CellContactAddress[]>;

  /** Crea una dirección garantizando única predeterminada y sincronía con `contacts` (`SPEC-09`). */
  createContactAddress?(
    cellId: string,
    clientId: string,
    contactId: string,
    input: ContactAddressWriteInput,
  ): Promise<CellContactAddress>;

  /** Actualiza una dirección manteniendo invariante de única predeterminada (`SPEC-09`). */
  updateContactAddress?(
    cellId: string,
    clientId: string,
    contactId: string,
    addressId: string,
    input: Partial<ContactAddressWriteInput> & { actor: string },
  ): Promise<CellContactAddress | null>;

  /** Elimina una dirección y promueve otra como predeterminada si quedan restantes (`SPEC-09`). */
  deleteContactAddress?(
    cellId: string,
    clientId: string,
    contactId: string,
    addressId: string,
    actor: string,
  ): Promise<{ deleted: boolean; promotedAddressId: string | null }>;

  /** Obtiene direcciones predeterminadas en lote para un conjunto de contactos (`SPEC-09`). */
  listDefaultAddressesByContactIds?(
    cellId: string,
    clientId: string,
    contactIds: string[],
  ): Promise<Map<string, CellContactAddress>>;

  /** Lista pedidos recientes asociados al contacto (`SPEC-09`). */
  listRecentOrdersForContact?(
    cellId: string,
    clientId: string,
    contactId: string,
    limit?: number,
  ): Promise<ContactRecentOrderSummary[]>;

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
